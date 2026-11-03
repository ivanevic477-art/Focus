'use strict';
/* Birch — daily focus. Everything is stored in this browser (localStorage). */
const KEY = 'birch-focus-v1';
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const dkey = d => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = () => dkey(new Date());

const DEFAULTS = {
  tasks: [], sessions: [], blocks: [], projects: [], journal: [], reviews: {}, intentions: {}, timer: null,
  settings: { focus: 25, brk: 5, longBrk: 15, every: 4, sound: true, theme: 'light' }
};
let S = load();
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY)) || {};
    return { ...DEFAULTS, ...d, settings: { ...DEFAULTS.settings, ...(d.settings || {}) } };
  } catch { return structuredClone(DEFAULTS); }
}
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch {
    toast('Warning: Storage is full or restricted. Changes could not be saved.');
  }
};

/* Colour themes. 'light' is the original Birch palette; Twilight is the quick dark toggle. */
const THEMES = [
  { id: 'light', name: 'Birch', bg: '#FBF8F1', fg: '#7A6848' },
  { id: 'charcoal', name: 'Charcoal', bg: '#1B1C1E', fg: '#B8BFCC' },
  { id: 'shell', name: 'Shell', bg: '#FBF6F3', fg: '#9A6B5B' },
  { id: 'stone', name: 'Stone', bg: '#F4F4F1', fg: '#5F6B5E' },
  { id: 'flax', name: 'Flax', bg: '#FAF6EA', fg: '#8A6F1F' }
];
const themeId = () => (S.settings.theme === 'twilight' || THEMES.some(t => t.id === S.settings.theme)) ? S.settings.theme : 'light';
const themeName = id => id === 'twilight' ? 'Twilight' : (THEMES.find(t => t.id === id) || THEMES[0]).name;
const isDark = id => id === 'twilight' || id === 'charcoal';
const swatch = t => `<span class="swatch" style="background:${t.bg};--sw:${t.fg}"></span>`;
const closeThemeMenu = () => $('#themeMenu')?.remove();
function openThemeMenu(anchor) {
  closeThemeMenu();
  const cur = themeId(), m = document.createElement('div');
  m.id = 'themeMenu'; m.className = 'theme-menu'; m.setAttribute('role', 'menu');
  m.innerHTML = `<div class="meta" style="padding:6px 10px 4px">Theme</div>` + THEMES.map(t =>
    `<button role="menuitemradio" aria-checked="${cur === t.id}" class="${cur === t.id ? 'on' : ''}" data-a="set-theme" data-t="${t.id}">${swatch(t)}<span>${t.name}</span></button>`).join('');
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  m.style.left = r.left + 12 + 'px'; m.style.top = r.bottom + 4 + 'px';
}

function applyTheme() {
  const id = themeId(), isTwilight = isDark(id);   // "isTwilight" = any dark theme (controls the toggle icon)
  document.documentElement.setAttribute('data-theme', id);
  const metaTheme = $('meta[name="theme-color"]');
  if (metaTheme) metaTheme.content = id === 'twilight' ? '#161513' : THEMES.find(t => t.id === id).bg;
  const btn = $('#themeBtn');
  if (btn) {
    btn.innerHTML = isTwilight
      ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`
      : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    btn.title = isTwilight ? 'Switch to Daylight theme' : 'Switch to Twilight theme';
  }
}

function updateSoundBtn() {
  const btn = $('#soundBtn');
  if (!btn) return;
  const on = S.settings.sound !== false;
  btn.innerHTML = on
    ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`
    : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M1 1l22 22"/></svg>`;
  btn.title = on ? 'Sound enabled (click to mute)' : 'Sound muted (click to enable)';
}

let view = 'today';
let tip = 0;
const KINDS = {
  todo: { label: 'To-do', ph: 'What do you want to get done?' },
  focus: { label: 'Focus', ph: 'What will you focus on?' },
  study: { label: 'Study', ph: 'What are you studying?' },
  meeting: { label: 'Meeting', ph: 'Who or what is the meeting?' },
  workout: { label: 'Workout', ph: 'What kind of workout?' },
  free: { label: 'Free time', ph: 'What will you do with your free time?' }
};
const AUTO_KINDS = ['focus', 'study'];   // these start a focus timer by themselves
const kindOf = x => KINDS[x.kind] || KINDS.focus;
const kdot = x => `<span class="kdot k-${x.kind || 'focus'}"></span>`;
let dayKind = 'todo';
const fmtT = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const TIPS = [
  { t: 'Stretch', d: 'Roll your shoulders back slowly, ten times. Then reach both arms overhead and breathe out.' },
  { t: 'Drink some water', d: 'Pour a glass and drink it slowly. Notice how it feels.' },
  { t: 'Look away', d: 'Find something at least 20 feet away and rest your eyes on it for 20 seconds.' },
  { t: 'Breathe', d: 'Breathe in for 4, hold for 4, out for 6. Repeat five times.' },
  { t: 'Stand and move', d: 'Stand up, walk to a window or another room, and come back.' },
  { t: 'Rest your hands', d: 'Open and close your fists, then circle your wrists a few times.' },
  { t: 'Get some light', d: 'Step near a window and let your eyes adjust to daylight for a minute.' },
  { t: 'Neck release', d: 'Slowly tilt your ear toward each shoulder. Hold each side for a few breaths.' }
];

/* ---------- helpers ---------- */
function fmtDur(secs) {
  const m = Math.round(secs / 60), h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}
const clockStr = s => { s = Math.max(0, Math.ceil(s)); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (AudioCtor) audioCtx = new AudioCtor();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

let toastAction = null;
function toast(msg, actionLabel = null, onAction = null) {
  const t = $('#toast');
  toastAction = onAction;
  if (actionLabel && onAction) {
    t.innerHTML = `<span>${esc(msg)}</span><button type="button" id="toastAct">${esc(actionLabel)}</button>`;
  } else {
    t.textContent = msg;
  }
  t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => {
    t.classList.remove('show');
    toastAction = null;
  }, 4500);
}
function notify(title, body) {
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body }); } catch {}
}
function chime() {
  if (S.settings.sound === false) return;
  try {
    const c = getAudioCtx();
    if (!c) return;
    [523.25, 659.25].forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = f; o.connect(g); g.connect(c.destination);
      const t = c.currentTime + i * .25;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.12, t + .05); g.gain.exponentialRampToValueAtTime(.001, t + 1.2);
      o.start(t); o.stop(t + 1.3);
    });
  } catch {}
}
const secsOn = date => S.sessions.filter(s => s.date === date).reduce((a, s) => a + s.secs, 0);
const taskById = id => S.tasks.find(t => t.id === id);
const todayTasks = () => S.tasks.filter(t => t.date === today());

