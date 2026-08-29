/* Block Planner.
 *
 * Four views onto one job: a calendar of what is scheduled, the worklist to
 * work through, what has been approved, and what has been done.
 *
 * Approvals and completions are stored in Supabase and nowhere else. There is
 * deliberately no local fallback: an approval one planner can see and another
 * cannot is worse than being told the store is unreachable.
 */
const DEPT = { ENGG: 'var(--engg)', TRD: 'var(--trd)', 'S&T': 'var(--snt)' };
const $ = (s) => document.querySelector(s);
const el = (t, c, x) => { const n = document.createElement(t);
  if (c) n.className = c; if (x !== undefined) n.textContent = x; return n; };
const svgIcon = (d, size = 15) => {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d);
  s.append(p); return s;
};
const ICON = {
  warn: 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  check: 'M20 6 9 17l-5-5',
};

const state = {
  view: 'calendar',
  days: Number(localStorage.getItem('bp-days') || 7),
  tasks: 120, grounded: true, tl: 30,
  selectedDay: null,
  approvals: new Map(),   // "SECTION@ISO" -> approval record
  completions: new Map(), // task id -> completion record
  store: null,
};

try { const t = localStorage.getItem('bp-theme');
  if (t) document.documentElement.dataset.theme = t; } catch { /* private mode */ }
$('#theme').addEventListener('click', () => {
  const r = document.documentElement;
  const dark = r.dataset.theme ? r.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  r.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('bp-theme', r.dataset.theme); } catch { /* ignore */ }
});

/* ── data ──────────────────────────────────────────────────────────── */
const cache = {};
const qs = () => new URLSearchParams({
  grounded: String(state.grounded), tasks: String(state.tasks),
  days: String(state.days), seed: '42', time_limit: String(state.tl),
}).toString();

async function get(path, fresh = false) {
  const k = `${path}?${qs()}`;
  if (cache[k] && !fresh) return cache[k];
  const r = await fetch(`/api/${path}?${qs()}`);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  cache[k] = await r.json();
  return cache[k];
}

async function loadStoreState() {
  try { state.store = await (await fetch('/api/store')).json(); }
  catch { state.store = { connected: false, detail: 'API unreachable' }; }
  const n = $('#store');
  n.className = 'store ' + (state.store.connected ? 'on' : 'off');
  n.textContent = state.store.connected ? 'Supabase connected' : 'Supabase not connected';
  n.title = state.store.detail || '';
}

async function loadDecisions(instanceId) {
  state.approvals.clear(); state.completions.clear();
  if (!state.store?.connected) return;
  try {
    const r = await fetch(`/api/decisions?instance_id=${encodeURIComponent(instanceId)}`);
    if (!r.ok) return;
    const d = await r.json();
    for (const a of d.approvals) state.approvals.set(`${a.section_id}@${a.start_iso}`, a);
    for (const c of d.completions) state.completions.set(c.task_id, c);
  } catch { /* leave empty; the banner already explains why */ }
}

const blockKey = (b) => `${b.section_id}@${b.start}`;

