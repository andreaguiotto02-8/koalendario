/* Koalendario - lettura di appunti (PDF o testo) per ricavare gli argomenti di un esame.
   Tutto avviene sul telefono: il file non viene mai inviato da nessuna parte. */
(function (root) {
  'use strict';
  const T = {};
  const HEAD_RE = /^(capitolo|cap\.|unit[àa]|lezione|parte|modulo|sezione|argomento)\s+([0-9]+|[IVXLC]+)\b/i;
  const NUM_RE = /^[0-9]{1,2}(\.[0-9]{1,2})?[.)]?\s+[A-ZÀ-ÖØ-Þ]/;
  const MAX_TOPICS = 40;
  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
  const letters = s => (s.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  const key = s => s.toLowerCase().replace(/[^a-zà-ÿ]/g, '');

  function bodySize(pages) {
    const w = {};
    pages.forEach(p => p.lines.forEach(l => { const k = Math.round(l.size * 2) / 2; w[k] = (w[k] || 0) + l.t.length; }));
    let best = 0, bs = 10;
    Object.keys(w).forEach(k => { if (w[k] > best) { best = w[k]; bs = +k; } });
    return bs;
  }

  /* da una lista di titoli {name, page} costruisce gli argomenti con le pagine */
  T.buildTopics = function (heads, total) {
    heads = heads.filter(h => clean(h.name)).sort((a, b) => a.page - b.page);
    if (!heads.length) return [];
    const out = [], seen = {};
    const first = heads[0].page;
    if (first >= 4) out.push({ name: 'Prime pagine', pages: first });
    heads.forEach((h, i) => {
      const end = i + 1 < heads.length ? heads[i + 1].page : total;
      let name = clean(h.name).slice(0, 80);
      seen[name] = (seen[name] || 0) + 1;
      if (seen[name] > 1) name += ' (' + seen[name] + ')';
      out.push({ name: name, pages: Math.max(1, end - h.page) });
    });
    return out;
  };

  T.blocks = function (total) {
    const out = [], step = 20;
    for (let s = 1; s <= total; s += step) {
      const e = Math.min(total, s + step - 1);
      out.push({ name: 'Pagine ' + s + '–' + e, pages: e - s + 1 });
    }
    return out;
  };

  /* pages: [{lines:[{t:testo, size:numero}]}] in ordine di lettura */
  T.fromPages = function (pages) {
    const total = pages.length, body = bodySize(pages);
    const count = {};
    pages.forEach(p => { const s = {}; p.lines.forEach(l => { s[key(l.t)] = 1; }); Object.keys(s).forEach(k => { count[k] = (count[k] || 0) + 1; }); });
    const repeated = k => total >= 6 && count[k] > Math.max(3, total * 0.25);
    let cand = [];
    pages.forEach((p, pi) => {
      p.lines.forEach((l, li) => {
        const t = clean(l.t);
        if (t.length < 3 || t.length > 90 || letters(t) < 3) return;
        if (/\.{2,}\s*[0-9]+\s*$/.test(t)) return;
        if (repeated(key(t))) return;
        const big = l.size >= body * 1.18, pat = HEAD_RE.test(t) && l.size >= body * 0.95;
        const caps = t === t.toUpperCase() && letters(t) >= 4 && t.length <= 60 && l.size >= body * 0.98;
        const num = NUM_RE.test(t) && l.size >= body * 1.05 && t.length <= 70;
        if (!(big || pat || caps || num)) return;
        if (!pat && /[.,;:]$/.test(t)) return;
        cand.push({ name: t, page: pi, li: li, size: Math.round(l.size * 2) / 2, tier: big ? 'big' : 'x' });
      });
    });
    /* unisce righe consecutive dello stesso titolo */
    const merged = [];
    cand.forEach(c => {
      const last = merged[merged.length - 1];
      if (last && last.page === c.page && c.li === last.li + 1 && c.size === last.size && last.name.length + c.name.length < 100) { last.name += ' ' + c.name; last.li = c.li; }
      else merged.push(Object.assign({}, c));
    });
    cand = merged;
    if (!cand.length) return { mode: 'blocchi', total: total, topics: T.blocks(total) };
    let sizes = Array.from(new Set(cand.map(c => c.size))).sort((a, b) => b - a);
    /* un titolo unico e grande all'inizio è il titolo del documento */
    if (sizes.length > 1) {
      const top = cand.filter(c => c.size === sizes[0]);
      if (top.length === 1 && top[0].page <= 1 && cand.length > 4) { cand = cand.filter(c => c !== top[0]); sizes = sizes.slice(1); }
    }
    let chosen = [], used = 0;
    while (used < sizes.length) {
      chosen = cand.filter(c => c.size >= sizes[used]); used++;
      if (chosen.length >= 5) break;
    }
    while (chosen.length > MAX_TOPICS && used > 1) { used--; chosen = cand.filter(c => c.size >= sizes[used - 1]); }
    if (chosen.length < 2) return { mode: 'blocchi', total: total, topics: T.blocks(total) };
    return { mode: 'titoli', total: total, topics: T.buildTopics(chosen.map(c => ({ name: c.name, page: c.page })), total) };
  };

  /* testo semplice: le pagine si stimano dalle parole (circa 400 a pagina) */
  T.fromText = function (text) {
    const lines = String(text || '').split(/\r?\n/);
    const words = lines.reduce((n, l) => n + (l.trim() ? l.trim().split(/\s+/).length : 0), 0);
    const total = Math.max(1, Math.round(words / 400));
    if (words < 50) return { mode: 'vuoto', total: 0, topics: [] };
    let acc = 0;
    const heads = [];
    lines.forEach((raw, i) => {
      const t = clean(raw.replace(/^#{1,6}\s+/, ''));
      const md = /^#{1,3}\s+/.test(raw);
      const blank = j => j < 0 || j >= lines.length || !lines[j].trim();
      if (t && t.length >= 3 && t.length <= 80 && letters(t) >= 3 && !/[.,;:]$/.test(t)) {
        const isH = md || HEAD_RE.test(t) || (blank(i - 1) && blank(i + 1) && (NUM_RE.test(t) || (t === t.toUpperCase() && letters(t) >= 4) || /^[A-ZÀ-ÖØ-Þ0-9]/.test(t) && t.split(/\s+/).length <= 9));
        if (isH) heads.push({ name: t, page: Math.min(total - 1, Math.floor(acc / 400)), acc: acc });
      }
      if (t) acc += t.split(/\s+/).length;
    });
    let h = heads;
    if (h.length > MAX_TOPICS) { const strong = h.filter(x => HEAD_RE.test(x.name) || x.name === x.name.toUpperCase()); if (strong.length >= 3) h = strong; }
    if (h.length < 2 || h.length > 80) return { mode: 'blocchi', total: total, topics: T.blocks(total) };
    return { mode: 'titoli', total: total, topics: T.buildTopics(h, total) };
  };

  /* ---- PDF (solo nel browser) ---- */
  function loadLib() {
    return new Promise((resolve, reject) => {
      if (root.pdfjsLib) return resolve(root.pdfjsLib);
      const v = root.APP_VERSION || '0', s = document.createElement('script');
      s.src = 'vendor/pdf.min.js?v=' + v;
      s.onload = () => { root.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js?v=' + v; resolve(root.pdfjsLib); };
      s.onerror = () => reject(new Error('lib'));
      document.head.appendChild(s);
    });
  }
  T.readPdf = async function (file, onProgress) {
    const lib = await loadLib();
    const buf = await file.arrayBuffer();
    let pdf;
    try { pdf = await lib.getDocument({ data: buf }).promise; }
    catch (e) { if (e && e.name === 'PasswordException') throw new Error('protetto'); throw new Error('illeggibile'); }
    const total = pdf.numPages, pages = [];
    let chars = 0;
    for (let i = 1; i <= total; i++) {
      if (onProgress) onProgress(i, total);
      const page = await pdf.getPage(i), tc = await page.getTextContent(), lines = [];
      let cur = null;
      tc.items.forEach(it => {
        if (typeof it.str !== 'string') return;
        const size = Math.abs(it.transform[3]) || it.height || 10, y = it.transform[5];
        if (!cur || Math.abs(y - cur.y) > size * 0.4) { cur = { y: y, parts: [], size: 0, w: 0 }; lines.push(cur); }
        cur.parts.push(it.str);
        if (it.str.trim() && it.str.length >= cur.w) { cur.size = size; cur.w = it.str.length; }
      });
      const ls = lines.map(l => ({ t: clean(l.parts.join('')), size: l.size || 10 })).filter(l => l.t);
      ls.forEach(l => { chars += l.t.length; });
      pages.push({ lines: ls });
      if (page.cleanup) page.cleanup();
    }
    if (chars < Math.max(100, total * 30)) throw new Error('scansione');
    /* 1) segnalibri del PDF, se ci sono */
    try {
      const outline = await pdf.getOutline();
      if (outline && outline.length >= 2) {
        const heads = [];
        const walk = async (items, depth) => {
          for (const it of items) {
            let dest = it.dest;
            if (typeof dest === 'string') dest = await pdf.getDestination(dest);
            if (Array.isArray(dest) && dest[0] && typeof dest[0] === 'object') {
              const idx = await pdf.getPageIndex(dest[0]);
              heads.push({ name: it.title, page: idx, depth: depth });
            }
          }
        };
        await walk(outline, 0);
        let use = heads;
        if (use.length < 4) { const kids = []; for (const it of outline) if (it.items && it.items.length) kids.push.apply(kids, it.items); await walk(kids, 1); use = heads; }
        if (use.length > MAX_TOPICS) use = heads.filter(h => h.depth === 0);
        if (use.length >= 2 && use.length <= MAX_TOPICS) return { mode: 'segnalibri', total: total, topics: T.buildTopics(use, total) };
      }
    } catch (e) { /* si passa ai titoli */ }
    return T.fromPages(pages);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = T; else root.Topics = T;
})(typeof window !== 'undefined' ? window : globalThis);