function weekStart(d = new Date()) { const x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function streaks() {
  const days = new Set(S.sessions.filter(s => s.secs >= 60).map(s => s.date));
  let cur = 0, d = new Date();
  if (!days.has(dkey(d))) d = addDays(d, -1);
  while (days.has(dkey(d))) { cur++; d = addDays(d, -1); }
  let best = 0, run = 0;
  [...days].sort().forEach((k, i, a) => {
    run = i && dkey(addDays(new Date(a[i-1] + 'T00:00'), 1)) === k ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return { cur, best };
}

/* ---------- timer ---------- */
const T = () => S.timer;
function startFocus({ taskId = null, secs, label = '', fromBlock = false }) {
  secs = secs || S.settings.focus * 60;
  S.timer = { mode: 'focus', endAt: Date.now() + secs * 1000, total: secs, taskId, startedAt: Date.now(), label, fromBlock, paused: false };
  save(); render();
}
function pauseTimer() {
  const t = T(); if (!t || t.paused) return;
  t.paused = true;
  t.remaining = Math.max(0, (t.endAt - Date.now()) / 1000);
  save(); render();
  toast('Timer paused.');
}
function resumeTimer() {
  const t = T(); if (!t || !t.paused) return;
  t.paused = false;
  t.endAt = Date.now() + (t.remaining || 0) * 1000;
  delete t.remaining;
  save(); render();
  toast('Timer resumed.');
}
function toggleTimerPause() {
  const t = T();
  if (!t) return;
  if (t.paused) resumeTimer();
  else pauseTimer();
}
function logSession(secs) {
  const t = T(); if (!t || secs < 60) return;
  const task = taskById(t.taskId);
  S.sessions.push({ id: uid(), taskId: t.taskId, projectId: task?.projectId || null, title: task ? task.title : (t.label || 'Unassigned'), date: dkey(t.startedAt), start: t.startedAt, secs: Math.round(secs) });
}
function startBreak() {
  const doneToday = S.sessions.filter(s => s.date === today() && s.secs >= S.settings.focus * 60 * .8).length;
  const long = doneToday > 0 && doneToday % S.settings.every === 0;
  const secs = (long ? S.settings.longBrk : S.settings.brk) * 60;
  tip = Math.floor(Math.random() * TIPS.length);
  S.timer = { mode: 'break', endAt: Date.now() + secs * 1000, total: secs, long, paused: false };
}
function finish() {
  const t = T();
  if (t.mode === 'focus') {
    logSession(t.total);
    chime(); notify('Focus session complete', 'Nice work. Time for a gentle break.');
    startBreak();
  } else {
    chime(); notify('Break over', 'Ready when you are.'); S.timer = null; toast('Break over — ready when you are.');
  }
  save(); render();
}
function stopTimer() {
  const t = T(); if (!t) return;
  if (t.mode === 'focus') {
    const el = t.paused
      ? Math.max(0, t.total - (t.remaining || 0))
      : Math.max(0, (Date.now() - t.startedAt) / 1000);
    if (el >= 60) { logSession(Math.min(el, t.total)); toast(`Logged ${fmtDur(el)} of focus.`); }
  }
  S.timer = null; save(); render();
}

/* ---------- calendar blocks ---------- */
function checkBlocks() {
  const now = Date.now(); let changed = false;
  for (const b of S.blocks) {
    if (b.state || now < b.start) continue;
    const end = b.start + b.mins * 60000;
    if (now >= end) { b.state = 'missed'; changed = true; continue; }
    if (!AUTO_KINDS.includes(b.kind || 'focus')) {
      b.state = 'ran'; changed = true;
      notify(`${kindOf(b).label} starting`, b.title); toast(`${kindOf(b).label}: ${b.title}`);
      continue;
    }
    if (T()) { b.state = 'skipped'; changed = true; toast(`"${b.title}" was skipped — a timer was already running.`); continue; }
    b.state = 'ran'; changed = true;
    startFocus({ taskId: b.taskId, secs: Math.round((end - now) / 1000), label: b.title, fromBlock: true });
    notify('Focus block started', b.title);
    toast(`Focus block started: ${b.title}`);
  }
  if (changed) { save(); if (view === 'calendar') render(); }
}
const icsDate = ms => new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, '');
function icsEvent(b) {
  return ['BEGIN:VEVENT', `UID:${b.id}@birch-focus`, `DTSTAMP:${icsDate(Date.now())}`, `DTSTART:${icsDate(b.start)}`,
    `DTEND:${icsDate(b.start + b.mins * 60000)}`, `SUMMARY:${kindOf(b).label} — ${b.title.replace(/[,;\\]/g, ' ')}`,
    'DESCRIPTION:Focus block from Birch', 'BEGIN:VALARM', 'TRIGGER:-PT5M', 'ACTION:DISPLAY', 'DESCRIPTION:Focus block starting', 'END:VALARM', 'END:VEVENT'];
}
function downloadIcs(blocks, name) {
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Birch Focus//EN', ...blocks.flatMap(icsEvent), 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const gcalUrl = b => `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(kindOf(b).label + ' — ' + b.title)}&dates=${icsDate(b.start)}/${icsDate(b.start + b.mins * 60000)}`;

/* ---------- views ---------- */
const V = {};

V.today = () => {
  const d = today(), tasks = todayTasks(), done = tasks.filter(t => t.done).length;
  const hr = new Date().getHours(), greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const overdue = S.tasks.filter(t => t.date < d && !t.done);
  const rev = S.reviews[d] || {};
  const moods = MOODS;
  return `
  <h1>${greet}</h1>
  <p class="sub">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>

  <section class="card">
    <h2>Planned for today</h2>
    ${(() => {
      const bs = S.blocks.filter(b => dkey(b.start) === d).sort((a, b) => a.start - b.start), now = Date.now();
      if (!bs.length) return `<p class="hint" style="margin:6px 0 0">Nothing scheduled yet. <button class="link" data-a="go-today-cal">Plan it in the calendar</button></p>`;
      return bs.map(b => {
        const end = b.start + b.mins * 60000, live = now >= b.start && now < end;
        return `<div class="task sched ${now >= end ? 'past' : ''} ${live ? 'live' : ''}">
          ${kdot(b)}
          <span class="t">${esc(b.title)} <span class="tag">${kindOf(b).label}</span></span>
          <span class="meta">${live ? 'Now · until ' + fmtT(end) : fmtT(b.start) + ' – ' + fmtT(end)}</span></div>`;
      }).join('');
    })()}
  </section>

  <section class="card">
    <h2>Plan your day</h2>
    <p class="hint">What would make today a good day?</p>
    <input type="text" class="grow" style="width:100%" data-intent placeholder="My one thing today…" value="${esc(S.intentions[d])}">
    <div style="height:14px"></div>
    <form class="row" data-form="task">
      <input type="text" name="title" class="grow" placeholder="Add a task" required maxlength="120">
      ${activeProjects().length ? `<select name="project" aria-label="Project"><option value="">No project</option>${activeProjects().map(p => `<option value="${p.id}">${esc(p.title)}</option>`).join('')}</select>` : ''}
      <button class="btn">Add</button>
    </form>
    ${overdue.length ? `<p class="hint" style="margin-top:12px">${overdue.length} unfinished from earlier. <button class="link" data-a="carry">Bring them to today</button></p>` : ''}
    <div style="margin-top:10px">
      ${tasks.length ? tasks.map(t => {
        const sec = S.sessions.filter(s => s.taskId === t.id && s.date === d).reduce((a, s) => a + s.secs, 0);
        return `<div class="task ${t.done ? 'done' : ''}">
          <button class="check" data-a="toggle" data-id="${t.id}" aria-label="Toggle done">✓</button>
          ${t.kind && t.kind !== 'todo' ? `${kdot(t)}` : ''}
          <span class="t">${esc(t.title)}${t.projectId && projById(t.projectId) ? ` <span class="tag">${esc(projById(t.projectId).title)}</span>` : ''}</span>
          ${sec ? `<span class="meta">${fmtDur(sec)}</span>` : ''}
          ${t.done || !['todo', 'focus', 'study', undefined].includes(t.kind) ? '' : `<button class="btn ghost sm" data-a="focus-task" data-id="${t.id}">Focus</button>`}
          <button class="link" data-a="del-task" data-id="${t.id}" aria-label="Delete">✕</button></div>`;
      }).join('') : '<div class="empty">No tasks yet. Add two or three — keep it small.</div>'}
    </div>
  </section>

  <section class="card">
    <h2>Review your day</h2>
    <p class="hint">${done} of ${tasks.length} tasks done · ${fmtDur(secsOn(d))} focused</p>
    <div class="moods" role="group" aria-label="How did today feel?">
      ${moods.map((m, i) => `<button class="${rev.mood === i + 1 ? 'on' : ''}" data-a="mood" data-n="${i + 1}" aria-label="Mood ${i + 1} of 5">${m}</button>`).join('')}
    </div>
    <textarea data-review placeholder="What went well? What will you carry into tomorrow?">${esc(rev.text)}</textarea>
    <div class="row" style="margin-top:12px"><button class="btn" data-a="save-review">Save reflection</button>
    ${rev.saved ? '<span class="meta">Saved ✓</span>' : ''}</div>
  </section>`;
};

const MOODS = ['Struggling', 'Slow', 'Steady', 'Good', 'Flowing'];
const MOOD_WORDS = MOODS;
const STATUS = { active: 'Active', paused: 'Paused', done: 'Done' };
let projId = null, ciMood = 0;
const projById = id => S.projects.find(p => p.id === id);
const activeProjects = () => S.projects.filter(p => p.status === 'active');
const projSecs = (id, dates) => S.sessions.filter(s => s.projectId === id && (!dates || dates.includes(s.date))).reduce((a, s) => a + s.secs, 0);
const daysAgo = k => Math.round((new Date(today() + 'T00:00') - new Date(k + 'T00:00')) / 864e5);

V.projects = () => {
  const p = projId && projById(projId);
  if (p) return projectDetail(p);
  const week = [...Array(7)].map((_, i) => dkey(addDays(weekStart(), i)));
  const order = { active: 0, paused: 1, done: 2 };
  const list = [...S.projects].sort((a, b) => order[a.status] - order[b.status]);
  return `<h1>Projects</h1><p class="sub">The bigger things your tasks add up to. Check in on them honestly.</p>
  <section class="card">
    <form class="row" data-form="project">
      <input type="text" name="title" class="grow" placeholder="Name a project" required maxlength="80">
      <input type="text" name="why" class="grow" placeholder="Why does it matter? (optional)" maxlength="200">
      <button class="btn">Create</button>
    </form>
  </section>
  ${list.length ? list.map(p => {
    const last = p.checkins[0], tasks = S.tasks.filter(t => t.projectId === p.id), done = tasks.filter(t => t.done).length;
    const age = last ? daysAgo(last.date) : null;
    const stale = p.status === 'active' && (age === null || age >= 7);
    return `<section class="card proj ${p.status}" data-a="open-proj" data-id="${p.id}" tabindex="0">
      <div class="row" style="justify-content:space-between"><h2>${esc(p.title)}</h2><span><span class="tag">${STATUS[p.status]}</span> <button class="link" data-a="del-proj" data-id="${p.id}" aria-label="Delete project" title="Delete project">Delete</button></span></div>
      ${p.why ? `<p class="hint" style="margin:2px 0 0">${esc(p.why)}</p>` : ''}
      <div class="row meta" style="margin-top:12px;gap:18px">
        <span>${fmtDur(projSecs(p.id, week))} this week</span>
        <span>${done}/${tasks.length} tasks</span>
        ${last ? `<span>${MOOD_WORDS[last.mood - 1] || 'Checked in'} · ${age === 0 ? 'today' : age + 'd ago'}</span>` : ''}
      </div>
      ${last?.next ? `<p style="margin:10px 0 0"><span class="meta">Next step:</span> ${esc(last.next)}</p>` : ''}
      ${stale ? `<p class="meta" style="margin:10px 0 0;color:var(--accent)">${age === null ? 'No check-ins yet' : 'Last check-in ' + age + ' days ago'} — worth a look.</p>` : ''}
    </section>`;
  }).join('') : '<div class="empty">No projects yet. Start with one thing you care about.</div>'}`;
};

function projectDetail(p) {
  const tasks = S.tasks.filter(t => t.projectId === p.id).sort((a, b) => a.done - b.done);
  const week = [...Array(7)].map((_, i) => dkey(addDays(weekStart(), i)));
  return `<button class="link" data-a="back-proj">← All projects</button>
  <h1 style="margin-top:8px">${esc(p.title)}</h1>
  <p class="sub">${p.why ? esc(p.why) : 'No “why” yet.'}</p>
  <div class="grid">
    <div class="card stat"><div class="meta">This week</div><div class="n">${fmtDur(projSecs(p.id, week))}</div></div>
    <div class="card stat"><div class="meta">All time</div><div class="n">${fmtDur(projSecs(p.id))}</div></div>
    <div class="card stat"><div class="meta">Status</div><div class="chips" style="margin-top:8px">
      ${Object.entries(STATUS).map(([k, v]) => `<button class="chip ${p.status === k ? 'on' : ''}" data-a="status" data-s="${k}">${v}</button>`).join('')}</div></div>
  </div>

  <section class="card">
    <h2>How's it going?</h2>
    <p class="hint">A quick, honest check-in. No one's grading it.</p>
    <form data-form="checkin">
      <div class="moods" id="ciMoods">${MOODS.map((m, i) => `<button type="button" class="${ciMood === i + 1 ? 'on' : ''}" data-a="ci-mood" data-n="${i + 1}" title="${MOOD_WORDS[i]}" aria-label="${MOOD_WORDS[i]}">${m}</button>`).join('')}</div>
      <textarea name="went" style="min-height:60px" placeholder="What moved forward?"></textarea>
      <textarea name="stuck" style="min-height:60px;margin-top:8px" placeholder="What's in the way, or feeling heavy?"></textarea>
      <div class="row" style="margin-top:8px"><input type="text" name="next" class="grow" placeholder="Next small step" maxlength="160">
      <button class="btn">Save check-in</button></div>
    </form>
  </section>

  <section class="card">
    <h2>Tasks</h2>
    <form class="row" data-form="ptask" style="margin:10px 0">
      <input type="text" name="title" class="grow" placeholder="Add a task to this project" required maxlength="120"><button class="btn ghost">Add for today</button>
    </form>
    ${tasks.length ? tasks.map(t => `<div class="task ${t.done ? 'done' : ''}">
      <button class="check" data-a="toggle" data-id="${t.id}" aria-label="Toggle done">✓</button><span class="t">${esc(t.title)}</span>
      ${!t.done && t.date !== today() ? `<button class="btn ghost sm" data-a="plan-today" data-id="${t.id}">Plan today</button>` : ''}
      <button class="link" data-a="del-task" data-id="${t.id}" aria-label="Delete">✕</button></div>`).join('') : '<div class="empty">No tasks linked yet.</div>'}
  </section>

  <section class="card">
    <h2>Reflections</h2>
    ${p.checkins.length ? p.checkins.map(c => `<div class="entry">
      <div class="meta">${new Date(c.date + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${MOOD_WORDS[c.mood - 1] || ''}</div>
      ${c.went ? `<p><b>Moved:</b> ${esc(c.went)}</p>` : ''}${c.stuck ? `<p><b>In the way:</b> ${esc(c.stuck)}</p>` : ''}${c.next ? `<p><b>Next:</b> ${esc(c.next)}</p>` : ''}</div>`).join('') : '<div class="empty">Your check-ins will build a timeline here.</div>'}
  </section>
  <button class="btn ghost sm" data-a="del-proj" data-id="${p.id}">Delete project</button>`;
}

V.focus = () => {
  const t = T(), st = S.settings;
  if (t && t.mode === 'break') {
    const tp = TIPS[tip];
    const isPaused = !!t.paused;
    const left = isPaused ? t.remaining : (t.endAt - Date.now()) / 1000;
    return `<h1>Take a break</h1><p class="sub">${t.long ? 'A longer one — you earned it.' : 'Step away for a moment.'}</p>
    <section class="card breakcard">
      <div class="breathe-box">
        <div class="breathe-halo"></div>
        <div class="breathe-circle">
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/>
            <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
          </svg>
        </div>
      </div>
      <p class="breathe-cue">Breathe in gently... and release.</p>
      <h2>${esc(tp.t)}</h2>
      <p>${esc(tp.d)}</p>
      <div class="meta" style="margin-bottom:18px">Break ends in <b id="clock">${clockStr(left)}</b>${isPaused ? ' · Paused' : ''}</div>
      <div class="row" style="justify-content:center;gap:10px">
        <button class="btn ghost" data-a="tip">Another idea</button>
        <button class="btn ghost" data-a="${isPaused ? 'resume' : 'pause'}">${isPaused ? 'Resume' : 'Pause'}</button>
        <button class="btn" data-a="skip-break">I'm ready to focus</button>
      </div>
    </section>`;
  }
  const open = todayTasks().filter(x => !x.done);
  const running = t && t.mode === 'focus';
  const isPaused = running && !!t.paused;
  const R = 118, C = 2 * Math.PI * R;
  const left = running ? (isPaused ? t.remaining : (t.endAt - Date.now()) / 1000) : st.focus * 60;
  const total = running ? t.total : st.focus * 60;
  const cur = running && t.taskId ? taskById(t.taskId) : null;
  return `<h1>Focus</h1><p class="sub">One thing at a time.</p>
  <section class="card timer">
    <div class="ring ${isPaused ? 'paused' : ''}">
      <svg width="260" height="260" viewBox="0 0 260 260"><circle cx="130" cy="130" r="${R}" fill="none" stroke="var(--birch-100)" stroke-width="10"/>
        <circle id="arc" cx="130" cy="130" r="${R}" fill="none" stroke="var(--accent)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${running ? C * (1 - left / total) : 0}"/></svg>
      <div class="clock" id="clock">${clockStr(left)}</div>
      ${isPaused ? '<span class="lbl">Paused</span>' : ''}
    </div>
    ${running ? `
      <div style="margin:-6px 0 20px">
        ${cur ? `
          <div class="row" style="justify-content:center;gap:8px">
            <span class="meta" style="font-size:1rem;color:var(--ink)">${esc(cur.title)}</span>
            ${cur.done
              ? `<span class="badge-done">✓ Completed</span>`
              : `<button class="btn ghost sm" data-a="done-active" data-id="${cur.id}">✓ Complete task</button>`}
          </div>
        ` : `<p class="meta" style="font-size:1rem;color:var(--ink)">${esc(t.label || 'Open focus')}</p>`}
      </div>
      <div class="row" style="justify-content:center;gap:12px">
        <button class="btn big" data-a="${isPaused ? 'resume' : 'pause'}">${isPaused ? 'Resume' : 'Pause'}</button>
        <button class="btn ghost big" data-a="stop">${t.fromBlock ? 'End block' : 'Stop'}</button>
      </div>
    ` : `
      <div class="row" style="justify-content:center;margin-bottom:18px">
        <select id="taskSel" aria-label="Task">
          <option value="">No specific task</option>
          ${open.map(x => `<option value="${x.id}" ${x.id === focusSel ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}
        </select>
      </div>
      <div class="chips" style="justify-content:center;align-items:center;margin-bottom:20px;gap:8px">
        ${[15, 25, 45, 60].map(m => `<button class="chip ${st.focus === m ? 'on' : ''}" data-a="len" data-m="${m}">${m} min</button>`).join('')}
        <span class="row" style="align-items:center;gap:4px">
          <input type="number" id="customLen" min="1" max="180" style="width:64px;padding:6px 8px;text-align:center" placeholder="mins" value="${[15, 25, 45, 60].includes(st.focus) ? '' : st.focus}">
          <button class="btn ghost sm" data-a="set-custom-len">Set</button>
        </span>
      </div>
      <button class="btn big" data-a="start">Start focusing</button>
      <p class="meta" style="margin-top:18px">Breaks: ${[5, 10, 15].map(m => `<button class="link" style="${st.brk === m ? 'color:var(--ink);font-weight:600' : ''}" data-a="brk" data-m="${m}">${m} min</button>`).join('·')}</p>
    `}
  </section>`;
};
let focusSel = '';

let calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1), calSel = null;
const dayItems = k => ({
  tasks: S.tasks.filter(t => t.date === k),
  blocks: S.blocks.filter(b => dkey(b.start) === k).sort((a, b) => a.start - b.start)
});

V.calendar = () => {
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7, dim = new Date(y, m + 1, 0).getDate();
  const cells = Math.ceil((lead + dim) / 7) * 7;
  const notifOk = 'Notification' in window && Notification.permission === 'granted';
  let grid = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < cells; i++) {
    const n = i - lead + 1;
    if (n < 1 || n > dim) { grid += '<div class="cell blank"></div>'; continue; }
    const k = dkey(new Date(y, m, n)), it = dayItems(k), count = it.tasks.length + it.blocks.length;
    grid += `<button class="cell ${k === today() ? 'today' : ''} ${k === calSel ? 'sel' : ''}" data-a="pick-day" data-k="${k}" aria-label="${k}">
      <span class="num">${n}</span>
      ${count ? `<span class="dots">${'<i></i>'.repeat(Math.min(count, 4))}</span>` : ''}</button>`;
  }
  return `<h1>Calendar</h1><p class="sub">Tap a day and write down what you want to do.</p>
  <section class="card">
    <div class="row" style="justify-content:space-between;margin-bottom:14px">
      <h2>${calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
      <div class="row"><button class="btn ghost sm" data-a="cal-prev" aria-label="Previous month">‹</button>
      <button class="btn ghost sm" data-a="cal-today">Today</button>
      <button class="btn ghost sm" data-a="cal-next" aria-label="Next month">›</button></div>
    </div>
    <div class="cal">${grid}</div>
  </section>
  <p class="hint">Add a time to turn something into a focus block that starts on its own while Birch is open.
    ${notifOk ? '' : '<button class="link" data-a="notif">Enable notifications</button>'}
    ${S.blocks.some(b => !b.state || b.state === 'ran') ? '<button class="link" data-a="ics-all">Export all blocks (.ics)</button>' : ''}</p>
  ${calSel ? dayModal(calSel) : ''}`;
};

function dayModal(k) {
  const it = dayItems(k), d = new Date(k + 'T00:00');
  return `<div class="overlay" data-a="close-day"><div class="sheet" role="dialog" aria-label="${k}">
    <div class="row" style="justify-content:space-between"><h2>${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
      <button class="link" data-a="close-day" aria-label="Close">✕</button></div>
    <div class="chips" id="kindChips" style="margin:14px 0 10px">
      ${Object.entries(KINDS).map(([key, v]) => `<button type="button" class="chip ${dayKind === key ? 'on' : ''}" data-a="day-kind" data-k="${key}">${v.label}</button>`).join('')}
    </div>
    <form class="row" data-form="dayadd" style="margin-bottom:6px">
      <input type="text" id="dayInput" name="title" class="grow" placeholder="${KINDS[dayKind].ph}" required maxlength="120" autocomplete="off">
      <span class="row" id="timeBits" ${dayKind === 'todo' ? 'hidden' : ''}>
        <input type="time" name="time" aria-label="Start time">
        <select name="mins" aria-label="Length">${[25, 30, 45, 60, 90, 120].map(m => `<option value="${m}" ${m === 60 ? 'selected' : ''}>${m} min</option>`).join('')}</select>
      </span>
      <button class="btn">Add</button>
    </form>
    <p class="meta" style="margin:0 0 10px">${'Add a start time to put it on your schedule. Focus and Study sessions start automatically.'}</p>
    ${it.blocks.map(b => `<div class="task">${kdot(b)}<span class="t">${esc(b.title)}
        <span class="meta">${fmtT(b.start)} · ${b.mins}m · ${kindOf(b).label}</span></span>
        <button class="link" data-a="ics" data-id="${b.id}">.ics</button>
        <a class="link" target="_blank" rel="noopener" href="${gcalUrl(b)}">Google</a>
        <button class="link" data-a="del-block" data-id="${b.id}" aria-label="Remove">✕</button></div>`).join('')}
    ${it.tasks.map(t => `<div class="task ${t.done ? 'done' : ''}">
        <button class="check" data-a="toggle" data-id="${t.id}" aria-label="Toggle done">✓</button>
        ${t.kind && t.kind !== 'todo' ? `${kdot(t)}` : ''}<span class="t">${esc(t.title)}</span>
        <button class="link" data-a="del-task" data-id="${t.id}" aria-label="Delete">✕</button></div>`).join('')}
    ${it.tasks.length + it.blocks.length ? '' : '<div class="empty">Nothing planned yet.</div>'}
  </div></div>`;
}

const PROMPTS = [
  'What is on your mind right now?',
  'What went well today, even something small?',
  'What drained your energy today, and what gave you some back?',
  'What are you avoiding, and what is one gentle step toward it?',
  'What are you grateful for this week?',
  'What would make tomorrow feel good?',
  'What did you learn recently that you want to remember?',
  'How are you really feeling, in a few honest sentences?',
  'What is one thing you are proud of lately?',
  'Write freely. No one is reading this but you.'
];
let jMood = 0, jEdit = null, jQuery = '', jDraft = '', jPrompt = Math.floor(Date.now() / 864e5) % PROMPTS.length;

function journalList() {
  const q = jQuery.trim().toLowerCase();
  const es = S.journal.filter(e => !q || e.text.toLowerCase().includes(q)).sort((a, b) => b.ts - a.ts);
  if (!es.length) return `<div class="empty">${q ? 'No entries match your search.' : 'Your entries will appear here.'}</div>`;
  let html = '', lastDay = '';
  for (const e of es) {
    if (e.date !== lastDay) {
      lastDay = e.date;
      html += `<h3 class="jday">${new Date(e.date + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h3>`;
    }
    const time = new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    html += `<article class="card jentry">
      <div class="row" style="justify-content:space-between"><span class="meta">${time}${e.mood ? ` · ${MOOD_WORDS[e.mood - 1]}` : ''}</span>
        <span>${jEdit === e.id ? '' : `<button class="link" data-a="j-edit" data-id="${e.id}">Edit</button><button class="link" data-a="j-del" data-id="${e.id}">Delete</button>`}</span></div>
      ${e.prompt ? `<p class="jprompt">${esc(e.prompt)}</p>` : ''}
      ${jEdit === e.id
        ? `<textarea id="jEditText" style="min-height:140px;margin-top:8px">${esc(e.text)}</textarea>
           <div class="row" style="margin-top:10px"><button class="btn sm" data-a="j-save-edit" data-id="${e.id}">Save</button><button class="btn ghost sm" data-a="j-cancel">Cancel</button></div>`
        : `<p class="jtext">${esc(e.text)}</p>`}
    </article>`;
  }
  return html;
}

V.journal = () => `<h1>Journal</h1><p class="sub">A private place to think things through.</p>
  <section class="card">
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      <p class="jprompt" id="jPrompt" style="margin:0">${PROMPTS[jPrompt]}</p>
      <button class="link" data-a="j-prompt">Another prompt</button>
    </div>
    <div class="moods" id="jMoods" role="group" aria-label="How are you feeling?">${MOODS.map((m, i) => `<button type="button" class="${jMood === i + 1 ? 'on' : ''}" data-a="j-mood" data-n="${i + 1}" title="${MOOD_WORDS[i]}" aria-label="${MOOD_WORDS[i]}">${m}</button>`).join('')}</div>
    <textarea id="jNew" style="min-height:160px" placeholder="Start writing…">${esc(jDraft)}</textarea>
    <div class="row" style="justify-content:space-between;align-items:center;margin-top:12px">
      <div class="row">
        <button class="btn" data-a="j-save">Save entry</button>
        <span class="meta">${S.journal.length} ${S.journal.length === 1 ? 'entry' : 'entries'} so far</span>
      </div>
      ${S.journal.length ? `<button class="link" data-a="export-journal">Export all (.md)</button>` : ''}
    </div>
  </section>
  ${S.journal.length ? `<input type="text" id="jSearch" class="grow" style="width:100%;margin-bottom:6px" placeholder="Search your entries" value="${esc(jQuery)}">` : ''}
  <div id="jList">${journalList()}</div>`;

const JOURNAL_ACTIONS = {
  'export-journal': () => {
    if (!S.journal.length) return toast('No journal entries to export.');
    const lines = ['# Birch Journal Entries', '', `*Exported on ${new Date().toLocaleDateString(undefined, { dateStyle: 'full' })}*`, ''];
    [...S.journal].sort((a, b) => b.ts - a.ts).forEach(e => {
      const dt = new Date(e.ts).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' });
      lines.push(`## ${dt}${e.mood ? ` · ${MOOD_WORDS[e.mood - 1]}` : ''}`);
      if (e.prompt) lines.push(`> ${e.prompt}`);
      lines.push('');
      lines.push(e.text);
      lines.push('', '---', '');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `birch-journal-${today()}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Journal exported as Markdown.');
  },
  'j-mood': b => {
    jMood = jMood === +b.dataset.n ? 0 : +b.dataset.n;
    document.querySelectorAll('#jMoods button').forEach(x => x.classList.toggle('on', +x.dataset.n === jMood));
  },
  'j-prompt': () => { jPrompt = (jPrompt + 1) % PROMPTS.length; $('#jPrompt').textContent = PROMPTS[jPrompt]; $('#jNew').focus(); },
  'j-save': () => {
    const text = ($('#jNew')?.value ?? jDraft).trim();
    if (!text) return toast('Write a few words first.');
    S.journal.push({ id: uid(), date: today(), ts: Date.now(), mood: jMood, prompt: PROMPTS[jPrompt], text });
    jDraft = ''; jMood = 0; jPrompt = (jPrompt + 1) % PROMPTS.length; save(); render(); toast('Entry saved.');
  },
  'j-edit': b => { jEdit = b.dataset.id; render(); $('#jEditText')?.focus(); },
  'j-cancel': () => { jEdit = null; render(); },
  'j-save-edit': b => {
    const text = $('#jEditText').value.trim();
    if (!text) return toast('An entry can’t be empty — delete it instead.');
    const e = S.journal.find(x => x.id === b.dataset.id); e.text = text; e.edited = Date.now();
    jEdit = null; save(); render();
  },
  'j-del': b => {
    if (!confirm('Delete this journal entry?')) return;
    S.journal = S.journal.filter(x => x.id !== b.dataset.id); save(); render();
  }
};
document.addEventListener('input', e => {
  if (e.target.id === 'jSearch') { jQuery = e.target.value; $('#jList').innerHTML = journalList(); }
  if (e.target.id === 'jNew') { jDraft = e.target.value; }
  if (e.target.matches('[data-intent]')) { S.intentions[today()] = e.target.value; save(); }
  if (e.target.matches('[data-review]')) {
    const r = (S.reviews[today()] ||= {});
    r.text = e.target.value;
    r.saved = false;
    save();
  }
});

V.stats = () => {
  const d = today(), ws = weekStart();
  const week = [...Array(7)].map((_, i) => dkey(addDays(ws, i)));
  const weekSecs = week.reduce((a, k) => a + secsOn(k), 0);
  const last7 = [...Array(7)].map((_, i) => addDays(new Date(), i - 6));
  const vals = last7.map(x => secsOn(dkey(x)));
  const max = Math.max(...vals, 3600);
  const { cur, best } = streaks();
  const byTask = {};
  S.sessions.filter(s => week.includes(s.date)).forEach(s => { const k = s.taskId || '_' + s.title; (byTask[k] ||= { title: s.title, secs: 0 }).secs += s.secs; });
  const rows = Object.values(byTask).sort((a, b) => b.secs - a.secs);
  const rmax = rows[0]?.secs || 1;
  const doneWeek = S.tasks.filter(t => t.done && week.includes(t.date)).length;
  return `<h1>Stats</h1><p class="sub">Just the numbers that matter.</p>
  <div class="grid">
    <div class="card stat"><div class="meta">Today</div><div class="n">${fmtDur(secsOn(d))}</div></div>
    <div class="card stat"><div class="meta">This week</div><div class="n">${fmtDur(weekSecs)}</div><div class="meta">${doneWeek} tasks done</div></div>
    <div class="card stat"><div class="meta">Streak</div><div class="n">${cur} day${cur === 1 ? '' : 's'}</div><div class="meta">Best: ${best}</div></div>
  </div>
  <section class="card"><h2>Last 7 days</h2>
    <div class="bars">${last7.map((x, i) => `<div class="bar ${i === 6 ? 'today' : ''}" title="${fmtDur(vals[i])}"><span>${vals[i] ? fmtDur(vals[i]) : ''}</span><i style="height:${Math.max(3, vals[i] / max * 100)}%"></i><span>${x.toLocaleDateString(undefined, { weekday: 'short' })}</span></div>`).join('')}</div>
  </section>
  <section class="card"><h2>Where the time went</h2><p class="hint">This week, by task</p>
    ${rows.length ? rows.map(r => `<div style="margin-bottom:14px"><div class="row" style="justify-content:space-between"><span>${esc(r.title)}</span><span class="meta">${fmtDur(r.secs)}</span></div><div class="hbar"><i style="width:${r.secs / rmax * 100}%"></i></div></div>`).join('') : '<div class="empty">Complete a focus session and it will show up here.</div>'}
  </section>
  <section class="card">
    <h2>Timer & Rhythm Preferences</h2>
    <p class="hint">Tailor your focus and break intervals to your natural workflow.</p>
    <div class="grid">
      <div>
        <label class="meta" for="setFocus">Focus duration</label>
        <select id="setFocus" data-set="focus" style="width:100%;margin-top:6px">
          ${[15, 20, 25, 30, 45, 50, 60, 90].map(m => `<option value="${m}" ${S.settings.focus === m ? 'selected' : ''}>${m} minutes</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="meta" for="setBrk">Short break</label>
        <select id="setBrk" data-set="brk" style="width:100%;margin-top:6px">
          ${[3, 5, 8, 10, 15].map(m => `<option value="${m}" ${S.settings.brk === m ? 'selected' : ''}>${m} minutes</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="meta" for="setLongBrk">Long break</label>
        <select id="setLongBrk" data-set="longBrk" style="width:100%;margin-top:6px">
          ${[10, 15, 20, 25, 30].map(m => `<option value="${m}" ${S.settings.longBrk === m ? 'selected' : ''}>${m} minutes</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="meta" for="setEvery">Long break every</label>
        <select id="setEvery" data-set="every" style="width:100%;margin-top:6px">
          ${[2, 3, 4, 5, 6].map(c => `<option value="${c}" ${S.settings.every === c ? 'selected' : ''}>${c} sessions</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="row" style="margin-top:14px;gap:10px">
      <button class="btn ghost sm" data-a="toggle-sound">${S.settings.sound !== false ? 'Sound: Enabled' : 'Sound: Muted'}</button>
      <button class="btn ghost sm" data-a="toggle-theme">${isDark(themeId()) ? 'Switch to light' : 'Switch to Twilight'}</button>
    </div>
    <p class="meta" style="margin:16px 0 8px">Colour theme</p>
    <div class="chips">${THEMES.map(t => `<button class="swchip ${themeId() === t.id ? 'on' : ''}" data-a="set-theme" data-t="${t.id}">${swatch(t)}${t.name}</button>`).join('')}</div>
  </section>
  <section class="card">
    <h2>Data & Backup</h2>
    <p class="hint">Birch keeps your data strictly in this browser. Export a JSON backup to keep your focus history, projects, and journal entries safe.</p>
    <div class="row">
      <button class="btn ghost sm" data-a="export-data">Export backup (.json)</button>
      <label class="btn ghost sm" style="cursor:pointer">Import backup<input type="file" id="importFile" accept=".json" style="display:none"></label>
    </div>
  </section>`;
};

/* ---------- render & live updates ---------- */
function render() {
  applyTheme();
  updateSoundBtn();
  document.querySelectorAll('#nav [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === view));
  const m = $('#main'); m.innerHTML = V[view]();
  updateLive();
  if (view === 'calendar' && calSel) { const i = $('#dayInput'); if (i) i.focus(); }
}
function updateLive() {
  const t = T(), pill = $('#pill');
  if (t) {
    const isPaused = !!t.paused;
    const left = isPaused ? t.remaining : (t.endAt - Date.now()) / 1000;
    pill.hidden = false; pill.dataset.a = 'nav'; pill.dataset.v = 'focus';
    pill.textContent = `${isPaused ? 'Paused' : (t.mode === 'focus' ? 'Focusing' : 'Break')} · ${clockStr(left)}`;
    document.title = `${isPaused ? '⏸ ' : ''}${clockStr(left)} · Birch`;
    const c = $('#clock'); if (c) c.textContent = clockStr(left);
    const arc = $('#arc'); if (arc) arc.setAttribute('stroke-dashoffset', 2 * Math.PI * 118 * (1 - left / t.total));
    const ring = $('.ring'); if (ring) ring.classList.toggle('paused', isPaused);
  } else { pill.hidden = true; document.title = 'Birch — Daily Focus'; }
}
setInterval(() => {
  checkBlocks();
  const t = T();
  if (t) {
    if (t.paused) updateLive();
    else if (Date.now() >= t.endAt) finish();
    else updateLive();
  }
}, 1000);

/* ---------- events ---------- */
let lastDeletedTask = null, lastDeletedTaskIndex = -1;
let lastDeletedBlock = null, lastDeletedBlockIndex = -1;

const A = {
  ...JOURNAL_ACTIONS,
  nav: b => { view = b.dataset.v; render(); },
  toggle: b => { const t = taskById(b.dataset.id); t.done = !t.done; save(); render(); },
  'del-task': b => {
    const idx = S.tasks.findIndex(t => t.id === b.dataset.id);
    if (idx === -1) return;
    const t = S.tasks[idx];
    lastDeletedTask = t;
    lastDeletedTaskIndex = idx;
    S.tasks.splice(idx, 1);
    save(); render();
    toast(`Deleted "${t.title}".`, 'Undo', () => {
      if (lastDeletedTask) {
        S.tasks.splice(Math.min(lastDeletedTaskIndex, S.tasks.length), 0, lastDeletedTask);
        lastDeletedTask = null;
        save(); render();
        toast('Task restored.');
      }
    });
  },
  carry: () => {
    const past = S.tasks.filter(t => t.date < today() && !t.done);
    past.forEach(t => t.date = today());
    save(); render();
    toast(`${past.length} unfinished ${past.length === 1 ? 'task' : 'tasks'} brought to today.`);
  },
  'focus-task': b => { focusSel = b.dataset.id; view = 'focus'; render(); },
  mood: b => {
    const r = (S.reviews[today()] ||= {});
    const revInput = $('[data-review]');
    if (revInput) r.text = revInput.value;
    r.mood = +b.dataset.n;
    r.saved = false;
    save();
    document.querySelectorAll('.moods [data-a="mood"]').forEach(btn => {
      btn.classList.toggle('on', +btn.dataset.n === r.mood);
    });
  },
  'save-review': () => {
    const r = (S.reviews[today()] ||= {});
    const revInput = $('[data-review]');
    if (revInput) r.text = revInput.value;
    r.saved = true;
    save(); render();
    toast('Reflection saved. See you tomorrow.');
  },
  pause: pauseTimer,
  resume: resumeTimer,
  'done-active': b => {
    const t = taskById(b.dataset.id);
    if (t) {
      t.done = true;
      save(); render();
      toast('Task completed! Keep flowing or stop anytime.');
    }
  },
  'set-custom-len': () => {
    const val = parseInt($('#customLen')?.value, 10);
    if (val && val >= 1 && val <= 180) {
      S.settings.focus = val;
      save(); render();
      toast(`Focus duration set to ${val} minutes.`);
    } else {
      toast('Please enter between 1 and 180 minutes.');
    }
  },
  'toggle-sound': () => {
    S.settings.sound = S.settings.sound === false;
    save();
    updateSoundBtn();
    if (view === 'stats') render();
    toast(S.settings.sound ? 'Chime sound enabled.' : 'Chime sound muted.');
  },
  'toggle-theme': () => {
    S.settings.theme = isDark(themeId()) ? 'light' : 'twilight';
    save();
    applyTheme();
    if (view === 'stats') render();
    toast(`${themeName(themeId())} theme active.`);
  },
  'theme-menu': b => { $('#themeMenu') ? closeThemeMenu() : openThemeMenu(b); },
  'set-theme': b => {
    S.settings.theme = b.dataset.t;
    save(); closeThemeMenu(); applyTheme();
    if (view === 'stats') render();
    toast(`${themeName(themeId())} theme active.`);
  },
  len: b => { S.settings.focus = +b.dataset.m; save(); render(); },
  brk: b => { S.settings.brk = +b.dataset.m; save(); render(); },
  start: () => { startFocus({ taskId: $('#taskSel')?.value || null }); },
  stop: stopTimer,
  tip: () => { tip = (tip + 1 + Math.floor(Math.random() * (TIPS.length - 1))) % TIPS.length; render(); },
  'skip-break': () => { S.timer = null; save(); render(); },
  'del-block': b => {
    const idx = S.blocks.findIndex(x => x.id === b.dataset.id);
    if (idx === -1) return;
    const blk = S.blocks[idx];
    lastDeletedBlock = blk;
    lastDeletedBlockIndex = idx;
    S.blocks.splice(idx, 1);
    save(); render();
    toast(`Removed "${blk.title}".`, 'Undo', () => {
      if (lastDeletedBlock) {
        S.blocks.splice(Math.min(lastDeletedBlockIndex, S.blocks.length), 0, lastDeletedBlock);
        lastDeletedBlock = null;
        save(); render();
        toast('Block restored.');
      }
    });
  },
  ics: b => { const x = S.blocks.find(y => y.id === b.dataset.id); downloadIcs([x], 'focus-block.ics'); },
  'ics-all': () => downloadIcs(S.blocks.filter(b => !b.state || b.state === 'ran'), 'focus-blocks.ics'),
  'open-proj': b => { projId = b.dataset.id; ciMood = 0; render(); window.scrollTo(0, 0); },
  'back-proj': () => { projId = null; render(); },
  status: b => { projById(projId).status = b.dataset.s; save(); render(); },
  'ci-mood': b => {
    ciMood = +b.dataset.n;
    document.querySelectorAll('#ciMoods button').forEach(x => x.classList.toggle('on', x === b));
  },
  'plan-today': b => { taskById(b.dataset.id).date = today(); save(); render(); toast('Added to today.'); },
  'del-proj': b => {
    const id = b.dataset.id || projId, p = projById(id);
    if (!p || !confirm(`Delete “${p.title}” and its check-ins? Its tasks are kept.`)) return;
    S.tasks.forEach(t => { if (t.projectId === id) t.projectId = null; });
    S.projects = S.projects.filter(x => x.id !== id); projId = null; save(); render(); toast('Project deleted.');
  },
  'pick-day': b => { calSel = b.dataset.k; dayKind = 'todo'; render(); },
  'day-kind': b => {
    dayKind = b.dataset.k;
    document.querySelectorAll('#kindChips .chip').forEach(x => x.classList.toggle('on', x === b));
    $('#timeBits').hidden = dayKind === 'todo';
    const i = $('#dayInput'); i.placeholder = KINDS[dayKind].ph; i.focus();
  },
  'go-today-cal': () => { view = 'calendar'; calSel = today(); dayKind = 'todo'; calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1); render(); },
  'close-day': (b, e) => { if (e.target === b || b.tagName === 'BUTTON') { calSel = null; render(); } },
  'cal-prev': () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); render(); },
  'cal-next': () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); render(); },
  'cal-today': () => { const n = new Date(); calMonth = new Date(n.getFullYear(), n.getMonth(), 1); render(); },
  notif: async () => { try { await Notification.requestPermission(); } catch {} render(); },
  'export-data': () => {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `birch-backup-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Backup downloaded.');
  }
};
document.addEventListener('click', e => {
  getAudioCtx();
  if (e.target.id === 'toastAct' && toastAction) {
    const fn = toastAction;
    toastAction = null;
    $('#toast').classList.remove('show');
    fn();
    return;
  }
  const b = e.target.closest('[data-a]'); if (b && A[b.dataset.a]) A[b.dataset.a](b, e);
});
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-form]'); if (!f) return; e.preventDefault();
  const fd = Object.fromEntries(new FormData(f));
  if (f.dataset.form === 'task') {
    S.tasks.push({ id: uid(), title: fd.title.trim(), date: today(), done: false, projectId: fd.project || null });
  } else if (f.dataset.form === 'dayadd') {
    const title = fd.title.trim();
    if (dayKind !== 'todo' && fd.time) {
      const start = new Date(calSel + 'T' + fd.time).getTime(), mins = +fd.mins;
      S.blocks.push({ id: uid(), title, kind: dayKind, taskId: null, start, mins, state: start + mins * 60000 <= Date.now() ? 'missed' : null });
      toast(`${KINDS[dayKind].label} added at ${fmtT(start)}.`);
    } else S.tasks.push({ id: uid(), title, kind: dayKind, date: calSel, done: false, projectId: null });
  } else if (f.dataset.form === 'project') {
    const p = { id: uid(), title: fd.title.trim(), why: (fd.why || '').trim(), status: 'active', created: today(), checkins: [] };
    S.projects.push(p); projId = p.id; ciMood = 0;
  } else if (f.dataset.form === 'ptask') {
    S.tasks.push({ id: uid(), title: fd.title.trim(), date: today(), done: false, projectId: projId });
  } else if (f.dataset.form === 'checkin') {
    const c = { id: uid(), date: today(), mood: ciMood, went: fd.went.trim(), stuck: fd.stuck.trim(), next: fd.next.trim() };
    if (!c.mood && !c.went && !c.stuck && !c.next) return toast('Add a mood or a few words first.');
    projById(projId).checkins.unshift(c); ciMood = 0; toast('Check-in saved.');
  }
  save(); render();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && calSel) { calSel = null; render(); return; }
  if (e.key === 'Enter') {
    if (e.target.id === 'customLen') { A['set-custom-len'](); return; }
    if (e.target.matches('.proj[data-a]')) { A[e.target.dataset.a](e.target); return; }
  }
  const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (isInput) return;

  if (e.code === 'Space') {
    e.preventDefault();
    const t = T();
    if (t) toggleTimerPause();
    else if (view === 'focus') A.start();
    else { view = 'focus'; render(); }
    return;
  }

  const tabKeys = { '1': 'today', '2': 'projects', '3': 'focus', '4': 'calendar', '5': 'journal', '6': 'stats' };
  if (tabKeys[e.key]) {
    view = tabKeys[e.key];
    render();
  }
});
document.addEventListener('change', e => {
  if (e.target.matches('[data-intent]')) { S.intentions[today()] = e.target.value; save(); }
  if (e.target.id === 'taskSel') focusSel = e.target.value;
  if (e.target.dataset.set) {
    S.settings[e.target.dataset.set] = +e.target.value;
    save();
    toast('Timer preference updated.');
  }
  if (e.target.id === 'importFile' && e.target.files?.length) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const d = JSON.parse(ev.target.result);
        if (!d || typeof d !== 'object') throw new Error('Invalid backup file');
        if (!confirm('Import this backup? It will replace all current data.')) {
          e.target.value = '';
          return;
        }
        S = { ...DEFAULTS, ...d, settings: { ...DEFAULTS.settings, ...(d.settings || {}) } };
        save();
        render();
        toast('Backup restored successfully.');
      } catch {
        toast('Failed to import backup: invalid file format.');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  }
});

render();
if (T() && Date.now() >= T().endAt) finish();

/* close the theme menu on outside click / Escape */
document.addEventListener('click', e => { if (!e.target.closest('#themeMenu, [data-a="theme-menu"]')) closeThemeMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeThemeMenu(); });