async function setApproved(plan, b, on) {
  const body = { instance_id: plan.instance_id, section_id: b.section_id,
    start_iso: b.start };
  if (on) {
    const r = await fetch('/api/approvals',
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body) });
    if (!r.ok) throw new Error((await r.json()).detail || 'could not approve');
    state.approvals.set(blockKey(b), await r.json());
  } else {
    const p = new URLSearchParams(
      { instance_id: plan.instance_id, section_id: b.section_id, start_iso: b.start });
    const r = await fetch(`/api/approvals?${p}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('could not remove approval');
    state.approvals.delete(blockKey(b));
  }
}

async function setDone(plan, b, on) {
  for (const t of b.tasks) {
    if (on) {
      const r = await fetch('/api/completions',
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instance_id: plan.instance_id, task_id: t.id }) });
      if (!r.ok) throw new Error((await r.json()).detail || 'could not record');
      state.completions.set(t.id, await r.json());
    } else {
      const p = new URLSearchParams({ instance_id: plan.instance_id, task_id: t.id });
      await fetch(`/api/completions?${p}`, { method: 'DELETE' });
      state.completions.delete(t.id);
    }
  }
}

/* ── shared pieces ─────────────────────────────────────────────────── */
function fact(v, label, tone) {
  const n = el('div', 'fact' + (tone ? ' ' + tone : ''));
  n.append(el('b', null, v), el('span', null, label)); return n;
}

function jobChip(job) {
  const done = state.completions.has(job.id);
  const c = el('span', 'job' + (job.overdue && !done ? ' od' : ''));
  const dot = el('i'); dot.style.background = DEPT[job.department] || 'var(--text-faint)';
  c.append(dot, document.createTextNode(
    `${job.department} · ${job.activity.replace(/_/g, ' ')}`));
  if (done) c.append(document.createTextNode(' · done'));
  else if (job.overdue) c.append(document.createTextNode(' · overdue'));
  return c;
}

function setupBanner() {
  const s = el('div', 'setup');
  s.append(el('h3', null, 'Supabase is not connected'));
  s.append(el('div', 'note',
    'Approvals and completions are stored in Supabase only — there is no local ' +
    'fallback, so that two planners can never approve different things without ' +
    'finding out. To switch it on:'));
  const pre = el('pre', null,
    '1. Create a project at supabase.com\n' +
    '2. Run src/store/schema.sql in the SQL editor\n' +
    '3. Add to .env in the repo root:\n' +
    '     SUPABASE_URL=https://<project>.supabase.co\n' +
    '     SUPABASE_KEY=<anon key>\n' +
    '4. Restart the server');
  s.append(pre);
  if (state.store?.detail) s.append(el('div', 'note', state.store.detail));
  return s;
}

function blockRow(plan, b, sections, opts = {}) {
  const key = blockKey(b);
  const approved = state.approvals.has(key);
  const done = b.tasks.every(t => state.completions.has(t.id));
  const overdue = b.overdue_count > 0;
  const row = el('div', 'block' + (b.shared ? ' shared' : '') +
    (overdue && !done ? ' has-overdue' : '') + (done ? ' done' : ''));

  const start = new Date(b.start), end = new Date(b.end);
  const when = el('div', 'when');
  when.append(document.createTextNode(
    `${start.toTimeString().slice(0, 5)}–${end.toTimeString().slice(0, 5)}`));
  const sameDay = start.toDateString() === end.toDateString();
  when.append(el('small', null,
    (opts.showDate
      ? start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' · '
      : '') + `${b.hours} h${sameDay ? '' : ' · +1d'}`));

  const what = el('div', 'what');
  const where = el('div', 'where');
  where.append(document.createTextNode(sections[b.section_id] || b.section_id));
  const code = document.createElement('code'); code.textContent = b.section_id;
  where.append(code);
  what.append(where);
  const jobs = el('div', 'jobs');
  b.tasks.forEach(j => jobs.append(jobChip(j)));
  what.append(jobs);

  const right = el('div', 'cost');
  right.append(el('b', null, b.train_hours.toFixed(1)), el('span', null, 'train-hours'));
  if (b.saving > 0.05) right.append(el('span', 'save', `saves ${b.saving.toFixed(1)} by sharing`));

  const acts = el('div', 'acts');
  const connected = !!state.store?.connected;

  const mk = (label, isOn, handler) => {
    const btn = el('button', isOn ? 'on' : '');
    const paint = () => {
      btn.textContent = '';
      if (btn.dataset.on === 'true') {
        btn.append(svgIcon(ICON.check, 13), document.createTextNode(' ' + label.done));
      } else btn.append(document.createTextNode(label.idle));
      btn.className = btn.dataset.on === 'true' ? 'on' : '';
      btn.style.display = 'inline-flex'; btn.style.alignItems = 'center';
      btn.style.gap = '5px';
    };
    btn.dataset.on = String(isOn);
    paint();
    btn.disabled = !connected;
    if (!connected) btn.title = 'Connect Supabase to record decisions';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await handler(btn.dataset.on !== 'true');
        btn.dataset.on = btn.dataset.on === 'true' ? 'false' : 'true';
        paint();
        refreshCounters();
        if (opts.onChange) opts.onChange();
      } catch (e) {
        alert(e.message);
      } finally { btn.disabled = !connected; }
    });
    return btn;
  };

  acts.append(mk({ idle: 'Approve', done: 'Approved' }, approved,
    (on) => setApproved(plan, b, on)));
  acts.append(mk({ idle: 'Mark done', done: 'Done' }, done,
    (on) => setDone(plan, b, on)));
  right.append(acts);

  row.append(when, what, right);
  return row;
}

let counterNodes = {};
function refreshCounters() {
  if (counterNodes.approved) {
    counterNodes.approved.querySelector('b').textContent =
      `${state.approvals.size}/${counterNodes.total}`;
  }
  if (counterNodes.done) {
    counterNodes.done.querySelector('b').textContent = String(state.completions.size);
  }
}

/* ── calendar ──────────────────────────────────────────────────────── */
function renderCalendar(root, plan, sections) {
  const byDay = new Map();
  for (const b of plan.blocks) {
    const k = new Date(b.start).toDateString();
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(b);
  }

  const first = new Date(plan.horizon_start + 'T00:00:00');
  const last = new Date(first.getTime() + (plan.horizon_days - 1) * 86400000);
  const brief = el('div', 'brief');
  const top = el('div', 'brief-top');
  top.append(el('h2', null,
    `${first.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })} – ` +
    `${last.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`));
  const seg = el('div', 'seg');
  for (const [days, label] of [[7, 'Week'], [30, 'Month']]) {
    const b = el('button', null, label);
    b.setAttribute('aria-pressed', String(state.days === days));
    b.addEventListener('click', () => {
      if (state.days === days) return;
      state.days = days; localStorage.setItem('bp-days', String(days));
      state.selectedDay = null; render();
    });
    seg.append(b);
  }
  top.append(seg); brief.append(top);
  const facts = el('div', 'facts');
  facts.append(fact(String(plan.block_count), 'closures scheduled'));
  counterNodes.total = plan.block_count;
  counterNodes.approved = fact(`${state.approvals.size}/${plan.block_count}`, 'approved');
  counterNodes.done = fact(String(state.completions.size), 'jobs completed');
  facts.append(counterNodes.approved, counterNodes.done);
  facts.append(fact(plan.total_saving.toFixed(0) + ' h', 'saved by sharing', 'win'));
  if (plan.exceptions.length) {
    facts.append(fact(String(plan.exceptions.length), 'unscheduled', 'warn'));
  }
  brief.append(facts); root.append(brief);

  // Month grid, padded to whole weeks starting Monday.
  const grid = el('div', 'cal');
  for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
    grid.append(el('div', 'dow', d));
  }
  const lead = (first.getDay() + 6) % 7;   // 0 = Monday
  for (let i = 0; i < lead; i++) grid.append(el('div', 'cell empty'));

  for (let i = 0; i < plan.horizon_days; i++) {
    const day = new Date(first.getTime() + i * 86400000);
    const blocks = byDay.get(day.toDateString()) || [];
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell' + (blocks.length ? ' busy' : '');
    const selected = state.selectedDay === day.toDateString();
    cell.setAttribute('aria-pressed', String(selected));
    const hours = blocks.reduce((a, b) => a + b.train_hours, 0);
    const approved = blocks.filter(b => state.approvals.has(blockKey(b))).length;
    cell.append(el('div', 'd', String(day.getDate())));
    cell.append(el('div', 'n', blocks.length
      ? `${blocks.length} closure${blocks.length > 1 ? 's' : ''}` : '—'));
    if (blocks.length) {
      cell.append(el('div', 'th', `${hours.toFixed(1)} train-h`
        + (approved ? ` · ${approved} ok` : '')));
      const dots = el('div', 'dots');
      const depts = [...new Set(blocks.flatMap(b => b.departments))];
      for (const d of depts) {
        const i2 = el('i'); i2.style.background = DEPT[d]; dots.append(i2);
      }
      cell.append(dots);
    }
    cell.setAttribute('aria-label',
      `${day.toDateString()}: ${blocks.length} closures, ${hours.toFixed(1)} train-hours lost`);
    cell.addEventListener('click', () => {
      state.selectedDay = selected ? null : day.toDateString();
      render();
    });
    grid.append(cell);
  }
  const panel = el('div', 'panel');
  panel.append(el('h3', null, 'Schedule'));
  panel.append(grid);
  root.append(panel);

  const chosen = state.selectedDay;
  const list = chosen ? (byDay.get(chosen) || []) : [];
  if (chosen) {
    root.append(el('div', 'day', new Date(chosen)
      .toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })));
    if (!list.length) {
      root.append(el('div', 'empty-state', 'No closures scheduled on this day.'));
    }
    list.forEach(b => root.append(blockRow(plan, b, sections, { onChange: render })));
  } else {
    root.append(el('div', 'empty-state', 'Select a day to see its closures.'));
  }
}

/* ── plan (worklist) ───────────────────────────────────────────────── */
function renderPlan(root, plan, sections) {
  const brief = el('div', 'brief');
  const facts = el('div', 'facts');
  facts.append(
    fact(String(plan.block_count), 'closures proposed'),
    fact(`${plan.scheduled}/${plan.task_total}`, 'jobs scheduled'),
    fact(plan.total_saving.toFixed(0) + ' h', 'saved by sharing', 'win'),
  );
  counterNodes.total = plan.block_count;
  counterNodes.approved = fact(`${state.approvals.size}/${plan.block_count}`, 'approved');
  facts.append(counterNodes.approved);
  if (plan.exceptions.length) {
    facts.append(fact(String(plan.exceptions.length), 'need a decision', 'warn'));
  }
  brief.append(facts); root.append(brief);

  if (plan.exceptions.length) {
    const d = el('details', 'exc');
    d.open = plan.exceptions.length <= 8;
    const sum = el('summary');
    sum.append(svgIcon(ICON.warn, 16), document.createTextNode(
      `${plan.exceptions.length} jobs could not be scheduled — review these first`));
    d.append(sum);
    const body = el('div', 'exc-body');
    for (const e of plan.exceptions.slice(0, 40)) {
      const r = el('div', 'exc-row');
      const chip = el('span', 'job');
      const i = el('i'); i.style.background = DEPT[e.department];
      chip.append(i, document.createTextNode(e.department));
      r.append(chip);
      const mid = el('div');
      const head = el('div');
      head.append(el('b', null, e.activity.replace(/_/g, ' ')),
        document.createTextNode(' on ' + (sections[e.section] || e.section)));
      mid.append(head, el('div', 'why', e.reason), el('div', 'fix', 'Fix: ' + e.fix));
      r.append(mid);
      const right = el('div', 'cost');
      const b = el('b', null, e.overdue ? 'OVERDUE' : `due ${e.due.slice(5)}`);
      b.style.fontSize = '12px';
      if (e.overdue) b.style.color = 'var(--bad)';
      right.append(b, el('span', null, `severity ${e.severity}`));
      r.append(right); body.append(r);
    }
    d.append(body); root.append(d);
  }

  let currentDay = null;
  for (const b of plan.blocks) {
    const day = new Date(b.start).toDateString();
    if (day !== currentDay) {
      currentDay = day;
      root.append(el('div', 'day', new Date(b.start).toLocaleDateString(
        undefined, { weekday: 'long', day: 'numeric', month: 'long' })));
    }
    root.append(blockRow(plan, b, sections));
  }
}

/* ── approved / completed ──────────────────────────────────────────── */
function renderApproved(root, plan, sections) {
  if (!state.store?.connected) { root.append(setupBanner()); return; }
  const approved = plan.blocks.filter(b => state.approvals.has(blockKey(b)));
  const brief = el('div', 'brief');
  const facts = el('div', 'facts');
  facts.append(fact(String(approved.length), 'closures approved'));
  facts.append(fact(
    approved.reduce((a, b) => a + b.train_hours, 0).toFixed(1), 'train-hours committed'));
  facts.append(fact(String(approved.reduce((a, b) => a + b.tasks.length, 0)), 'jobs covered'));
  brief.append(facts); root.append(brief);

  if (!approved.length) {
    const e = el('div', 'empty-state');
    e.append(el('b', null, 'Nothing approved yet'));
    e.append(document.createTextNode(
      'Approve closures from the Plan or Calendar tab and they appear here, '
      + 'with who approved them and when.'));
    root.append(e); return;
  }
  for (const b of approved) {
    const a = state.approvals.get(blockKey(b));
    const row = blockRow(plan, b, sections, { showDate: true, onChange: render });
    const meta = el('div', 'why');
    meta.textContent = `approved by ${a.decided_by} · ${new Date(a.decided_at).toLocaleString()}`;
    meta.style.cssText = 'font-size:11.5px;color:var(--text-faint);margin-top:4px';
    row.querySelector('.what').append(meta);
    root.append(row);
  }
}

function renderCompleted(root, plan, sections) {
  if (!state.store?.connected) { root.append(setupBanner()); return; }
  const jobs = [];
  for (const b of plan.blocks) {
    for (const t of b.tasks) {
      if (state.completions.has(t.id)) jobs.push({ task: t, block: b });
    }
  }
  const brief = el('div', 'brief');
  const facts = el('div', 'facts');
  facts.append(fact(String(jobs.length), 'jobs completed', 'win'));
  facts.append(fact(`${plan.scheduled - jobs.length}`, 'scheduled, not yet done'));
  const overdueDone = jobs.filter(j => j.task.overdue).length;
  facts.append(fact(String(overdueDone), 'overdue jobs cleared', overdueDone ? 'win' : ''));
  brief.append(facts); root.append(brief);

  if (!jobs.length) {
    const e = el('div', 'empty-state');
    e.append(el('b', null, 'Nothing marked done yet'));
    e.append(document.createTextNode(
      'Use “Mark done” on a closure once the work has been carried out.'));
    root.append(e); return;
  }
  const panel = el('div', 'panel');
  panel.append(el('h3', null, 'Completed work'));
  const t = el('table');
  t.innerHTML = '<thead><tr><th>Job</th><th>Department</th><th>Section</th>' +
    '<th>Completed</th></tr></thead>';
  const tb = el('tbody');
  for (const { task, block } of jobs) {
    const c = state.completions.get(task.id);
    const tr = el('tr');
    tr.append(el('td', null, task.activity.replace(/_/g, ' ')));
    const d = el('td'); const dot = el('i');
    dot.style.cssText = `display:inline-block;width:7px;height:7px;border-radius:2px;
      margin-right:6px;background:${DEPT[task.department]}`;
    d.append(dot, document.createTextNode(task.department)); tr.append(d);
    tr.append(el('td', null, sections[block.section_id] || block.section_id));
    tr.append(el('td', 'mono', new Date(c.completed_at).toLocaleString()));
    tb.append(tr);
  }
  t.append(tb);
  const sc = el('div', 'scroll'); sc.append(t); panel.append(sc);
  root.append(panel);
}

/* ── shell ─────────────────────────────────────────────────────────── */
async function render() {
  const root = $('#view');
  root.innerHTML = '';
  const wait = el('div', 'status');
  wait.append(el('div', 'spin'), document.createTextNode('Planning the blocks…'));
  root.append(wait);
  for (let i = 0; i < 3; i++) root.append(el('div', 'sk'));

  const staged = document.createElement('div');
  try {
    await loadStoreState();
    const plan = await get('plan');
    await loadDecisions(plan.instance_id);
    const sections = plan.sections || {};

    if (state.view === 'calendar') renderCalendar(staged, plan, sections);
    else if (state.view === 'plan') renderPlan(staged, plan, sections);
    else if (state.view === 'approved') renderApproved(staged, plan, sections);
    else renderCompleted(staged, plan, sections);

    root.innerHTML = '';
    root.append(...staged.childNodes);
    $('#live').textContent = `${state.view} view ready.`;
  } catch (e) {
    root.innerHTML = '';
    const box = el('div', 'err');
    box.append(el('div', null, 'Could not load: ' + e.message));
    const retry = el('button', null, 'Try again');
    retry.style.marginTop = '12px';
    retry.addEventListener('click', render);
    box.append(retry); root.append(box);
  }
}

const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab) {
  tabs.forEach(t => {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
  $('#view').setAttribute('aria-labelledby', tab.id);
  state.view = tab.dataset.v;
  render();
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (ev) => {
    const map = { ArrowRight: 1, ArrowLeft: -1 };
    if (!(ev.key in map)) return;
    ev.preventDefault();
    const next = tabs[(i + map[ev.key] + tabs.length) % tabs.length];
    next.focus(); selectTab(next);
  });
});

render();
