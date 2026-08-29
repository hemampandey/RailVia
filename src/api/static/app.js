/* Block Planner — a worklist, not a dashboard.
 *
 * The user is a divisional planning officer. Their job on a Monday is: read
 * the proposed closures for the coming period, find the ones that need a
 * decision, and accept the rest. So the screen is a list of proposed blocks
 * in time order, with the exceptions pulled to the top, and nothing else.
 *
 * Things deliberately NOT on this screen: solver budget, backlog size, model
 * AUC, feature-importance bars. Those are ours, not theirs. The few that are
 * useful for a demo live behind a disclosure at the bottom.
 */
const DEPT = { ENGG: 'var(--engg)', TRD: 'var(--trd)', 'S&T': 'var(--snt)' };
const $ = (s) => document.querySelector(s);
const el = (t, c, x) => { const n = document.createElement(t);
  if (c) n.className = c; if (x !== undefined) n.textContent = x; return n; };
const svg = (d, size = 15) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d); s.append(p); return s;
};
const ICON = {
  warn: 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  check: 'M20 6 9 17l-5-5',
};

const state = {
  days: Number(localStorage.getItem('bp-days') || 7),
  tasks: 120, grounded: true, tl: 30,
  accepted: new Set(JSON.parse(localStorage.getItem('bp-accepted') || '[]')),
};

/* ── theme ─────────────────────────────────────────────────────────── */
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

async function get(path) {
  const k = `${path}?${qs()}`;
  if (cache[k]) return cache[k];
  const r = await fetch(`/api/${path}?${qs()}`);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  cache[k] = await r.json();
  return cache[k];
}

const saveAccepted = () => {
  try { localStorage.setItem('bp-accepted', JSON.stringify([...state.accepted])); }
  catch { /* ignore */ }
};
const blockKey = (b) => `${b.section_id}@${b.start}`;

/* ── pieces ────────────────────────────────────────────────────────── */
function fact(value, label, tone) {
  const n = el('div', 'fact' + (tone ? ' ' + tone : ''));
  n.append(el('b', null, value), el('span', null, label));
  return n;
}

function jobChip(job) {
  const c = el('span', 'job' + (job.overdue ? ' od' : ''));
  const dot = el('i'); dot.style.background = DEPT[job.department] || 'var(--text-faint)';
  c.append(dot, document.createTextNode(
    `${job.department} · ${job.activity.replace(/_/g, ' ')}`));
  if (job.overdue) c.append(document.createTextNode(' · overdue'));
  return c;
}

function blockRow(b, sections) {
  const key = blockKey(b);
  const accepted = state.accepted.has(key);
  const overdue = b.overdue_count > 0;
  const row = el('div', 'block' + (b.shared ? ' shared' : '') +
    (overdue ? ' has-overdue' : '') + (accepted ? ' done' : ''));

  const start = new Date(b.start), end = new Date(b.end);
  const when = el('div', 'when');
  const sameDay = start.toDateString() === end.toDateString();
  when.append(document.createTextNode(
    `${start.toTimeString().slice(0, 5)}–${end.toTimeString().slice(0, 5)}`));
  when.append(el('small', null,
    `${b.hours} h${sameDay ? '' : ' · ends next day'}`));

  const what = el('div', 'what');
  const where = el('div', 'where');
  where.append(document.createTextNode(sections[b.section_id] || b.section_id));
  const code = document.createElement('code'); code.textContent = b.section_id;
  where.append(code);
  what.append(where);
  const jobs = el('div', 'jobs');
  b.tasks.forEach(j => jobs.append(jobChip(j)));
  what.append(jobs);

  const cost = el('div', 'cost');
  cost.append(el('b', null, b.train_hours.toFixed(1)), el('span', null, 'train-hours'));
  if (b.saving > 0.05) {
    cost.append(el('span', 'save',
      `saves ${b.saving.toFixed(1)} by sharing`));
  }
  const acts = el('div', 'acts');
  const accept = el('button', accepted ? 'on' : '');
  const setLabel = () => {
    accept.textContent = '';
    if (state.accepted.has(key)) accept.append(svg(ICON.check, 13),
      document.createTextNode(' Accepted'));
    else accept.append(document.createTextNode('Accept'));
    accept.style.display = 'inline-flex';
    accept.style.alignItems = 'center';
    accept.style.gap = '5px';
  };
  setLabel();
  accept.setAttribute('aria-pressed', String(accepted));
  accept.addEventListener('click', () => {
    if (state.accepted.has(key)) state.accepted.delete(key);
    else state.accepted.add(key);
    saveAccepted(); setLabel();
    accept.className = state.accepted.has(key) ? 'on' : '';
    accept.setAttribute('aria-pressed', String(state.accepted.has(key)));
    row.classList.toggle('done', state.accepted.has(key));
    updateProgress();
  });
  acts.append(accept);
  cost.append(acts);

  row.append(when, what, cost);
  return row;
}

