(function (root) {
  'use strict';
  const P = {};
  const pad = n => String(n).padStart(2, '0');
  P.pad = pad;
  P.WD_SHORT = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
  P.WD_LONG = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
  P.MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  P.MESI_S = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

  P.ds = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  P.pd = s => { const a = s.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2], 12, 0, 0); };
  P.addDays = (s, n) => { const d = P.pd(s); d.setDate(d.getDate() + n); return P.ds(d); };
  P.diffDays = (a, b) => Math.round((P.pd(b) - P.pd(a)) / 86400000);
  P.wd = s => (P.pd(s).getDay() + 6) % 7;
  P.tm = t => { const a = t.split(':').map(Number); return a[0] * 60 + a[1]; };
  P.ts = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  P.uid = () => Math.random().toString(36).slice(2, 10);
  P.fmtDay = d => { const x = P.pd(d); return P.WD_SHORT[P.wd(d)] + ' ' + x.getDate() + ' ' + P.MESI_S[x.getMonth()]; };
  P.fullDay = d => { const x = P.pd(d); return P.WD_LONG[P.wd(d)] + ' ' + x.getDate() + ' ' + P.MESI[x.getMonth()]; };
  P.hm = min => {
    min = Math.round(min);
    if (min < 60) return min + ' min';
    const h = Math.floor(min / 60), m = min % 60;
    return h + ' h' + (m ? ' ' + m + ' min' : '');
  };

  P.defaultSettings = () => ({
    phases: [
      { id: 'ph1', name: 'Leggere e evidenziare', minPerPage: 4, repeat: false },
      { id: 'ph2', name: 'Schema a mano', minPerPage: 3, repeat: false },
      { id: 'ph3', name: 'Studiare', minPerPage: 4, repeat: false },
      { id: 'ph4', name: 'Ripasso', minPerPage: 2, repeat: true }
    ],
    kinds: [
      { id: 'app', name: 'Appuntamento', c: '#4F7CAC' },
      { id: 'lavoro', name: 'Lavoro', c: '#C98A2E' },
      { id: 'altro', name: 'Altro', c: '#7A8F83' }
    ],
    winStart: '09:00', winEnd: '21:00', maxHours: 4, dayHours: {}, maxBlock: 90, minBlock: 20, breakMin: 10, offDays: []
  });
  P.defaultState = () => ({ v: 1, events: [], exams: [], sessions: [], progress: {}, evDone: {}, notices: [], notes: [], settings: P.defaultSettings() });
  P.migrate = st => {
    const d = P.defaultState();
    st = st || {};
    Object.keys(d).forEach(k => { if (st[k] === undefined) st[k] = d[k]; });
    st.settings = Object.assign(P.defaultSettings(), st.settings || {});
    if (!Array.isArray(st.settings.phases) || !st.settings.phases.length) st.settings.phases = P.defaultSettings().phases;
    if (!st.settings.dayHours || typeof st.settings.dayHours !== 'object') st.settings.dayHours = {};
    if (!Array.isArray(st.settings.kinds) || !st.settings.kinds.length) st.settings.kinds = P.defaultSettings().kinds;
    return st;
  };

  P.occursOn = (ev, d) => {
    if (d < ev.date) return false;
    if (ev.until && d > ev.until) return false;
    switch (ev.repeat || 'none') {
      case 'daily': return true;
      case 'weekly': {
        const days = ev.days && ev.days.length ? ev.days : [P.wd(ev.date)];
        return days.indexOf(P.wd(d)) >= 0;
      }
      case 'monthly': return P.pd(d).getDate() === P.pd(ev.date).getDate();
      default: return d === ev.date;
    }
  };
  P.eventsOn = (st, d) => st.events.filter(e => P.occursOn(e, d)).map(e => ({
    ev: e,
    start: e.allDay ? 0 : P.tm(e.start),
    end: e.allDay ? 1440 : P.tm(e.end)
  })).sort((a, b) => a.start - b.start);

  P.unitsForExam = (st, exam) => {
    let phases = st.settings.phases;
    if (Array.isArray(exam.phases)) { const sel = phases.filter(ph => exam.phases.indexOf(ph.id) >= 0); if (sel.length) phases = sel; }
    const units = [];
    const maxPass = Math.max(1, ...exam.topics.map(t => t.passes || 1));
    for (let pass = 1; pass <= maxPass; pass++) {
      phases.forEach(ph => {
        if (pass > 1 && !ph.repeat) return;
        exam.topics.forEach(t => {
          if (pass > (t.passes || 1)) return;
          const pages = t.pages > 0 ? t.pages : 10;
          let min = Math.round(pages * ph.minPerPage / 5) * 5;
          if (min < 15) min = 15;
          units.push({
            key: exam.id + '|' + t.id + '|' + pass + '|' + ph.id, examId: exam.id, topicId: t.id,
            topicName: t.name, phaseId: ph.id, phaseName: ph.name, pass: pass, minutes: min
          });
        });
      });
    }
    return units;
  };
  P.unitMap = st => {
    const m = {};
    st.exams.forEach(ex => P.unitsForExam(st, ex).forEach(u => { m[u.key] = u; }));
    return m;
  };
  P.unitLabel = u => u.topicName + ' · ' + u.phaseName + (u.pass > 1 ? ' (' + u.pass + '° passaggio)' : '');
  P.examProgress = (st, ex) => {
    let done = 0, total = 0;
    P.unitsForExam(st, ex).forEach(u => { total += u.minutes; done += Math.min(u.minutes, st.progress[u.key] || 0); });
    return { done: done, total: total, pct: total ? Math.round(done * 100 / total) : 0 };
  };

  function subtract(slots, a, b) {
    const out = [];
    slots.forEach(s => {
      if (b <= s.start || a >= s.end) { out.push(s); return; }
      if (a > s.start) out.push({ start: s.start, end: a });
      if (b < s.end) out.push({ start: b, end: s.end });
    });
    return out;
  }
  function baseSlots(st, d, fromMin) {
    const s = st.settings;
    let slots = [{ start: Math.max(P.tm(s.winStart), fromMin || 0), end: P.tm(s.winEnd) }];
    if (slots[0].end <= slots[0].start) return [];
    P.eventsOn(st, d).forEach(e => { slots = subtract(slots, e.start, e.end); });
    return slots;
  }
  /* minuti di studio consentiti in un giorno: ore del giorno (o quelle di solito) meno la durata degli appuntamenti (il lavoro non si toglie) */
  P.dayLimit = (st, d) => {
    const s = st.settings, dh = s.dayHours && s.dayHours[P.wd(d)];
    const hours = typeof dh === 'number' && dh >= 0 ? dh : s.maxHours;
    const iv = P.eventsOn(st, d).filter(e => !e.ev.allDay && e.ev.kind !== 'lavoro').map(e => [e.start, e.end]).sort((a, b) => a[0] - b[0]);
    let busy = 0, cs = null, ce = null;
    iv.forEach(x => { if (cs === null) { cs = x[0]; ce = x[1]; } else if (x[0] <= ce) ce = Math.max(ce, x[1]); else { busy += ce - cs; cs = x[0]; ce = x[1]; } });
    if (cs !== null) busy += ce - cs;
    return Math.max(0, Math.round(hours * 60) - busy);
  };
  const nowInfo = now => {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return { today: P.ds(now), nowMin: nowMin, from15: Math.ceil(nowMin / 15) * 15 };
  };

  P.computePlan = (st, now) => {
    const ni = nowInfo(now), today = ni.today, s = st.settings, minBlock = s.minBlock || 20;
    const umap = P.unitMap(st);
    const kept = st.sessions.filter(x => umap[x.unitKey] || x.status === 'done');
    const days = {};
    function day(d) {
      if (!days[d]) {
        let slots = baseSlots(st, d, d === today ? ni.from15 : 0), used = 0;
        kept.forEach(x => { if (x.date === d) { slots = subtract(slots, x.start, x.end); used += x.end - x.start; } });
        days[d] = { slots: slots.filter(z => z.end - z.start >= minBlock), used: used, limit: P.dayLimit(st, d) };
      }
      return days[d];
    }
    const pinned = {};
    kept.forEach(x => { if (x.status === 'accepted') pinned[x.unitKey] = (pinned[x.unitKey] || 0) + (x.end - x.start); });
    const exams = st.exams.filter(e => e.date > today).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    const proposals = [], warnings = [];
    exams.forEach(ex => {
      let missing = 0;
      P.unitsForExam(st, ex).forEach(u => {
        let rem = u.minutes - (st.progress[u.key] || 0) - (pinned[u.key] || 0);
        for (let d = today; d < ex.date && rem > 0; d = P.addDays(d, 1)) {
          if (s.offDays.indexOf(P.wd(d)) >= 0) continue;
          const dd = day(d);
          for (let i = 0; i < dd.slots.length && rem > 0;) {
            const cap = dd.limit - dd.used;
            if (cap <= 0) break;
            const slot = dd.slots[i];
            const len = Math.min(slot.end - slot.start, s.maxBlock, rem, cap);
            if (len <= 0) { i++; continue; }
            proposals.push({ id: 'p' + proposals.length, unitKey: u.key, date: d, start: slot.start, end: slot.start + len, status: 'proposed' });
            rem -= len; dd.used += len;
            slot.start += len + (s.breakMin || 0);
            if (slot.end - slot.start < minBlock) dd.slots.splice(i, 1);
          }
        }
        if (rem > 0) missing += rem;
      });
      if (missing > 0) warnings.push({ examId: ex.id, missing: missing });
    });
    const sessions = kept.concat(proposals).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
    return { sessions: sessions, proposals: proposals, warnings: warnings, units: umap };
  };

  P.reconcile = (st, now) => {
    const ni = nowInfo(now), umap = P.unitMap(st), moved = [];
    st.sessions = st.sessions.filter(x => {
      if (x.status === 'done') return true;
      if (!umap[x.unitKey]) return false;
      if (x.date < ni.today || (x.date === ni.today && x.end <= ni.nowMin)) return false;
      const clash = P.eventsOn(st, x.date).find(e => e.start < x.end && e.end > x.start);
      if (clash) { moved.push({ id: x.id, unitKey: x.unitKey, date: x.date, start: x.start, title: clash.ev.title }); return false; }
      return true;
    });
    const plan = P.computePlan(st, now);
    moved.forEach(m => {
      if (st.notices.some(n => n.id === 'mv' + m.id)) return;
      const label = P.unitLabel(umap[m.unitKey]);
      const nu = plan.proposals.find(p => p.unitKey === m.unitKey);
      const text = nu
        ? 'Ho spostato «' + label + '» da ' + P.fmtDay(m.date) + ' alle ' + P.ts(m.start) + ' a ' + P.fmtDay(nu.date) + ' alle ' + P.ts(nu.start) + ', perché c\'è «' + m.title + '».'
        : '«' + label + '» non entra più: c\'è «' + m.title + '» e non ho trovato un altro spazio libero.';
      st.notices.push({ id: 'mv' + m.id, text: text, ts: Date.now() });
    });
    return plan;
  };

  P.accept = (st, p) => { st.sessions.push({ id: P.uid(), unitKey: p.unitKey, date: p.date, start: p.start, end: p.end, status: 'accepted' }); };
  P.unaccept = (st, id) => { st.sessions = st.sessions.filter(x => x.id !== id); };
  P.markDone = (st, sess) => {
    const u = P.unitMap(st)[sess.unitKey], len = sess.end - sess.start;
    const rec = st.sessions.find(x => x.id === sess.id);
    if (rec) rec.status = 'done';
    else st.sessions.push({ id: P.uid(), unitKey: sess.unitKey, date: sess.date, start: sess.start, end: sess.end, status: 'done' });
    if (u) st.progress[u.key] = Math.min(u.minutes, (st.progress[u.key] || 0) + len);
  };
  P.undoDone = (st, id) => {
    const x = st.sessions.find(y => y.id === id);
    if (!x) return;
    st.sessions = st.sessions.filter(y => y.id !== id);
    st.progress[x.unitKey] = Math.max(0, (st.progress[x.unitKey] || 0) - (x.end - x.start));
  };
  P.toggleUnit = (st, u) => {
    if ((st.progress[u.key] || 0) >= u.minutes) {
      st.progress[u.key] = 0;
    } else {
      st.progress[u.key] = u.minutes;
      st.sessions = st.sessions.filter(x => !(x.unitKey === u.key && x.status === 'accepted'));
    }
  };
  P.candidateSlots = (st, sess, now, count) => {
    const ni = nowInfo(now), umap = P.unitMap(st), u = umap[sess.unitKey], len = sess.end - sess.start;
    const ex = u && st.exams.find(e => e.id === u.examId);
    const last = ex ? P.addDays(ex.date, -1) : P.addDays(ni.today, 14);
    const out = [];
    for (let d = ni.today; d <= last && out.length < count; d = P.addDays(d, 1)) {
      let slots = baseSlots(st, d, d === ni.today ? ni.from15 : 0);
      st.sessions.forEach(x => { if (x.date === d && x.id !== sess.id) slots = subtract(slots, x.start, x.end); });
      for (const z of slots) {
        if (z.end - z.start >= len && !(d === sess.date && z.start === sess.start)) {
          out.push({ date: d, start: z.start, end: z.start + len });
          if (out.length >= count) break;
        }
      }
    }
    return out;
  };
  P.moveTo = (st, sess, slot) => {
    st.sessions = st.sessions.filter(x => x.id !== sess.id);
    st.sessions.push({ id: P.uid(), unitKey: sess.unitKey, date: slot.date, start: slot.start, end: slot.end, status: 'accepted' });
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = P; else root.Plan = P;
})(typeof window !== 'undefined' ? window : globalThis);
