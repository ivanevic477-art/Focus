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
  settings: { focus: 25, brk: 5, longBrk: 15, every: 4 }
};
let S = load();
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY)) || {};
    return { ...DEFAULTS, ...d, settings: { ...DEFAULTS.settings, ...(d.settings || {}) } };
  } catch { return structuredClone(DEFAULTS); }
}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };

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
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 3500);
}
function notify(title, body) {
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body }); } catch {}
}
function chime() {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)();
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
  S.timer = { mode: 'focus', endAt: Date.now() + secs * 1000, total: secs, taskId, startedAt: Date.now(), label, fromBlock };
  save(); render();
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
  S.timer = { mode: 'break', endAt: Date.now() + secs * 1000, total: secs, long };
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
    const el = (Date.now() - t.startedAt) / 1000;
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
  const yest = S.tasks.filter(t => t.date === dkey(addDays(new Date(), -1)) && !t.done);
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
    ${yest.length ? `<p class="hint" style="margin-top:12px">${yest.length} unfinished from yesterday. <button class="link" data-a="carry">Bring them to today</button></p>` : ''}
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
    return `<h1>Take a break</h1><p class="sub">${t.long ? 'A longer one — you earned it.' : 'Step away for a moment.'}</p>
    <section class="card breakcard">
      <div class="big-ico"></div><h2>${tp.t}</h2><p>${tp.d}</p>
      <div class="meta" style="margin-bottom:18px">Break ends in <b id="clock">${clockStr((t.endAt - Date.now()) / 1000)}</b></div>
      <div class="row" style="justify-content:center">
        <button class="btn ghost" data-a="tip">Another idea</button>
        <button class="btn" data-a="skip-break">I'm ready to focus</button>
      </div>
    </section>`;
  }
  const open = todayTasks().filter(x => !x.done);
  const running = t && t.mode === 'focus';
  const R = 118, C = 2 * Math.PI * R;
  const left = running ? (t.endAt - Date.now()) / 1000 : st.focus * 60;
  const total = running ? t.total : st.focus * 60;
  const cur = running ? taskById(t.taskId) : null;
  return `<h1>Focus</h1><p class="sub">One thing at a time.</p>
  <section class="card timer">
    <div class="ring">
      <svg width="260" height="260" viewBox="0 0 260 260"><circle cx="130" cy="130" r="${R}" fill="none" stroke="var(--birch-100)" stroke-width="10"/>
        <circle id="arc" cx="130" cy="130" r="${R}" fill="none" stroke="var(--accent)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${running ? C * (1 - left / total) : 0}"/></svg>
      <div class="clock" id="clock">${clockStr(left)}</div>
    </div>
    ${running ? `<p class="meta" style="margin:-8px 0 18px">${esc(cur ? cur.title : t.label || 'Open focus')}</p>
      <button class="btn big" data-a="stop">${t.fromBlock ? 'End block' : 'Stop'}</button>` : `
      <div class="row" style="justify-content:center;margin-bottom:18px">
        <select id="taskSel" aria-label="Task">
          <option value="">No specific task</option>
          ${open.map(x => `<option value="${x.id}" ${x.id === focusSel ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}
        </select>
      </div>
      <div class="chips" style="justify-content:center;margin-bottom:20px">
        ${[15, 25, 45, 60].map(m => `<button class="chip ${st.focus === m ? 'on' : ''}" data-a="len" data-m="${m}">${m} min</button>`).join('')}
      </div>
      <button class="btn big" data-a="start">Start focusing</button>
      <p class="meta" style="margin-top:18px">Breaks: ${[5, 10].map(m => `<button class="link" style="${st.brk === m ? 'color:var(--ink);font-weight:600' : ''}" data-a="brk" data-m="${m}">${m} min</button>`).join('·')}</p>`}
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
let jMood = 0, jEdit = null, jQuery = '', jPrompt = Math.floor(Date.now() / 864e5) % PROMPTS.length;

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
    <textarea id="jNew" style="min-height:160px" placeholder="Start writing…"></textarea>
    <div class="row" style="margin-top:12px"><button class="btn" data-a="j-save">Save entry</button><span class="meta">${S.journal.length} ${S.journal.length === 1 ? 'entry' : 'entries'} so far</span></div>
  </section>
  ${S.journal.length ? `<input type="text" id="jSearch" class="grow" style="width:100%;margin-bottom:6px" placeholder="Search your entries" value="${esc(jQuery)}">` : ''}
  <div id="jList">${journalList()}</div>`;

const JOURNAL_ACTIONS = {
  'j-mood': b => {
    jMood = jMood === +b.dataset.n ? 0 : +b.dataset.n;
    document.querySelectorAll('#jMoods button').forEach(x => x.classList.toggle('on', +x.dataset.n === jMood));
  },
  'j-prompt': () => { jPrompt = (jPrompt + 1) % PROMPTS.length; $('#jPrompt').textContent = PROMPTS[jPrompt]; $('#jNew').focus(); },
  'j-save': () => {
    const text = $('#jNew').value.trim();
    if (!text) return toast('Write a few words first.');
    S.journal.push({ id: uid(), date: today(), ts: Date.now(), mood: jMood, prompt: PROMPTS[jPrompt], text });
    jMood = 0; jPrompt = (jPrompt + 1) % PROMPTS.length; save(); render(); toast('Entry saved.');
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
  </section>`;
};