let progressNode;
function updateProgress() {
  if (!progressNode) return;
  const total = Number(progressNode.dataset.total || 0);
  progressNode.querySelector('b').textContent = `${state.accepted.size}/${total}`;
}

/* ── the plan ──────────────────────────────────────────────────────── */
async function render() {
  const root = $('#view');
  root.innerHTML = '';
  const wait = el('div', 'status');
  wait.append(el('div', 'spin'), document.createTextNode(
    'Planning the blocks… the solver gets a fixed budget, so this takes a moment.'));
  root.append(wait);
  for (let i = 0; i < 4; i++) root.append(el('div', 'sk'));
  $('#live').textContent = 'Planning';

  const staged = document.createElement('div');
  try {
    const [plan, inst] = [await get('plan'), await get('instance')];
    const sections = plan.sections || {};

    // ── decision bar ──
    const brief = el('div', 'brief');
    const top = el('div', 'brief-top');
    const first = new Date(plan.horizon_start + 'T00:00:00');
    const last = new Date(first.getTime() + (plan.horizon_days - 1) * 86400000);
    top.append(el('h2', null,
      `${first.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })} – ` +
      `${last.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`));
    const seg = el('div', 'seg');
    for (const [days, label] of [[7, 'Week'], [30, 'Month']]) {
      const b = el('button', null, label);
      b.setAttribute('aria-pressed', String(state.days === days));
      b.addEventListener('click', () => {
        if (state.days === days) return;
        state.days = days; localStorage.setItem('bp-days', String(days)); render();
      });
      seg.append(b);
    }
    top.append(seg);
    brief.append(top);

    const facts = el('div', 'facts');
    facts.append(
      fact(String(plan.block_count), 'closures proposed'),
      fact(`${plan.scheduled}/${plan.task_total}`, 'jobs scheduled'),
      fact(plan.total_saving.toFixed(0) + ' h', 'train-hours saved by sharing', 'win'),
    );
    if (plan.exceptions.length) {
      facts.append(fact(String(plan.exceptions.length), 'jobs need a decision', 'warn'));
    }
    progressNode = el('div', 'fact');
    progressNode.dataset.total = String(plan.block_count);
    progressNode.append(el('b', null, `${state.accepted.size}/${plan.block_count}`),
      el('span', null, 'accepted by you'));
    facts.append(progressNode);
    brief.append(facts);
    staged.append(brief);

    // ── exceptions first: this is what needs a human ──
    if (plan.exceptions.length) {
      const d = el('details', 'exc');
      d.open = plan.exceptions.length <= 8;
      const sum = el('summary');
      sum.append(svg(ICON.warn, 16), document.createTextNode(
        `${plan.exceptions.length} jobs could not be scheduled — review these first`));
      d.append(sum);
      const body = el('div', 'exc-body');
      for (const e of plan.exceptions.slice(0, 40)) {
        const r = el('div', 'exc-row');
        const dot = el('span', 'job');
        const i = el('i'); i.style.background = DEPT[e.department];
        dot.append(i, document.createTextNode(e.department));
        r.append(dot);
        const mid = el('div');
        const t = el('div');
        t.innerHTML = `<b>${e.activity.replace(/_/g, ' ')}</b> on ` +
          `${sections[e.section] || e.section}`;
        mid.append(t);
        mid.append(el('div', 'why', e.reason));
        mid.append(el('div', 'fix', 'Fix: ' + e.fix));
        r.append(mid);
        const right = el('div', 'cost');
        right.append(el('b', null, e.overdue ? 'OVERDUE' : `due ${e.due.slice(5)}`));
        right.append(el('span', null, `severity ${e.severity}`));
        if (e.overdue) right.querySelector('b').style.color = 'var(--bad)';
        right.querySelector('b').style.fontSize = '12px';
        r.append(right);
        body.append(r);
      }
      if (plan.exceptions.length > 40) {
        body.append(el('div', 'exc-row',
          `…and ${plan.exceptions.length - 40} more`));
      }
      d.append(body);
      staged.append(d);
    }

    // ── the worklist, in time order, grouped by day ──
    let currentDay = null;
    for (const b of plan.blocks) {
      const day = new Date(b.start).toDateString();
      if (day !== currentDay) {
        currentDay = day;
        staged.append(el('div', 'day', new Date(b.start)
          .toLocaleDateString(undefined,
            { weekday: 'long', day: 'numeric', month: 'long' })));
      }
      staged.append(blockRow(b, sections));
    }
    if (!plan.blocks.length) {
      staged.append(el('div', 'panel', 'No closures proposed for this period.'));
    }

    // ── evidence, kept out of the way ──
    const ev = el('details', 'settings');
    ev.append(el('summary', null, 'Evidence and settings'));
    const wrap = el('div');
    wrap.append(el('div', 'note',
      'Traffic and section geometry come from the published Indian Railways ' +
      'timetable. Maintenance jobs and crew strength are simulated — those live ' +
      'in departmental systems we cannot reach. Accepting a block marks it in ' +
      'this browser only; nothing is sent anywhere.'));
    const chips = el('div', 'chips');
    for (const [k, v] of Object.entries(inst.sources)) {
      chips.append(el('span', 'chip ' + (v === 'synthetic' ? 'syn' : 'real'),
        `${k}: ${v === 'synthetic' ? 'simulated' : 'real'}`));
    }
    chips.append(el('span', 'chip', `solver ${plan.status.toLowerCase()} in ${plan.wall_time}s`));
    wrap.append(chips);

    const row = el('div', 'row');
    for (const [key, label, opts] of [
      ['tasks', 'Backlog size', [[60, '60 jobs'], [120, '120 jobs'], [300, '300 jobs']]],
      ['tl', 'Solver budget', [[15, '15 s'], [30, '30 s'], [60, '60 s']]],
      ['grounded', 'Data', [[true, 'Real timetable'], [false, 'Fully simulated']]],
    ]) {
      const f = el('div');
      const id = 'set-' + key;
      const lab = el('label', null, label); lab.setAttribute('for', id);
      const sel = document.createElement('select'); sel.id = id;
      for (const [v, t] of opts) {
        const o = document.createElement('option');
        o.value = String(v); o.textContent = t;
        if (String(state[key]) === String(v)) o.selected = true;
        sel.append(o);
      }
      sel.addEventListener('change', () => {
        state[key] = key === 'grounded' ? sel.value === 'true' : Number(sel.value);
        render();
      });
      f.append(lab, sel); row.append(f);
    }
    const cmp = el('button', null, 'Compare with today’s process');
    cmp.addEventListener('click', () => showComparison(cmp));
    const cf = el('div'); cf.append(el('label', null, ' '), cmp); row.append(cf);
    wrap.append(row);
    ev.append(wrap);
    staged.append(ev);

    root.innerHTML = '';
    root.append(...staged.childNodes);
    $('#live').textContent =
      `${plan.block_count} closures proposed, ${plan.exceptions.length} need a decision.`;
  } catch (e) {
    root.innerHTML = '';
    const box = el('div', 'err');
    box.append(el('div', null, 'Could not build the plan: ' + e.message));
    const retry = el('button', null, 'Try again');
    retry.style.marginTop = '12px';
    retry.addEventListener('click', render);
    box.append(retry);
    root.append(box);
  }
}

