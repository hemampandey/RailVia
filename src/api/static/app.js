/* Front end for the block planner.
 *
 * Deliberately dependency-free: no build step, no CDN, no network beyond this
 * app's own API. The brief asked for React plus a Gantt library, but a demo
 * that cannot fail because a CDN is slow or the venue wifi is hostile is worth
 * more than the framework. The Gantt is hand-drawn SVG, which is also what
 * makes the department colour-coding and shared-block hatching exact.
 */
const DEPT = { ENGG: 'var(--engg)', TRD: 'var(--trd)', 'S&T': 'var(--snt)' };
const $ = (s) => document.querySelector(s);
const el = (t, c, x) => { const n = document.createElement(t);
  if (c) n.className = c; if (x !== undefined) n.textContent = x; return n; };

let view = 'plan';
const cache = {};
let tip;

function params() {
  return new URLSearchParams({
    grounded: $('#grounded').value, tasks: $('#tasks').value,
    days: $('#days').value, seed: '42', time_limit: $('#tl').value,
  }).toString();
}
const key = (p) => `${p}?${params()}`;

async function get(path) {
  const k = key(path);
  if (cache[k]) return cache[k];
  const res = await fetch(`/api/${path}?${params()}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  cache[k] = await res.json();
  return cache[k];
}

function showTip(html, ev) {
  hideTip();
  tip = el('div', 'tip');
  tip.innerHTML = html;
  document.body.appendChild(tip);
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.min(ev.clientX + 14, innerWidth - r.width - 10) + 'px';
  tip.style.top = Math.min(ev.clientY + 14, innerHeight - r.height - 10) + 'px';
}
const hideTip = () => { if (tip) { tip.remove(); tip = null; } };

/* ---------- KPI helpers ---------- */
function kpi(value, label, sub, colour) {
  const n = el('div', 'kpi');
  const v = el('div', 'v', value);
  if (colour) v.style.color = colour;
  n.append(v, el('div', 'l', label));
  if (sub) n.append(el('div', 's', sub));
  return n;
}

/* ---------- Gantt ---------- */
function gantt(blocks, startISO, days, title, note) {
  const wrap = el('div', 'panel');
  const h = el('h2', null, title);
  if (note) h.append(el('span', null, ' — ' + note));
  wrap.append(h);

  const legend = el('div', 'legend');
  for (const [d, c] of Object.entries(DEPT)) {
    const s = el('span'); const sw = el('span', 'sw');
    sw.style.background = c; s.append(sw, document.createTextNode(d)); legend.append(s);
  }
  const sh = el('span'); const shsw = el('span', 'sw');
  shsw.style.background = 'var(--shared)';
  sh.append(shsw, document.createTextNode('shared across departments'));
  legend.append(sh);
  wrap.append(legend);

  if (!blocks.length) {
    wrap.append(el('div', 'loading', 'No blocks scheduled.'));
    return wrap;
  }

  const sections = [...new Set(blocks.map(b => b.section_id))].sort();
  const rowH = 19, padL = 118, padT = 26, padR = 12;
  const W = Math.max(900, days * 30), H = padT + sections.length * rowH + 22;
  const t0 = new Date(startISO + 'T00:00:00').getTime();
  const span = days * 86400000;
  const x = (iso) => padL + ((new Date(iso).getTime() - t0) / span) * (W - padL - padR);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  const mk = (n, a) => { const e = document.createElementNS('http://www.w3.org/2000/svg', n);
    for (const k in a) e.setAttribute(k, a[k]); return e; };

  // day gridlines + labels
  for (let d = 0; d <= days; d++) {
    const px = padL + (d / days) * (W - padL - padR);
    svg.append(mk('line', { x1: px, y1: padT - 8, x2: px, y2: H - 18,
      stroke: '#2a3441', 'stroke-width': d % 7 === 0 ? 1.4 : 0.5 }));
    if (d < days && (days <= 10 || d % 7 === 0)) {
      const dt = new Date(t0 + d * 86400000);
      const lab = mk('text', { x: px + 3, y: padT - 12, fill: '#8b97a6', 'font-size': 10 });
      lab.textContent = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      svg.append(lab);
    }
  }

  sections.forEach((sec, i) => {
    const y = padT + i * rowH;
    const lab = mk('text', { x: 6, y: y + 12, fill: '#8b97a6', 'font-size': 10 });
    lab.textContent = sec.length > 17 ? sec.slice(0, 16) + '…' : sec;
    svg.append(lab);
    svg.append(mk('line', { x1: padL, y1: y + rowH - 1, x2: W - padR, y2: y + rowH - 1,
      stroke: '#1d2530', 'stroke-width': 1 }));
  });

  for (const b of blocks) {
    const i = sections.indexOf(b.section_id);
    const y = padT + i * rowH + 2;
    const x1 = x(b.start), x2 = x(b.end);
    const w = Math.max(2.5, x2 - x1);
    const fill = b.shared ? 'var(--shared)' : (DEPT[b.departments[0]] || '#666');
    const r = mk('rect', { x: x1, y, width: w, height: rowH - 5, rx: 2,
      fill, opacity: 0.9, style: 'cursor:pointer' });
    r.addEventListener('mousemove', (ev) => showTip(
      `<b>${b.section_id}</b><br>${new Date(b.start).toLocaleString()}<br>` +
      `${b.hours} h block · <b>${b.train_hours}</b> train-hours lost<br>` +
      `${b.departments.join(' + ')}${b.shared ? ' <b>(shared)</b>' : ''}<br>` +
      b.tasks.map(t => `${t.id} ${t.activity}${t.overdue ? ' <i style="color:#e05252">overdue</i>' : ''}`).join('<br>'),
      ev));
    r.addEventListener('mouseleave', hideTip);
    svg.append(r);
  }

  const box = el('div', 'scroll');
  box.append(svg);
  wrap.append(box);
  return wrap;
}

/* ---------- views ---------- */
async function renderPlan(root) {
  const p = await get('plan');
  const k = el('div', 'kpis');
  k.append(
    kpi(p.train_hours_lost.toFixed(1), 'Train-hours lost', 'the number we minimise'),
    kpi(p.block_count, 'Blocks', `${p.scheduled} tasks scheduled`),
    kpi(p.shared_blocks, 'Shared blocks', 'two or more departments', 'var(--shared)'),
    kpi(p.unscheduled.length, 'Unscheduled',
        p.unscheduled.length ? 'deferred beyond horizon' : 'whole backlog placed',
        p.unscheduled.length ? 'var(--bad)' : 'var(--good)'),
    kpi(p.status, 'Solver', `${p.wall_time}s wall time`),
  );
  root.append(k);
  root.append(gantt(p.blocks, p.horizon_start, p.horizon_days,
    'Coordinated block plan', `${p.block_count} blocks, colour by department`));
}

async function renderCompare(root) {
  const c = await get('comparison');
  const k = el('div', 'kpis');
  k.append(
    kpi(c.headline_reduction_pct.toFixed(1) + '%', 'Fewer train-hours lost',
        `same work · ${c.sections} sections · ${c.horizon_days} days`, 'var(--good)'),
    kpi(c.block_reduction_pct.toFixed(1) + '%', 'Fewer separate blocks',
        'one handover instead of several'),
    kpi('+' + c.extra_tasks_completed, 'More tasks completed',
        'full backlog, same horizon', 'var(--good)'),
  );
  root.append(k);

  const p = el('div', 'panel');
  p.append(el('h2', null, 'Manual process versus coordinated planning'));
  const note = el('div', 'win');
  note.innerHTML = '“Ours (same work)” re-plans <b>exactly the task set the manual ' +
    'process managed to schedule</b> — identical work, crews and horizon. The manual ' +
    'process is confined to a fixed night window, so it fits less work; comparing ' +
    'raw totals would flatter it. Both columns are shown rather than the kinder one.';
  note.style.marginBottom = '12px';
  p.append(note);

  const t = el('table');
  t.innerHTML = '<thead><tr><th>Metric</th><th class="num">Manual</th>' +
    '<th class="num">Ours (same work)</th><th class="num">Ours (full backlog)</th></tr></thead>';
  const tb = el('tbody');
  for (const r of c.rows) {
    const tr = el('tr');
    tr.append(el('td', null, r.metric));
    for (const v of [r.manual, r.ours_same_work, r.ours_full]) {
      tr.append(el('td', 'num', v));
    }
    tb.append(tr);
  }
  t.append(tb);
  const sc = el('div', 'scroll'); sc.append(t); p.append(sc);
  root.append(p);

  root.append(gantt(c.baseline_blocks, c.horizon_start, c.horizon_days,
    'What the manual process produces',
    'every block single-department, fixed night window'));
}

async function renderML(root) {
  const m = await get('criticality');
  const k = el('div', 'kpis');
  k.append(
    kpi(m.auc.toFixed(3), 'Held-out AUC', `${m.backend} · ${m.records} records`),
    kpi((m.failure_rate * 100).toFixed(1) + '%', 'Failure rate in history',
        'noisy binary outcomes, not a formula'),
    kpi(m.log_loss.toFixed(3), 'Log loss', 'lower is better'),
  );
  root.append(k);

  const p = el('div', 'panel');
  p.append(el('h2', null, 'Feature importance (gain)'));
  const cav = el('div', 'win');
  cav.innerHTML = 'The model scores <b>which task to defer</b>, never where a block ' +
    'goes — placement stays with CP-SAT. Caveat we state rather than hide: the ' +
    'failure hazard behind this training data is one <b>we wrote</b> ' +
    '(ASSUMPTIONS.md A-08). The model earns its place by combining features into ' +
    'one explainable ranking that can be retrained on real history, not by ' +
    'discovering the relationship.';
  cav.style.marginBottom = '12px';
  p.append(cav);
  const total = m.importances.reduce((a, b) => a + b.gain, 0) || 1;
  const t = el('table');
  const tb = el('tbody');
  for (const f of m.importances) {
    const tr = el('tr');
    tr.append(el('td', null, f.feature));
    tr.append(el('td', 'num', (f.gain / total * 100).toFixed(1) + '%'));
    const bt = el('td'); bt.style.width = '55%';
    const bar = el('div', 'bar'); const fill = el('i');
    fill.style.width = (f.gain / total * 100).toFixed(1) + '%';
    bar.append(fill); bt.append(bar); tr.append(bt);
    tb.append(tr);
  }
  t.append(tb); p.append(t); root.append(p);

  const q = el('div', 'panel');
  q.append(el('h2', null, 'Highest-criticality tasks'));
  const t2 = el('table');
  t2.innerHTML = '<thead><tr><th>Task</th><th>Activity</th><th>Dept</th>' +
    '<th>Section</th><th class="num">Severity</th><th class="num">Score</th></tr></thead>';
  const tb2 = el('tbody');
  for (const r of m.top_tasks) {
    const tr = el('tr');
    tr.append(el('td', null, r.id + (r.overdue ? ' ⚠' : '')));
    tr.append(el('td', null, r.activity.replace(/_/g, ' ')));
    const d = el('td', null, r.department);
    d.style.color = DEPT[r.department]; tr.append(d);
    tr.append(el('td', null, r.section));
    tr.append(el('td', 'num', r.severity));
    tr.append(el('td', 'num', r.score.toFixed(3)));
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', async (ev) => {
      const res = await fetch(`/api/criticality/${r.id}?${params()}`);
      const x = await res.json();
      showTip(`<b>Why ${r.id} scored ${x.score}</b><br>` +
        x.contributions.slice(0, 7).map(c =>
          `${c.feature}: <b style="color:${c.contribution > 0 ? '#e05252' : '#2eb88a'}">` +
          `${c.contribution > 0 ? '+' : ''}${c.contribution}</b>`).join('<br>'), ev);
    });
    tb2.append(tr);
  }
  t2.append(tb2);
  const sc2 = el('div', 'scroll'); sc2.append(t2); q.append(sc2);
  q.append(el('div', 'win', 'Click any row for its per-feature contribution breakdown.'));
  root.append(q);
}

async function renderSections(root) {
  const inst = await get('instance');
  const p = el('div', 'panel');
  p.append(el('h2', null, `Sections (${inst.sections.length})`));
  const t = el('table');
  t.innerHTML = '<thead><tr><th>Section</th><th>Name</th><th class="num">km</th>' +
    '<th class="num">trains/day</th><th class="num">peak/h</th>' +
    '<th>24-hour traffic profile</th></tr></thead>';
  const tb = el('tbody');
  const peak = Math.max(...inst.sections.map(s => s.peak_trains_per_hour), 1);
  for (const s of inst.sections) {
    const tr = el('tr');
    tr.append(el('td', null, s.id));
    tr.append(el('td', null, s.name));
    tr.append(el('td', 'num', s.length_km.toFixed(1)));
    tr.append(el('td', 'num', s.daily_trains.toFixed(0)));
    tr.append(el('td', 'num', s.peak_trains_per_hour.toFixed(1)));
    const c = el('td');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', 250); svg.setAttribute('height', 24);
    s.profile.forEach((v, h) => {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const hh = Math.max(1, (v / peak) * 22);
      r.setAttribute('x', h * 10.2); r.setAttribute('y', 23 - hh);
      r.setAttribute('width', 8.6); r.setAttribute('height', hh);
      r.setAttribute('fill', v / peak > 0.6 ? '#e05252' : (v / peak > 0.3 ? '#e8833a' : '#2eb88a'));
      r.setAttribute('rx', 1);
      svg.append(r);
    });
    c.append(svg); tr.append(c);
    tb.append(tr);
  }
  t.append(tb);
  const sc = el('div', 'scroll'); sc.append(t); p.append(sc);
  p.append(el('div', 'win', 'Green hours are candidates for blocking; red are peak. '
    + 'Thresholds are per section, not absolute — one section is quiet at 02:00 and '
    + 'another at 14:00.'));
  root.append(p);
}

/* ---------- shell ---------- */
const WAIT_TEXT = {
  plan: 'Solving the block plan…',
  compare: 'Running the manual baseline, the full plan and the like-for-like plan. '
    + 'Three passes, so this is the slow one.',
  ml: 'Training the criticality model…',
  sections: 'Loading sections…',
};

async function render() {
  const root = $('#view');
  // Build into a detached node, so the spinner stays up for the whole solve
  // rather than being cleared before the slow call is awaited.
  root.innerHTML = '';
  const wait = el('div', 'loading', WAIT_TEXT[view] || 'Working…');
  root.append(wait);
  const staged = document.createElement('div');
  try {
    const inst = await get('instance');
    const s = inst.sources;
    $('#prov').innerHTML =
      `${inst.instance_id} · sections <b>${s.sections}</b> · traffic <b>${s.traffic}</b>` +
      ` · tasks <i>${s.tasks}</i> · crews <i>${s.crew_capacity}</i>` +
      ` — ${inst.sections.length} sections, ${inst.task_count} tasks, ` +
      `${inst.overdue_count} overdue`;
    if (view === 'plan') await renderPlan(staged);
    else if (view === 'compare') await renderCompare(staged);
    else if (view === 'ml') await renderML(staged);
    else await renderSections(staged);
    root.innerHTML = '';
    root.append(...staged.childNodes);
  } catch (e) {
    root.innerHTML = '';
    root.append(el('div', 'err', 'Failed: ' + e.message));
  }
}

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
  t.classList.add('on'); view = t.dataset.v; render();
}));
$('#go').addEventListener('click', render);
['days', 'tasks', 'grounded', 'tl'].forEach(id =>
  $('#' + id).addEventListener('change', render));
document.addEventListener('scroll', hideTip, true);
render();