/* ---------- render & live updates ---------- */
function render() {
  document.querySelectorAll('#nav [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === view));
  const m = $('#main'); m.innerHTML = V[view]();
  updateLive();
  if (view === 'calendar' && calSel) { const i = $('#dayInput'); if (i) i.focus(); }
}
function updateLive() {
  const t = T(), pill = $('#pill');
  if (t) {
    const left = (t.endAt - Date.now()) / 1000;
    pill.hidden = false; pill.dataset.a = 'nav'; pill.dataset.v = 'focus';
    pill.textContent = `${t.mode === 'focus' ? 'Focusing' : 'Break'} · ${clockStr(left)}`;
    document.title = `${clockStr(left)} · Birch`;
    const c = $('#clock'); if (c) c.textContent = clockStr(left);
    const arc = $('#arc'); if (arc) arc.setAttribute('stroke-dashoffset', 2 * Math.PI * 118 * (1 - left / t.total));
  } else { pill.hidden = true; document.title = 'Birch — Daily Focus'; }
}
setInterval(() => {
  checkBlocks();
  const t = T();
  if (t && Date.now() >= t.endAt) finish(); else updateLive();
}, 1000);

/* ---------- events ---------- */
const A = {
  ...JOURNAL_ACTIONS,
  nav: b => { view = b.dataset.v; render(); },
  toggle: b => { const t = taskById(b.dataset.id); t.done = !t.done; save(); render(); },
  'del-task': b => { S.tasks = S.tasks.filter(t => t.id !== b.dataset.id); save(); render(); },
  carry: () => { S.tasks.filter(t => t.date === dkey(addDays(new Date(), -1)) && !t.done).forEach(t => t.date = today()); save(); render(); },
  'focus-task': b => { focusSel = b.dataset.id; view = 'focus'; render(); },
  mood: b => { (S.reviews[today()] ||= {}).mood = +b.dataset.n; S.reviews[today()].saved = false; save(); render(); },
  'save-review': () => {
    const r = (S.reviews[today()] ||= {}); r.text = $('[data-review]').value; r.saved = true; save(); render(); toast('Reflection saved. See you tomorrow.');
  },
  len: b => { S.settings.focus = +b.dataset.m; save(); render(); },
  brk: b => { S.settings.brk = +b.dataset.m; save(); render(); },
  start: () => { startFocus({ taskId: $('#taskSel').value || null }); },
  stop: stopTimer,
  tip: () => { tip = (tip + 1 + Math.floor(Math.random() * (TIPS.length - 1))) % TIPS.length; render(); },
  'skip-break': () => { S.timer = null; save(); render(); },
  'del-block': b => { S.blocks = S.blocks.filter(x => x.id !== b.dataset.id); save(); render(); },
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
  notif: async () => { try { await Notification.requestPermission(); } catch {} render(); }
};
document.addEventListener('click', e => {
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
  } else {
    const start = new Date(`${fd.date}T${fd.time}`).getTime();
    if (isNaN(start)) return;
    const match = S.tasks.find(t => t.title === fd.title.trim() && !t.done);
    S.blocks.push({ id: uid(), title: fd.title.trim(), taskId: match ? match.id : null, start, mins: +fd.mins, state: start + fd.mins * 60000 <= Date.now() ? 'missed' : null });
    toast('Focus block added.');
  }
  save(); render();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && calSel) { calSel = null; render(); }
  if (e.key === 'Enter' && e.target.matches('.proj[data-a]')) A[e.target.dataset.a](e.target);
});
document.addEventListener('change', e => {
  if (e.target.matches('[data-intent]')) { S.intentions[today()] = e.target.value; save(); }
  if (e.target.id === 'taskSel') focusSel = e.target.value;
});

render();
if (T() && Date.now() >= T().endAt) finish();