async function showComparison(button) {
  button.disabled = true;
  button.textContent = 'Comparing…';
  try {
    const c = await get('comparison');
    const p = el('div', 'panel');
    p.append(el('h3', null, 'Today’s process versus this plan'));
    p.append(el('div', 'note',
      'Both columns schedule the same jobs. Today each department requests its ' +
      'own closure in a fixed night window; this plan merges them and places ' +
      'each closure in that section’s own quietest hours.'));
    const t = el('table');
    t.innerHTML = '<thead><tr><th>Measure</th><th class="num">Today</th>' +
      '<th class="num">This plan</th></tr></thead>';
    const tb = el('tbody');
    for (const r of c.rows) {
      const tr = el('tr');
      tr.append(el('td', null, r.metric), el('td', 'num', r.manual),
        el('td', 'num', r.ours_same_work));
      tb.append(tr);
    }
    t.append(tb);
    const sc = el('div', 'scroll'); sc.append(t); p.append(sc);
    p.append(el('div', 'note',
      `${c.headline_reduction_pct.toFixed(1)}% fewer train-hours lost for the same ` +
      'work. This figure moves between runs — the solver stops on a time limit — ' +
      'so quote it as a range with the budget attached.'));
    button.closest('.settings').append(p);
    button.remove();
  } catch (e) {
    button.disabled = false;
    button.textContent = 'Compare failed — retry';
  }
}

render();
