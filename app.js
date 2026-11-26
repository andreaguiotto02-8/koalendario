(function () {
  'use strict';
  const P = window.Plan, VER = window.APP_VERSION || '?';
  const KEY = 'koalendario.state.v1';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLORS = ['#E5594F', '#4F7CAC', '#C98A2E', '#8B6BB0', '#3F9A8C', '#D2689A'];
  const SWATCHES = ['#E5594F', '#E58A3C', '#C98A2E', '#8DA83C', '#4E8A66', '#3F9A8C', '#4F7CAC', '#6B6FC4', '#8B6BB0', '#D2689A'];
  const KINDS = () => state.settings.kinds;
  const kind = id => KINDS().find(k => k.id === id) || { id: id, name: 'Altro', c: '#7A8F83' };
  const ICONS = {
    oggi: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    esami: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
    idee: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
    opz: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'
  };
  const TABS = [['oggi', 'Oggi'], ['cal', 'Calendario'], ['esami', 'Esami'], ['idee', 'Idee'], ['opz', 'Opzioni']];

  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) return P.migrate(JSON.parse(raw)); } catch (e) {}
    return P.migrate(P.defaultState());
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  let state = load();
  state.tutorial = state.tutorial || {};
  state.usage = state.usage || { opens: 0, first: Date.now(), last: 0, screens: {}, actions: {} };
  state.usage.opens++; state.usage.last = Date.now();
  let view = 'oggi', ctx = null, openedSess = null, slotsCache = [], currentSheet = null, ideaType = 'funzione';
  let calMonth = P.ds(new Date()).slice(0, 7), selDay = P.ds(new Date());

  function tip(k, title, text) {
    if (state.tutorial[k]) return '';
    return '<div class="tip"><b>' + esc(title) + '</b><p>' + esc(text) + '</p><button class="btn ghost" data-act="tipOk" data-k="' + k + '">Ho capito</button></div>';
  }
  const isDone = (id, d) => !!(state.evDone && state.evDone[id + '|' + d]);
  function setDone(id, d, v) { state.evDone = state.evDone || {}; if (v) state.evDone[id + '|' + d] = true; else delete state.evDone[id + '|' + d]; }
  const examById = id => state.exams.find(e => e.id === id);

  /* ---------- elementi comuni ---------- */
  function dayItems(d) {
    const items = [];
    P.eventsOn(state, d).forEach(e => items.push({ t: 'ev', start: e.start, ev: e.ev, d: d }));
    ctx.plan.sessions.filter(x => x.date === d).forEach(x => items.push({ t: 'ses', start: x.start, s: x }));
    state.exams.filter(e => e.date === d).forEach(e => items.push({ t: 'ex', start: -1, ex: e }));
    return items.sort((a, b) => a.start - b.start);
  }
  function itemHTML(it) {
    if (it.t === 'ex') {
      return '<button class="row exam" data-act="openExam" data-id="' + it.ex.id + '"><span class="bar" style="background:' + it.ex.color + '"></span><span class="main"><b>Esame: ' + esc(it.ex.name) + '</b><small>Giorno dell\'esame</small></span></button>';
    }
    if (it.t === 'ev') {
      const e = it.ev;
      const tm = e.allDay ? '<span class="time">Tutto<small>il giorno</small></span>' : '<span class="time">' + e.start + '<small>' + e.end + '</small></span>';
      const dn = isDone(e.id, it.d);
      return '<div class="row' + (dn ? ' done' : '') + '" role="button" tabindex="0" data-act="editEvent" data-id="' + e.id + '" data-d="' + it.d + '">' + tm + '<span class="bar" style="background:' + kind(e.kind).c + '"></span><span class="main"><b>' + esc(e.title) + '</b><small>' + esc(kind(e.kind).name) + (e.repeat && e.repeat !== 'none' ? ' · si ripete' : '') + (dn ? ' · fatto ✓' : '') + '</small></span><button class="chk' + (dn ? ' on' : '') + '" data-act="evDone" data-id="' + e.id + '" data-d="' + it.d + '" aria-label="' + (dn ? 'Togli «fatto»' : 'Segna come fatto') + '">' + (dn ? '✓' : '') + '</button></div>';
    }
    const s = it.s, u = ctx.plan.units[s.unitKey], ex = u && examById(u.examId);
    if (!u) return '';
    const lab = { proposed: 'Proposta', accepted: 'Confermata', done: 'Fatto ✓' }[s.status];
    return '<button class="row ses ' + s.status + '" data-act="openSession" data-sid="' + s.id + '"><span class="time">' + P.ts(s.start) + '<small>' + P.ts(s.end) + '</small></span><span class="bar" style="background:' + (ex ? ex.color : '') + '"></span><span class="main"><b>' + esc(P.unitLabel(u)) + '</b><small>' + esc(ex ? ex.name : '') + ' · ' + P.hm(s.end - s.start) + '</small><span class="badge">' + lab + '</span></span></button>';
  }
  function examCard(ex) {
    const pr = P.examProgress(state, ex), left = P.diffDays(ctx.today, ex.date);
    const nxt = ctx.plan.sessions.find(x => { const u = ctx.plan.units[x.unitKey]; return u && u.examId === ex.id && x.status !== 'done' && (x.date > ctx.today || (x.date === ctx.today && x.end > ctx.nowMin)); });
    const when = left < 0 ? 'passato' : left === 0 ? 'oggi' : left === 1 ? 'domani' : 'tra ' + left + ' giorni';
    return '<button class="card" style="display:block;width:100%;text-align:left" data-act="openExam" data-id="' + ex.id + '"><b>' + esc(ex.name) + '</b> <small>· ' + P.fmtDay(ex.date) + ' (' + when + ')</small><div class="prog"><i style="width:' + pr.pct + '%;background:' + ex.color + '"></i></div><small>' + pr.pct + '% completato' + (nxt ? ' · prossima sessione ' + P.fmtDay(nxt.date) + ' alle ' + P.ts(nxt.start) : '') + '</small></button>';
  }

  /* ---------- schermate ---------- */
  function vOggi() {
    const today = ctx.today, plan = ctx.plan;
    let h = tip('t_oggi', 'Come funziona', 'Qui vedi la tua giornata: appuntamenti e sessioni di studio. Le sessioni con il bordo tratteggiato sono proposte dall\'app: toccane una per accettarla, segnarla come fatta o spostarla. Più in basso trovi a che punto sei con ogni esame.');
    h = '<div class="welcome">Benvenuta in Koalendario, il calendario dei koala ben organizzati 🐨</div>' + h + '<h1>' + P.fullDay(today) + '</h1>';
    state.notices.forEach(n => { h += '<div class="notice"><span>' + esc(n.text) + '</span><button data-act="dismiss" data-id="' + n.id + '" aria-label="Chiudi">✕</button></div>'; });
    plan.warnings.forEach(w => {
      const ex = examById(w.examId);
      if (ex) h += '<div class="warn"><span>Per «' + esc(ex.name) + '» mancano circa ' + P.hm(w.missing) + ' di studio prima dell\'esame. Libera qualche giornata o riduci gli argomenti.</span></div>';
    });
    const items = dayItems(today);
    h += '<h2>Oggi</h2>';
    h += items.length ? items.map(itemHTML).join('') : '<div class="empty-note">' + (state.exams.length ? 'Niente in programma per oggi.' : 'Niente in programma. Inizia aggiungendo un esame nella scheda Esami.') + '</div>';
    h += '<button class="btn ghost block" data-act="addEvent" data-d="' + today + '">+ Aggiungi appuntamento</button>';
    const up = state.exams.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    if (up.length) { h += '<h2>I tuoi esami</h2>' + up.map(examCard).join(''); }
    return h;
  }
  function vCal() {
    const parts = calMonth.split('-').map(Number), y = parts[0], m = parts[1];
    const first = y + '-' + P.pad(m) + '-01', lead = P.wd(first), dim = new Date(y, m, 0).getDate();
    let h = tip('t_cal', 'Il calendario', 'Tocca un giorno per vedere cosa c\'è e aggiungere un appuntamento. I puntini indicano: rosso = esame, verde = studio; gli appuntamenti hanno il colore del loro tipo.');
    h += '<div class="cal-head"><button data-act="calPrev" aria-label="Mese precedente">‹</button><b>' + P.MESI[m - 1] + ' ' + y + '</b><button data-act="calNext" aria-label="Mese successivo">›</button></div>';
    h += '<div class="grid">' + P.WD_SHORT.map(n => '<div class="dow">' + n + '</div>').join('');
    for (let i = 0; i < lead; i++) h += '<div class="cell empty"></div>';
    for (let d = 1; d <= dim; d++) {
      const ds = y + '-' + P.pad(m) + '-' + P.pad(d);
      const hasEx = state.exams.some(e => e.date === ds), evCols = Array.from(new Set(P.eventsOn(state, ds).map(x => kind(x.ev.kind).c))).slice(0, 3).map(cl => ({ c: cl, done: P.eventsOn(state, ds).filter(x => kind(x.ev.kind).c === cl).every(x => isDone(x.ev.id, ds)) })), hasS = ctx.plan.sessions.some(x => x.date === ds);
      h += '<button class="cell' + (ds === ctx.today ? ' today' : '') + (ds === selDay ? ' sel' : '') + '" data-act="selDay" data-d="' + ds + '"><span>' + d + '</span><i class="dots">' + (hasEx ? '<u class="dx"></u>' : '') + evCols.map(o => '<u class="de" style="background:' + o.c + (o.done ? ';opacity:.3' : '') + '"></u>').join('') + (hasS ? '<u class="ds"></u>' : '') + '</i></button>';
    }
    h += '</div><h2>' + P.fullDay(selDay) + '</h2>';
    const items = dayItems(selDay);
    h += items.length ? items.map(itemHTML).join('') : '<div class="empty-note">Niente in programma.</div>';
    h += '<button class="btn ghost block" data-act="addEvent" data-d="' + selDay + '">+ Aggiungi appuntamento</button>';
    return h;
  }
  function vEsami() {
    let h = tip('t_esami', 'I tuoi esami', 'Aggiungi un esame con la data e gli argomenti da studiare (scrivi le pagine se le sai). L\'app calcola da sola quando studiare ogni argomento, negli spazi liberi tra i tuoi impegni.');
    h += '<h1>Esami</h1>';
    const up = state.exams.filter(e => e.date >= ctx.today).sort((a, b) => a.date.localeCompare(b.date));
    const past = state.exams.filter(e => e.date < ctx.today).sort((a, b) => b.date.localeCompare(a.date));
    h += up.length ? up.map(examCard).join('') : '<div class="empty-note">Nessun esame in programma.</div>';
    h += '<button class="btn block" data-act="addExam">+ Nuovo esame</button>';
    if (past.length) h += '<h2>Passati</h2>' + past.map(examCard).join('');
    return h;
  }
  function vIdee() {
    let h = tip('t_idee', 'Idee e problemi', 'Scrivi qui cosa vorresti aggiungere all\'app, cosa cambieresti o cosa non funziona. Serve a migliorare Koalendario.');
    h += '<h1>Idee e problemi</h1>' + (getLink() ? '' : '<div class="notice"><span>Questo telefono non è ancora collegato: le tue idee restano qui finché non lo colleghi da Opzioni → Collegamento.</span></div>') + '<div class="chips" id="ideaTypes">';
    [['funzione', 'Funzione nuova'], ['cambio', 'Cambiare qualcosa'], ['problema', 'Problema']].forEach(t => { h += '<button class="chip' + (ideaType === t[0] ? ' on' : '') + '" data-act="ideaType" data-t="' + t[0] + '">' + t[1] + '</button>'; });
    h += '</div><label class="f">Scrivi qui</label><textarea id="idea-text" placeholder="Es. Vorrei vedere una vista settimanale…"></textarea><div id="f-err" class="err"></div><button class="btn block" data-act="ideaSend">Invia</button>';
    if (state.notes.length) {
      h += '<h2>Quello che hai scritto</h2>';
      state.notes.slice().reverse().forEach(n => {
        const d = new Date(n.ts);
        h += '<div class="card"><span class="badge">' + ({ funzione: 'Funzione nuova', cambio: 'Cambiare qualcosa', problema: 'Problema' }[n.type] || n.type) + '</span> <small>' + P.fmtDay(P.ds(d)) + '</small><p style="margin:6px 0 0;white-space:pre-wrap">' + esc(n.text) + '</p><button class="mute" style="font-size:13px;margin-top:6px" data-act="ideaDel" data-id="' + n.id + '">Elimina</button></div>';
      });
    }
    return h;
  }
  function vOpz() {
    const s = state.settings;
    let h = tip('t_opz', 'Le opzioni', 'Qui decidi quando puoi studiare, quante ore al massimo al giorno e le fasi del tuo metodo di studio. Puoi cambiare i nomi, aggiungere o togliere fasi: l\'app si adatta. Nella sezione Collegamento metti il nome del telefono e la chiave che ti dà Otto.');
    h += '<h1>Opzioni</h1><h2>Quando studi</h2><div class="card"><div class="two"><div><label class="f" style="margin-top:0">Dalle</label><input type="time" data-s="winStart" value="' + s.winStart + '"></div><div><label class="f" style="margin-top:0">Alle</label><input type="time" data-s="winEnd" value="' + s.winEnd + '"></div></div>';
    h += '<label class="f">Ore di studio al giorno, di solito</label><input type="number" inputmode="decimal" step="0.5" min="1" max="12" data-s="maxHours" value="' + s.maxHours + '">';
    h += '<label class="f">Ore di studio giorno per giorno</label><p class="mute" style="margin:0 0 8px">Lascia vuoto per usare le ore di solito, scrivi 0 per un giorno senza studio. Gli appuntamenti del giorno si tolgono da queste ore (il lavoro no: per i giorni di lavoro scrivi tu quante ore puoi studiare).</p>';
    ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'].forEach((n, i) => {
      const v = s.dayHours && typeof s.dayHours[i] === 'number' ? s.dayHours[i] : '';
      h += '<div class="dhrow"><span>' + n + '</span><input type="number" inputmode="decimal" step="0.5" min="0" max="12" data-dh="' + i + '" placeholder="' + s.maxHours + '" value="' + v + '"><small>ore</small></div>';
    });
    h += '<label class="f">Durata massima di una sessione (minuti)</label><input type="number" inputmode="numeric" step="5" min="30" max="240" data-s="maxBlock" value="' + s.maxBlock + '">';
    h += '<label class="f">Giorni senza studio</label><div class="chips">' + P.WD_SHORT.map((n, i) => '<button class="chip' + (s.offDays.indexOf(i) >= 0 ? ' on' : '') + '" data-act="offDay" data-i="' + i + '">' + n + '</button>').join('') + '</div></div>';
    h += '<h2>Le fasi del tuo metodo</h2><p class="mute" style="margin:0 0 8px">Ogni argomento passa da queste fasi, in ordine. «Minuti per pagina» serve all\'app per calcolare il tempo. Se spunti «Si ripete», la fase torna anche nei passaggi successivi.</p>';
    s.phases.forEach((p, i) => {
      h += '<div class="phrow"><input data-ph="' + p.id + '" data-f="name" value="' + esc(p.name) + '"><div class="two" style="margin-top:8px;align-items:center"><div class="inline"><input style="width:80px" type="number" inputmode="decimal" step="0.5" min="0.5" data-ph="' + p.id + '" data-f="minPerPage" value="' + p.minPerPage + '"><small>min/pagina</small></div><div class="inline"><input type="checkbox" id="rp' + p.id + '" data-ph="' + p.id + '" data-f="repeat"' + (p.repeat ? ' checked' : '') + '><label for="rp' + p.id + '" style="font-size:14px">Si ripete</label></div></div>';
      h += '<div class="btns" style="margin-top:8px"><button class="btn ghost" data-act="phUp" data-i="' + i + '"' + (i === 0 ? ' disabled' : '') + '>↑</button><button class="btn ghost" data-act="phDn" data-i="' + i + '"' + (i === s.phases.length - 1 ? ' disabled' : '') + '>↓</button><button class="btn danger" data-act="phDel" data-i="' + i + '">Togli</button></div></div>';
    });
    h += '<button class="btn ghost block" data-act="phAdd">+ Aggiungi fase</button>';
    h += linkSection();
    h += '<h2>Altro</h2><button class="btn ghost block" data-act="resetTips">Rivedi i suggerimenti</button><p class="mute" style="text-align:center;margin-top:18px">Koalendario · versione ' + esc(VER) + '</p>';
    return h;
  }

  function render() {
    const now = new Date();
    const plan = P.reconcile(state, now);
    save();
    ctx = { now: now, today: P.ds(now), nowMin: now.getHours() * 60 + now.getMinutes(), plan: plan };
    const y = window.scrollY;
    const views = { oggi: vOggi, cal: vCal, esami: vEsami, idee: vIdee, opz: vOpz };
    $('#app').innerHTML = '<header class="top"><div class="brand"><img src="icon.svg" alt=""><span>Koalendario</span></div><span class="ver" id="ver">v' + esc(VER) + '</span></header><main>' + views[view]() + '</main><nav class="tabs">' +
      TABS.map(t => '<button class="' + (view === t[0] ? 'on' : '') + '" data-act="tab" data-v="' + t[0] + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[t[0]] + '</svg>' + t[1] + '</button>').join('') + '</nav>';
    window.scrollTo(0, y);
  }

  /* ---------- finestre ---------- */
  function openSheet(title, body, keep) {
    const el = $('#sheet'), old = el.querySelector('.pb'), st = old ? old.scrollTop : 0;
    el.innerHTML = '<div class="backdrop" data-act="closeSheet"></div><div class="panel" role="dialog"><div class="ph"><b>' + esc(title) + '</b><button data-act="closeSheet" aria-label="Chiudi">✕</button></div><div class="pb">' + body + '</div></div>';
    el.classList.add('open'); document.body.classList.add('lock');
    if (keep) el.querySelector('.pb').scrollTop = st;
  }
  function closeSheet() { const el = $('#sheet'); el.classList.remove('open'); el.innerHTML = ''; document.body.classList.remove('lock'); currentSheet = null; }
  const setErr = m => { const e = $('#f-err'); if (e) e.textContent = m; };

  function eventSheet(id, date, draft, od) {
    const ev = id ? state.events.find(x => x.id === id) : null;
    const d0 = date || ctx.today;
    const e = draft || ev || { title: '', kind: 'app', date: d0, start: '10:00', end: '11:00', allDay: false, repeat: 'none', days: [P.wd(d0)], until: '' };
    const days = e.days && e.days.length ? e.days : [P.wd(e.date)];
    currentSheet = { type: 'event', id: id, date: date, od: od };
    openSheet(id ? 'Modifica appuntamento' : 'Nuovo appuntamento',
      (id && od ? '<button class="btn ' + (isDone(id, od) ? 'ghost' : '') + ' block" data-act="evDoneSheet" data-id="' + id + '" data-d="' + od + '">' + (isDone(id, od) ? 'Annulla «fatto»' : '✓ Segna come fatto') + (e.repeat && e.repeat !== 'none' ? ' (' + P.fmtDay(od) + ')' : '') + '</button>' : '') + tip('t_event2', 'Come si usa', 'Quando hai fatto un appuntamento, spunta il cerchio a destra: sul calendario resta barrato. Scrivi cosa è e quando. Per il lavoro scegli «Ogni settimana» e spunta i giorni: l\'app metterà lo studio negli altri momenti. Se aggiungi un impegno sopra una sessione già confermata, la sposto io.') +
      '<label class="f">Titolo</label><input id="f-title" value="' + esc(e.title) + '" placeholder="Es. Dentista, Lavoro…">' +
      '<label class="f">Tipo</label><select id="f-kind" data-prev="' + esc(kind(e.kind).id) + '">' + KINDS().map(k => '<option value="' + esc(k.id) + '"' + (e.kind === k.id ? ' selected' : '') + '>' + esc(k.name) + '</option>').join('') + '<option value="__kinds">＋ Aggiungi o modifica i tipi…</option></select>' +
      '<label class="f">Data</label><input id="f-date" type="date" value="' + e.date + '">' +
      '<div class="inline" style="margin-top:12px"><input id="f-all" type="checkbox"' + (e.allDay ? ' checked' : '') + '><label for="f-all">Tutto il giorno</label></div>' +
      '<div id="f-times" class="two"' + (e.allDay ? ' hidden' : '') + '><div><label class="f">Dalle</label><input id="f-start" type="time" value="' + (e.start || '10:00') + '"></div><div><label class="f">Alle</label><input id="f-end" type="time" value="' + (e.end || '11:00') + '"></div></div>' +
      '<label class="f">Si ripete</label><select id="f-rep">' + [['none', 'Mai'], ['daily', 'Ogni giorno'], ['weekly', 'Ogni settimana'], ['monthly', 'Ogni mese']].map(r => '<option value="' + r[0] + '"' + ((e.repeat || 'none') === r[0] ? ' selected' : '') + '>' + r[1] + '</option>').join('') + '</select>' +
      '<div id="f-days"' + (e.repeat === 'weekly' ? '' : ' hidden') + '><label class="f">Nei giorni</label><div class="chips">' + P.WD_SHORT.map((n, i) => '<button type="button" class="chip' + (days.indexOf(i) >= 0 ? ' on' : '') + '" data-act="toggleDay" data-i="' + i + '">' + n + '</button>').join('') + '</div></div>' +
      '<div id="f-until"' + (e.repeat && e.repeat !== 'none' ? '' : ' hidden') + '><label class="f">Fino al (facoltativo)</label><input id="f-untilv" type="date" value="' + (e.until || '') + '"></div>' +
      '<div id="f-err" class="err"></div><div class="btns"><button class="btn" data-act="saveEvent" data-id="' + (id || '') + '">Salva</button>' + (id ? '<button class="btn danger" data-act="delEvent" data-id="' + id + '">Elimina</button>' : '') + '</div>');
  }
  function collectEvent() {
    const days = Array.prototype.map.call(document.querySelectorAll('#f-days .chip.on'), b => +b.dataset.i);
    const prev = $('#f-kind').dataset.prev;
    return { title: $('#f-title').value, kind: prev, date: $('#f-date').value || ctx.today, start: $('#f-start').value || '10:00', end: $('#f-end').value || '11:00', allDay: $('#f-all').checked, repeat: $('#f-rep').value, days: days, until: $('#f-untilv').value };
  }
  function kindsSheet(st, keep) {
    currentSheet = { type: 'kinds', st: st };
    let b = tip('t_kinds', 'I tipi di appuntamento', 'Ogni tipo ha il suo colore, che vedrai nel calendario. Cambia il nome, scegli un colore dalla lista (o dal selettore a destra) e aggiungi nuovi tipi quando ti servono.');
    KINDS().forEach(k => {
      b += '<div class="phrow"><input data-kn="' + esc(k.id) + '" data-f="name" value="' + esc(k.name) + '"><div class="sws">' +
        SWATCHES.map(c => '<button type="button" class="sw' + (c.toLowerCase() === k.c.toLowerCase() ? ' on' : '') + '" style="background:' + c + '" data-act="kindColor" data-id="' + esc(k.id) + '" data-c="' + c + '" aria-label="Colore"></button>').join('') +
        '<input class="clr" type="color" data-kn="' + esc(k.id) + '" data-f="color" value="' + esc(k.c) + '"></div>' +
        '<div class="btns" style="margin-top:8px"><button class="btn danger" data-act="kindDel" data-id="' + esc(k.id) + '"' + (KINDS().length <= 1 ? ' disabled' : '') + '>Elimina</button></div></div>';
    });
    b += '<button class="btn ghost block" data-act="kindAdd">+ Nuovo tipo</button><div class="btns"><button class="btn" data-act="kindsDone">Fatto</button></div>';
    openSheet('Tipi di appuntamento', b, keep);
  }
  function topicRow(t) {
    return '<div class="trow" data-tid="' + (t.id || '') + '"><input class="t-name" placeholder="Argomento" value="' + esc(t.name) + '"><input class="t-pages" type="number" inputmode="numeric" min="0" placeholder="Pag." value="' + (t.pages || '') + '"><select class="t-passes">' + [1, 2, 3, 4].map(n => '<option value="' + n + '"' + ((t.passes || 1) === n ? ' selected' : '') + '>' + n + '×</option>').join('') + '</select><button data-act="delTopicRow" aria-label="Togli">✕</button></div>';
  }
  function examForm(id) {
    const ex = id ? examById(id) : null;
    const e = ex || { name: '', date: '', topics: [], phases: null };
    currentSheet = { type: 'examform', id: id };
    openSheet(id ? 'Modifica esame' : 'Nuovo esame',
      tip('t_examform2', 'Come si compila', 'Scrivi il nome e la data dell\'esame. Gli argomenti puoi farli leggere all\'app da un file di appunti (PDF o testo) oppure scriverli tu, con le pagine se le sai. Togli la spunta alle fasi di studio che per questo esame non ti servono. «Passaggi» sono le volte che vuoi passare su un argomento.') +
      '<label class="f">Nome dell\'esame</label><input id="f-name" value="' + esc(e.name) + '" placeholder="Es. Anatomia">' +
      '<label class="f">Data dell\'esame</label><input id="f-date" type="date" value="' + e.date + '">' +
      '<label class="f">Fasi di studio per questo esame</label><div class="chips" id="f-phases">' + state.settings.phases.map(p => '<button type="button" class="chip' + (!Array.isArray(e.phases) || e.phases.indexOf(p.id) >= 0 ? ' on' : '') + '" data-act="toggleDay" data-id="' + esc(p.id) + '">' + esc(p.name) + '</button>').join('') + '</div>' +
      '<label class="f">Hai gli appunti in un file?</label><button class="btn ghost block" data-act="pickFile">Leggi gli argomenti da un file (PDF o testo)</button><input type="file" id="f-file" accept=".pdf,application/pdf,.txt,text/plain" hidden><div id="f-imp" class="imp"></div>' +
      '<label class="f">Argomenti</label><div class="trow"><small>Argomento</small><small>Pagine</small><small>Passaggi</small><span></span></div><div id="f-topics">' + (e.topics.length ? e.topics : [{ id: '', name: '', pages: '', passes: 1 }]).map(topicRow).join('') + '</div>' +
      '<button class="btn ghost block" data-act="addTopicRow">+ Aggiungi argomento</button>' +
      '<label class="f">Oppure incolla un elenco (uno per riga, con le pagine alla fine)</label><textarea id="f-bulk" placeholder="Ossa 30&#10;Muscoli 45"></textarea><button class="btn ghost block" data-act="bulkAdd">Aggiungi dall\'elenco</button>' +
      '<div id="f-err" class="err"></div><div class="btns"><button class="btn" data-act="saveExam" data-id="' + (id || '') + '">Salva</button></div>');
  }
  function examSheet(id, keep) {
    const ex = examById(id);
    if (!ex) return closeSheet();
    currentSheet = { type: 'exam', id: id };
    const pr = P.examProgress(state, ex), units = P.unitsForExam(state, ex), left = P.diffDays(ctx.today, ex.date);
    const warn = ctx.plan.warnings.find(w => w.examId === id);
    let b = tip('t_examdetail', 'Il piano dell\'esame', 'Tocca una fase per segnarla come completata: l\'app ricalcola il resto. Le sessioni di studio le trovi nella scheda Oggi e nel Calendario.');
    b += '<p>' + P.fullDay(ex.date) + ' · ' + (left < 0 ? 'passato' : left === 0 ? 'oggi' : left === 1 ? 'domani' : 'tra ' + left + ' giorni') + '</p><div class="prog"><i style="width:' + pr.pct + '%;background:' + ex.color + '"></i></div><small>' + pr.pct + '% completato · ' + P.hm(pr.done) + ' su ' + P.hm(pr.total) + '</small>';
    if (warn) b += '<div class="warn" style="margin-top:10px"><span>Mancano circa ' + P.hm(warn.missing) + ' di studio prima dell\'esame. Libera qualche giornata o riduci gli argomenti.</span></div>';
    if (!ex.topics.length) b += '<div class="empty-note">Nessun argomento: aggiungili con «Modifica».</div>';
    ex.topics.forEach(t => {
      b += '<div class="card" style="margin-top:12px"><b>' + esc(t.name) + '</b> <small>' + (t.pages ? t.pages + ' pag. · ' : '') + (t.passes || 1) + ' passagg' + ((t.passes || 1) > 1 ? 'i' : 'io') + '</small>';
      for (let p = 1; p <= (t.passes || 1); p++) {
        const us = units.filter(u => u.topicId === t.id && u.pass === p);
        if (!us.length) continue;
        if ((t.passes || 1) > 1) b += '<div class="mute" style="margin:10px 0 4px;font-size:13px">Passaggio ' + p + '</div>'; else b += '<div style="height:8px"></div>';
        b += '<div class="chips">' + us.map(u => { const done = (state.progress[u.key] || 0) >= u.minutes; return '<button class="chip' + (done ? ' on' : '') + '" data-act="toggleUnit" data-key="' + esc(u.key) + '">' + (done ? '✓ ' : '') + esc(u.phaseName) + ' · ' + P.hm(u.minutes) + '</button>'; }).join('') + '</div>';
      }
      b += '</div>';
    });
    b += '<div class="btns"><button class="btn ghost" data-act="editExam" data-id="' + id + '">Modifica</button><button class="btn danger" data-act="delExam" data-id="' + id + '">Elimina</button></div>';
    openSheet(ex.name, b, keep);
  }
  function sessionSheet(s) {
    const u = ctx.plan.units[s.unitKey], ex = u && examById(u.examId);
    if (!u) return;
    openedSess = Object.assign({}, s);
    currentSheet = { type: 'session' };
    const lab = { proposed: 'Proposta dell\'app', accepted: 'Confermata', done: 'Fatto ✓' }[s.status];
    let b = tip('t_session', 'Cosa puoi fare', 'Accetta = blocchi questa sessione a quell\'orario. Fatto = conta nel tuo progresso. Sposta = scegli un altro spazio libero. Se non fai nulla, la sessione resta una proposta e l\'app la risistema da sola.');
    b += '<div class="card"><b>' + esc(P.unitLabel(u)) + '</b><br><small>' + esc(ex ? ex.name : '') + '</small><p style="margin:8px 0 4px">' + P.fmtDay(s.date) + ' · ' + P.ts(s.start) + '–' + P.ts(s.end) + ' (' + P.hm(s.end - s.start) + ')</p><span class="badge">' + lab + '</span></div><div class="btns">';
    if (s.status === 'proposed') b += '<button class="btn" data-act="sesAccept">Accetta</button><button class="btn ghost" data-act="sesDone">Fatto</button><button class="btn ghost" data-act="sesMove">Sposta</button>';
    else if (s.status === 'accepted') b += '<button class="btn" data-act="sesDone">Fatto</button><button class="btn ghost" data-act="sesMove">Sposta</button><button class="btn ghost" data-act="sesUn">Togli conferma</button>';
    else b += '<button class="btn ghost" data-act="sesUndo">Annulla «fatto»</button>';
    b += '</div>';
    openSheet('Sessione di studio', b);
  }

  /* ---------- azioni ---------- */
  const A = {
    tab(el) { view = el.dataset.v; state.usage.screens[view] = (state.usage.screens[view] || 0) + 1; render(); window.scrollTo(0, 0); },
    tipOk(el) { state.tutorial[el.dataset.k] = true; save(); const t = el.closest('.tip'); if (t) t.remove(); },
    dismiss(el) { state.notices = state.notices.filter(n => n.id !== el.dataset.id); render(); },
    closeSheet() { closeSheet(); },
    calPrev() { const p = calMonth.split('-').map(Number); const d = new Date(p[0], p[1] - 2, 1); calMonth = P.ds(d).slice(0, 7); render(); },
    calNext() { const p = calMonth.split('-').map(Number); const d = new Date(p[0], p[1], 1); calMonth = P.ds(d).slice(0, 7); render(); },
    selDay(el) { selDay = el.dataset.d; render(); },
    addEvent(el) { eventSheet(null, el.dataset.d); },
    editEvent(el) { eventSheet(el.dataset.id, null, null, el.dataset.d); },
    evDone(el) { setDone(el.dataset.id, el.dataset.d, !isDone(el.dataset.id, el.dataset.d)); render(); },
    evDoneSheet(el) { setDone(el.dataset.id, el.dataset.d, !isDone(el.dataset.id, el.dataset.d)); closeSheet(); render(); },
    toggleDay(el) { el.classList.toggle('on'); },
    pickFile() { const f = $('#f-file'); if (f) f.click(); },
    kindColor(el) { const k = KINDS().find(x => x.id === el.dataset.id); if (k) { k.c = el.dataset.c; save(); kindsSheet(currentSheet.st, true); } },
    kindAdd() { const id = 'k' + P.uid(); KINDS().push({ id: id, name: 'Nuovo tipo', c: SWATCHES[KINDS().length % SWATCHES.length] }); currentSheet.st.added = id; save(); kindsSheet(currentSheet.st); const pb = document.querySelector('#sheet .pb'); if (pb) pb.scrollTop = pb.scrollHeight; },
    kindDel(el) {
      const id = el.dataset.id, ks = KINDS();
      if (ks.length <= 1) return;
      const used = state.events.filter(x => x.kind === id).length;
      if (!confirm(used ? 'Questo tipo è usato da ' + used + ' appuntament' + (used > 1 ? 'i' : 'o') + ': passeranno al primo tipo della lista. Eliminarlo?' : 'Eliminare questo tipo?')) return;
      const rest = ks.filter(k => k.id !== id);
      state.events.forEach(x => { if (x.kind === id) x.kind = rest[0].id; });
      state.settings.kinds = rest; save(); kindsSheet(currentSheet.st, true);
    },
    kindsDone() { const st = currentSheet.st, d = st.draft; if (st.added) d.kind = st.added; else if (!KINDS().some(k => k.id === d.kind)) d.kind = KINDS()[0].id; eventSheet(st.id, st.date, d, st.od); },
    saveEvent(el) {
      const id = el.dataset.id, title = $('#f-title').value.trim() || 'Appuntamento', date = $('#f-date').value, all = $('#f-all').checked;
      const start = $('#f-start').value, end = $('#f-end').value, rep = $('#f-rep').value, until = $('#f-untilv').value;
      if (!date) return setErr('Scegli la data.');
      if (!all && (!start || !end || P.tm(end) <= P.tm(start))) return setErr('L\'orario di fine deve essere dopo quello di inizio.');
      if (rep !== 'none' && until && until < date) return setErr('La data finale è prima di quella di inizio.');
      let days = Array.prototype.map.call(document.querySelectorAll('#f-days .chip.on'), b => +b.dataset.i);
      if (rep === 'weekly' && !days.length) days = [P.wd(date)];
      const obj = { id: id || P.uid(), title: title, kind: $('#f-kind').value, date: date, allDay: all, start: start || '00:00', end: end || '23:59', repeat: rep, days: rep === 'weekly' ? days : [], until: rep === 'none' ? '' : until };
      if (id) state.events = state.events.map(x => x.id === id ? obj : x); else state.events.push(obj);
      selDay = date; calMonth = date.slice(0, 7);
      closeSheet(); render();
    },
    delEvent(el) { if (!confirm('Eliminare questo appuntamento?')) return; state.events = state.events.filter(x => x.id !== el.dataset.id); Object.keys(state.evDone || {}).forEach(k => { if (k.indexOf(el.dataset.id + '|') === 0) delete state.evDone[k]; }); closeSheet(); render(); },
    addExam() { examForm(null); },
    editExam(el) { examForm(el.dataset.id); },
    openExam(el) { examSheet(el.dataset.id); },
    addTopicRow() { $('#f-topics').insertAdjacentHTML('beforeend', topicRow({ id: '', name: '', pages: '', passes: 1 })); },
    delTopicRow(el) { el.closest('.trow').remove(); },
    bulkAdd() {
      const lines = $('#f-bulk').value.split('\n').map(l => l.trim()).filter(Boolean);
      if (!lines.length) return;
      const box = $('#f-topics');
      Array.prototype.forEach.call(box.querySelectorAll('.trow'), r => { if (!r.querySelector('.t-name').value.trim()) r.remove(); });
      lines.forEach(l => {
        const m = l.match(/^(.*?)[\s;,:\-–]*(\d+)\s*$/);
        const name = m && m[1].trim() ? m[1].trim() : l, pages = m && m[1].trim() ? +m[2] : '';
        box.insertAdjacentHTML('beforeend', topicRow({ id: '', name: name, pages: pages, passes: 1 }));
      });
      $('#f-bulk').value = '';
    },
    saveExam(el) {
      const id = el.dataset.id, name = $('#f-name').value.trim(), date = $('#f-date').value;
      if (!name) return setErr('Scrivi il nome dell\'esame.');
      if (!date) return setErr('Scegli la data dell\'esame.');
      const topics = [];
      Array.prototype.forEach.call(document.querySelectorAll('#f-topics .trow'), r => {
        const n = r.querySelector('.t-name').value.trim();
        if (!n) return;
        topics.push({ id: r.dataset.tid || P.uid(), name: n, pages: Math.max(0, parseInt(r.querySelector('.t-pages').value, 10) || 0), passes: parseInt(r.querySelector('.t-passes').value, 10) || 1 });
      });
      const selPh = Array.prototype.map.call(document.querySelectorAll('#f-phases .chip.on'), b => b.dataset.id);
      if (!selPh.length) return setErr('Scegli almeno una fase di studio.');
      const old = id && examById(id);
      const obj = { id: id || P.uid(), name: name, date: date, color: old ? old.color : COLORS[state.exams.length % COLORS.length], topics: topics, phases: selPh.length === state.settings.phases.length ? null : selPh };
      if (id) state.exams = state.exams.map(x => x.id === id ? obj : x); else state.exams.push(obj);
      closeSheet(); render(); examSheet(obj.id);
    },
    delExam(el) {
      if (!confirm('Eliminare questo esame e il suo piano di studio?')) return;
      const id = el.dataset.id;
      state.exams = state.exams.filter(x => x.id !== id);
      Object.keys(state.progress).forEach(k => { if (k.indexOf(id + '|') === 0) delete state.progress[k]; });
      closeSheet(); render();
    },
    toggleUnit(el) {
      const u = ctx.plan.units[el.dataset.key];
      if (!u) return;
      P.toggleUnit(state, u); save(); render();
      if (currentSheet && currentSheet.type === 'exam') examSheet(currentSheet.id, true);
    },
    openSession(el) { const s = ctx.plan.sessions.find(x => x.id === el.dataset.sid); if (s) sessionSheet(s); },
    sesAccept() { P.accept(state, openedSess); closeSheet(); render(); },
    sesDone() { P.markDone(state, openedSess); closeSheet(); render(); },
    sesUn() { P.unaccept(state, openedSess.id); closeSheet(); render(); },
    sesUndo() { P.undoDone(state, openedSess.id); closeSheet(); render(); },
    sesMove() {
      slotsCache = P.candidateSlots(state, openedSess, new Date(), 8);
      let b = '<p class="mute">Scegli dove spostarla:</p>';
      b += slotsCache.length ? slotsCache.map((s, i) => '<button class="slotbtn" data-act="sesPick" data-i="' + i + '"><b>' + P.fullDay(s.date) + '</b><br><small>' + P.ts(s.start) + '–' + P.ts(s.end) + '</small></button>').join('') : '<div class="empty-note">Non ci sono altri spazi liberi prima dell\'esame.</div>';
      openSheet('Sposta la sessione', b);
    },
    sesPick(el) { P.moveTo(state, openedSess, slotsCache[+el.dataset.i]); closeSheet(); render(); },
    ideaType(el) { ideaType = el.dataset.t; Array.prototype.forEach.call(document.querySelectorAll('#ideaTypes .chip'), c => c.classList.toggle('on', c === el)); },
    ideaSend() {
      const t = $('#idea-text').value.trim();
      if (!t) return setErr('Scrivi qualcosa prima di inviare.');
      state.notes.push({ id: P.uid(), type: ideaType, text: t, ts: Date.now(), status: 'nuova' });
      render(); sync(true);
    },
    ideaDel(el) { state.notes = state.notes.filter(n => n.id !== el.dataset.id); render(); sync(true); },
    async connect() {
      const name = $('#lk-name').value.trim(), key = $('#lk-key').value.trim();
      if (!name) return setErr('Scrivi un nome per questo telefono.');
      if (!key) return setErr('Incolla la chiave di accesso.');
      const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (!slug) return setErr('Usa lettere o numeri nel nome.');
      setErr('Collego…');
      setLink({ name: name, slug: slug, key: key, last: 0, error: '' });
      await sync(true);
      const l = getLink();
      if (l && l.error) { const m = l.error; setLink(null); return setErr(m); }
      render();
    },
    async syncNow() { setErr('Invio…'); await sync(true); render(); },
    disconnect() { if (!confirm('Scollegare questo telefono?')) return; setLink(null); render(); },
    offDay(el) {
      const i = +el.dataset.i, o = state.settings.offDays, k = o.indexOf(i);
      if (k >= 0) o.splice(k, 1); else o.push(i);
      el.classList.toggle('on'); save();
    },
    phAdd() { state.settings.phases.push({ id: 'ph' + P.uid(), name: 'Nuova fase', minPerPage: 2, repeat: false }); render(); },
    phDel(el) {
      if (state.settings.phases.length <= 1) return;
      state.settings.phases.splice(+el.dataset.i, 1); render();
    },
    phUp(el) { const i = +el.dataset.i, a = state.settings.phases; if (i > 0) { const t = a[i]; a[i] = a[i - 1]; a[i - 1] = t; render(); } },
    phDn(el) { const i = +el.dataset.i, a = state.settings.phases; if (i < a.length - 1) { const t = a[i]; a[i] = a[i + 1]; a[i + 1] = t; render(); } },
    resetTips() { state.tutorial = {}; save(); view = 'oggi'; render(); window.scrollTo(0, 0); }
  };
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const f = A[el.dataset.act];
    if (f) { e.preventDefault(); state.usage.actions[el.dataset.act] = (state.usage.actions[el.dataset.act] || 0) + 1; f(el, e); }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset && t.dataset.s) {
      const k = t.dataset.s;
      let v = t.type === 'number' ? parseFloat(t.value) : t.value;
      if (k === 'maxHours') v = Math.min(12, Math.max(1, v || 4));
      if (k === 'maxBlock') v = Math.min(240, Math.max(30, v || 90));
      if ((k === 'winStart' || k === 'winEnd') && (!v || P.tm(k === 'winStart' ? v : state.settings.winStart) >= P.tm(k === 'winEnd' ? v : state.settings.winEnd))) { t.value = state.settings[k]; return; }
      state.settings[k] = v; save();
    } else if (t.dataset && t.dataset.dh !== undefined) {
      const i = +t.dataset.dh, v = parseFloat(String(t.value).replace(',', '.'));
      state.settings.dayHours = state.settings.dayHours || {};
      if (isNaN(v)) { delete state.settings.dayHours[i]; t.value = ''; }
      else { const c = Math.min(12, Math.max(0, v)); state.settings.dayHours[i] = c; t.value = c; }
      save();
    } else if (t.dataset && t.dataset.ph) {
      const ph = state.settings.phases.find(p => p.id === t.dataset.ph);
      if (!ph) return;
      if (t.dataset.f === 'name') ph.name = t.value.trim() || ph.name;
      if (t.dataset.f === 'minPerPage') ph.minPerPage = Math.max(0.5, parseFloat(t.value) || 1);
      if (t.dataset.f === 'repeat') ph.repeat = t.checked;
      save();
    } else if (t.dataset && t.dataset.kn) {
      const k = KINDS().find(x => x.id === t.dataset.kn);
      if (!k) return;
      if (t.dataset.f === 'name') { k.name = t.value.trim() || k.name; save(); }
      else { k.c = t.value; save(); kindsSheet(currentSheet.st, true); }
    } else if (t.id === 'f-kind') {
      if (t.value === '__kinds') kindsSheet({ id: currentSheet.id, date: currentSheet.date, od: currentSheet.od, draft: collectEvent() });
      else t.dataset.prev = t.value;
    } else if (t.id === 'f-file') {
      const f = t.files && t.files[0]; t.value = '';
      if (f) importFile(f);
    } else if (t.id === 'f-all') {
      $('#f-times').hidden = t.checked;
    } else if (t.id === 'f-rep') {
      $('#f-days').hidden = t.value !== 'weekly';
      $('#f-until').hidden = t.value === 'none';
    }
  });

  /* ---------- argomenti da un file di appunti ---------- */
  async function importFile(file) {
    const out = $('#f-imp');
    if (!out) return;
    const say = (m, bad) => { out.textContent = m; out.className = 'imp' + (bad ? ' bad' : ''); };
    say('Leggo il file…');
    state.usage.actions.importFile = (state.usage.actions.importFile || 0) + 1;
    try {
      let r;
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') r = await window.Topics.readPdf(file, (i, n) => say('Leggo la pagina ' + i + ' di ' + n + '…'));
      else r = window.Topics.fromText(await file.text());
      if (!r.topics.length) return say('Non ho trovato testo da leggere in questo file.', true);
      const box = $('#f-topics');
      if (!box) return;
      Array.prototype.forEach.call(box.querySelectorAll('.trow'), row => { if (!row.querySelector('.t-name').value.trim()) row.remove(); });
      r.topics.forEach(t => box.insertAdjacentHTML('beforeend', topicRow({ id: '', name: t.name, pages: t.pages, passes: 1 })));
      const n = r.topics.length, what = { segnalibri: 'dall\'indice del file', titoli: 'dai titoli del file' }[r.mode];
      say(what ? 'Ho trovato ' + n + ' argomenti ' + what + ' (' + r.total + ' pagine). Controlla l\'elenco qui sotto: puoi correggere i nomi, le pagine o togliere righe.' : 'Non ho trovato titoli chiari, quindi ho diviso il file in blocchi di 20 pagine (' + r.total + ' in tutto). Puoi rinominarli o cambiarli.');
      box.scrollIntoView({ block: 'nearest' });
    } catch (e) {
      const m = String(e && e.message);
      logErr('import ' + m);
      say(m === 'scansione' ? 'Questo PDF è fatto di immagini (non ha testo) e non riesco a leggerlo. Prova con un PDF in cui il testo si può selezionare.' : m === 'protetto' ? 'Questo PDF è protetto da password: toglila e riprova.' : m === 'lib' ? 'Non riesco a caricare la lettura dei PDF. Controlla la connessione e riprova.' : 'Non riesco a leggere questo file. Prova con un altro.', true);
    }
  }

  /* ---------- collegamento con l'archivio privato ---------- */
  const DATA_REPO = 'andreaguiotto02-8/koalendario-data';
  const LINK_KEY = 'koalendario.link', ERR_KEY = 'koalendario.errors';
  function getLink() { try { return JSON.parse(localStorage.getItem(LINK_KEY) || 'null'); } catch (e) { return null; } }
  function setLink(o) { try { if (o) localStorage.setItem(LINK_KEY, JSON.stringify(o)); else localStorage.removeItem(LINK_KEY); } catch (e) {} }
  function logErr(msg) {
    try {
      const a = JSON.parse(localStorage.getItem(ERR_KEY) || '[]');
      a.push({ t: new Date().toISOString(), v: VER, m: String(msg).slice(0, 300) });
      localStorage.setItem(ERR_KEY, JSON.stringify(a.slice(-20)));
    } catch (e) {}
  }
  window.addEventListener('error', e => logErr(e.message + ' @' + String(e.filename || '').split('/').pop() + ':' + e.lineno));
  window.addEventListener('unhandledrejection', e => logErr('promise: ' + (e.reason && e.reason.message || e.reason)));
  function usagePayload(link) {
    const u = state.usage, ua = navigator.userAgent;
    let topics = 0; state.exams.forEach(x => { topics += x.topics.length; });
    let errs = []; try { errs = JSON.parse(localStorage.getItem(ERR_KEY) || '[]'); } catch (e) {}
    return {
      device: link.name, platform: /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : 'altro',
      installed: !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches)),
      version: VER, sentAt: new Date().toISOString(), firstOpen: new Date(u.first).toISOString(), lastOpen: new Date(u.last).toISOString(),
      opens: u.opens, screens: u.screens, actions: u.actions,
      counts: { events: state.events.length, exams: state.exams.length, topics: topics, sessionsAccepted: state.sessions.filter(x => x.status === 'accepted').length, sessionsDone: state.sessions.filter(x => x.status === 'done').length, notes: state.notes.length, phases: state.settings.phases.length },
      settings: { winStart: state.settings.winStart, winEnd: state.settings.winEnd, maxHours: state.settings.maxHours, dayHours: state.settings.dayHours, maxBlock: state.settings.maxBlock, offDays: state.settings.offDays },
      tipsSeen: Object.keys(state.tutorial), errors: errs
    };
  }
  const b64 = s => btoa(unescape(encodeURIComponent(s)));
  async function ghPut(link, path, obj, msg) {
    const url = 'https://api.github.com/repos/' + DATA_REPO + '/contents/' + path;
    const h = { Authorization: 'Bearer ' + link.key, Accept: 'application/vnd.github+json' };
    let sha;
    const g = await fetch(url + '?t=' + Date.now(), { headers: h, cache: 'no-store' });
    if (g.status === 200) sha = (await g.json()).sha; else if (g.status !== 404) throw { status: g.status };
    const body = { message: msg, content: b64(JSON.stringify(obj, null, 1)) };
    if (sha) body.sha = sha;
    const r = await fetch(url, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, h), body: JSON.stringify(body) });
    if (!r.ok) throw { status: r.status };
  }
  let syncing = false;
  async function sync(force) {
    const link = getLink();
    if (!link || !link.key || syncing) return;
    if (!force && link.last && Date.now() - link.last < 10 * 60 * 1000) return;
    syncing = true;
    try {
      const base = 'devices/' + link.slug + '/';
      await ghPut(link, base + 'usage.json', usagePayload(link), 'Dati d\'uso ' + link.name);
      await ghPut(link, base + 'notes.json', { device: link.name, notes: state.notes }, 'Idee e problemi ' + link.name);
      link.last = Date.now(); link.error = '';
    } catch (e) {
      const st = e && e.status;
      link.error = st === 401 ? 'La chiave non è valida o è scaduta.' : (st === 403 || st === 404) ? 'La chiave non ha accesso all\'archivio: controlla di aver scelto koalendario-data.' : !st ? 'Non riesco a collegarmi: controlla la connessione.' : 'Collegamento non riuscito (errore ' + st + ').';
    }
    setLink(link);
    syncing = false;
  }
  function linkSection() {
    const l = getLink();
    let h = '<h2>Collegamento</h2><div class="card"><p class="mute" style="margin:0 0 6px">Serve a far arrivare a chi sviluppa l\'app le tue idee e come usi l\'app. Non vengono mai inviati i tuoi appuntamenti né i tuoi esami.</p>';
    if (l) {
      const when = l.last ? P.fmtDay(P.ds(new Date(l.last))) + ' alle ' + P.ts(new Date(l.last).getHours() * 60 + new Date(l.last).getMinutes()) : 'mai';
      h += '<p style="margin:10px 0 4px"><b>Collegato come «' + esc(l.name) + '»</b></p><small>Ultimo invio: ' + when + '</small>';
      if (l.error) h += '<div class="err">' + esc(l.error) + '</div>';
      h += '<div id="f-err" class="err"></div><div class="btns"><button class="btn ghost" data-act="syncNow">Invia ora</button><button class="btn danger" data-act="disconnect">Scollega</button></div>';
    } else {
      h += '<label class="f">Nome di questo telefono</label><input id="lk-name" placeholder="Es. Koala" autocomplete="off">' +
        '<label class="f">Chiave di accesso (te la dà Otto)</label><input id="lk-key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Incollala qui">' +
        '<div id="f-err" class="err"></div><button class="btn block" data-act="connect">Collega</button>';
    }
    return h + '</div>';
  }

  /* ---------- aggiornamento automatico ---------- */
  let lastCheck = 0;
  async function checkUpdate() {
    if (Date.now() - lastCheck < 4000) return;
    lastCheck = Date.now();
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      if (j.version && j.version !== VER) {
        const tries = +(sessionStorage.getItem('koal.upd') || 0);
        if (tries >= 3) return;
        sessionStorage.setItem('koal.upd', tries + 1);
        $('#upd').hidden = false;
        if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); }
        if (navigator.serviceWorker) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(g => g.update().catch(() => {}))); }
        location.reload();
      } else { sessionStorage.removeItem('koal.upd'); }
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { checkUpdate(); sync(); if (!$('#sheet').classList.contains('open')) render(); }
  });
  window.addEventListener('pageshow', checkUpdate);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  render();
  checkUpdate();
  sync();
})();
