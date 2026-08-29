/* Block planner front end — no dependencies, no build step.
 *
 * Design notes worth keeping:
 *  - Department is never encoded by colour alone. Shared blocks carry a
 *    diagonal hatch, and each bar wide enough to hold one gets a letter code
 *    (E/T/S). Real blocks are often only a few pixels wide, so the guarantee
 *    is completed by the tooltip and the table underneath, both of which name
 *    the department in words (WCAG 1.4.1).
 *  - Every chart has a table fallback. An SVG Gantt is invisible to a screen
 *    reader; the table underneath is the real accessible representation.
 *  - Numbers are tabular everywhere, so KPI values do not jitter on re-solve.
 */
const DEPT = { ENGG: 'var(--engg)', TRD: 'var(--trd)', 'S&T': 'var(--snt)' };
const SVGNS = 'http://www.w3.org/2000/svg';
const $ = (s) => document.querySelector(s);
const el = (t, c, x) => { const n = document.createElement(t);
  if (c) n.className = c; if (x !== undefined) n.textContent = x; return n; };
const mk = (n, a) => { const e = document.createElementNS(SVGNS, n);
  for (const k in a) e.setAttribute(k, a[k]); return e; };
const icon = (d, size = 14) => {
  const s = mk('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round',
    'aria-hidden': 'true' });
  s.append(mk('path', { d })); return s;
};
const I = {
  warn: 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  share: 'M8.6 13.5a3 3 0 1 0 0-3m6.8-3a3 3 0 1 0 0 3m0 6a3 3 0 1 0 0 3M8.6 13.5l6.8 3m0-9-6.8 3',
};

let view = 'plan';
const cache = {};
let tip;

/* ── theme ─────────────────────────────────────────────────────────── */
try {
  const saved = localStorage.getItem('bp-theme');
  if (saved) document.documentElement.dataset.theme = saved;
} catch { /* private mode: fall back to the OS preference */ }
$('#theme').addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme
    ? root.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('bp-theme', root.dataset.theme); } catch { /* ignore */ }
});

/* ── data ──────────────────────────────────────────────────────────── */
function params() {
  return new URLSearchParams({
    grounded: $('#grounded').value, tasks: $('#tasks').value,
    days: $('#days').value, seed: '42', time_limit: $('#tl').value,
  }).toString();
}
async function get(path) {
  const k = `${path}?${params()}`;
  if (cache[k]) return cache[k];
  const res = await fetch(`/api/${path}?${params()}`);
  if (!res.ok) throw new Error(`${path} returned HTTP ${res.status}`);
  cache[k] = await res.json();
  return cache[k];
}

/* ── tooltip ───────────────────────────────────────────────────────── */
function showTip(html, ev) {
  hideTip();
  tip = el('div', 'tip');
  tip.innerHTML = html;
  document.body.appendChild(tip);
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.max(8, Math.min(ev.clientX + 14, innerWidth - r.width - 10)) + 'px';
  tip.style.top = Math.max(8, Math.min(ev.clientY + 14, innerHeight - r.height - 10)) + 'px';
}
const hideTip = () => { if (tip) { tip.remove(); tip = null; } };

/* ── pieces ────────────────────────────────────────────────────────── */
function kpi(value, label, sub, tone) {
  const n = el('div', 'kpi' + (tone ? ' ' + tone : ''));
  n.append(el('div', 'kpi-v', value), el('div', 'kpi-l', label));
  if (sub) n.append(el('div', 'kpi-s', sub));
  return n;
}

function deptSwatch(dept) {
  const s = el('span', 'sw');
  s.style.background = DEPT[dept] || 'var(--text-faint)';
  return s;
}

function legend() {
  const l = el('div', 'legend');
  for (const d of Object.keys(DEPT)) {
    const s = el('span');
    s.append(deptSwatch(d), document.createTextNode(`${d} (${d[0] === 'S' && d !== 'S&T' ? 'S' : d[0]})`));
    l.append(s);
  }
  const sh = el('span');
  const box = el('span', 'sw');
  box.style.cssText = 'background:var(--shared);' +
    'background-image:repeating-linear-gradient(45deg,transparent,transparent 2px,' +
    'rgba(0,0,0,.45) 2px,rgba(0,0,0,.45) 4px)';
  sh.append(box, document.createTextNode('shared (hatched, marked +)'));
  l.append(sh);
  return l;
}

/* ── Gantt ─────────────────────────────────────────────────────────── */
function gantt(blocks, startISO, days, title, note) {
  const wrap = el('div', 'panel');
  const h = el('h2'); h.append(document.createTextNode(title));
  if (note) h.append(el('span', 'muted', note));
  wrap.append(h, legend());

  if (!blocks.length) {
    wrap.append(el('div', 'note', 'No blocks scheduled for this instance.'));
    return wrap;
  }

  const sections = [...new Set(blocks.map(b => b.section_id))].sort();
  const rowH = 20, padL = 132, padT = 28, padR = 14;
  const W = Math.max(920, days * 34), H = padT + sections.length * rowH + 16;
  const t0 = new Date(startISO + 'T00:00:00').getTime();
  const span = days * 86400000;
  const x = (iso) => padL + ((new Date(iso).getTime() - t0) / span) * (W - padL - padR);

  const shared = blocks.filter(b => b.shared).length;
  const svg = mk('svg', {
    viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img',
    'aria-label': `Block plan across ${sections.length} sections over ${days} days. ` +
      `${blocks.length} blocks, of which ${shared} are shared between departments. ` +
      `The table below lists every block.`,
  });

  // Hatch for shared blocks: the key distinction must not rely on colour.
  const defs = mk('defs');
  const pat = mk('pattern', { id: 'hatch', width: 5, height: 5,
    patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
  pat.append(mk('rect', { width: 5, height: 5, fill: 'var(--shared)' }));
  pat.append(mk('line', { x1: 0, y1: 0, x2: 0, y2: 5,
    stroke: 'rgba(0,0,0,.45)', 'stroke-width': 2.5 }));
  defs.append(pat); svg.append(defs);

  for (let d = 0; d <= days; d++) {
    const px = padL + (d / days) * (W - padL - padR);
    svg.append(mk('line', { x1: px, y1: padT - 9, x2: px, y2: H - 12,
      stroke: 'var(--border-soft)', 'stroke-width': d % 7 === 0 ? 1.3 : 0.5 }));
    if (d < days && (days <= 10 || d % 7 === 0)) {
      const lab = mk('text', { x: px + 4, y: padT - 13, fill: 'var(--text-faint)',
        'font-size': 10.5, 'font-family': 'var(--font-mono)' });
      lab.textContent = new Date(t0 + d * 86400000)
        .toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      svg.append(lab);
    }
  }

  sections.forEach((sec, i) => {
    const y = padT + i * rowH;
    const lab = mk('text', { x: 6, y: y + 13, fill: 'var(--text-muted)',
      'font-size': 10.5, 'font-family': 'var(--font-mono)' });
    lab.textContent = sec.length > 18 ? sec.slice(0, 17) + '…' : sec;
    svg.append(lab);
    if (i % 2) svg.append(mk('rect', { x: padL, y, width: W - padL - padR,
      height: rowH, fill: 'var(--surface-2)', opacity: .55 }));
  });

  for (const b of blocks) {
    const y = padT + sections.indexOf(b.section_id) * rowH + 3;
    const x1 = x(b.start), w = Math.max(3, x(b.end) - x1);
    const g = mk('g');
    g.append(mk('rect', {
      x: x1, y, width: w, height: rowH - 6, rx: 2.5,
      fill: b.shared ? 'url(#hatch)' : (DEPT[b.departments[0]] || 'var(--text-faint)'),
      style: 'cursor:pointer',
    }));
    // Letter code inside the bar wherever one fits. Bars are frequently
    // narrower than any label, so this supplements rather than replaces the
    // tooltip and table.
    if (w >= 13) {
      const code = b.shared ? '+' : { ENGG: 'E', TRD: 'T', 'S&T': 'S' }[b.departments[0]];
      if (code) {
        const t = mk('text', {
          x: x1 + w / 2, y: y + rowH / 2 - 1, 'font-size': 9,
          'font-family': 'var(--font-mono)', fill: '#fff', 'font-weight': 700,
          'text-anchor': 'middle', 'dominant-baseline': 'middle',
          'pointer-events': 'none',
        });
        t.textContent = code;
        g.append(t);
      }
    }
    g.addEventListener('mousemove', (ev) => showTip(
      `<b>${b.section_id}</b><br>${new Date(b.start).toLocaleString()}<br>` +
      `${b.hours} h block · <b>${b.train_hours}</b> train-hours lost<br>` +
      `${b.departments.join(' + ')}${b.shared ? ' <b>(shared)</b>' : ''}<br>` +
      b.tasks.map(t => `${t.id} ${t.activity}${t.overdue ? ' — overdue' : ''}`).join('<br>'),
      ev));
    g.addEventListener('mouseleave', hideTip);
    svg.append(g);
  }

  const box = el('div', 'scroll'); box.append(svg); wrap.append(box);

  // Accessible equivalent. A chart alone is not screen-reader content.
  const det = el('details');
  det.append(el('summary', null, `Block list as a table (${blocks.length} rows)`));
  det.querySelector('summary').style.cssText =
    'cursor:pointer;font-size:12.5px;color:var(--text-muted);padding:8px 0';
  const t = el('table');
  t.innerHTML = '<thead><tr><th>Section</th><th>Start</th><th class="num">Hours</th>' +
    '<th class="num">Train-hours</th><th>Departments</th><th>Tasks</th></tr></thead>';
  const tb = el('tbody');
  for (const b of blocks) {
    const tr = el('tr');
    tr.append(el('td', 'mono', b.section_id));
    tr.append(el('td', 'mono', new Date(b.start).toLocaleString()));
    tr.append(el('td', 'num', b.hours));
    tr.append(el('td', 'num', b.train_hours));
    const d = el('td');
    d.append(deptSwatch(b.departments[0]),
      document.createTextNode(' ' + b.departments.join(' + ') + (b.shared ? ' (shared)' : '')));
    d.style.whiteSpace = 'nowrap';
    tr.append(d);
    tr.append(el('td', 'mono', b.tasks.map(x => x.id).join(', ')));
    tb.append(tr);
  }
  t.append(tb);
  const sc = el('div', 'scroll'); sc.append(t); det.append(sc);
  wrap.append(det);
  return wrap;
}

/* ── views ─────────────────────────────────────────────────────────── */
async function renderPlan(root) {
  const p = await get('plan');
  const k = el('div', 'kpis');
  k.append(
    kpi(p.train_hours_lost.toFixed(1), 'Train-hours lost', 'the quantity we minimise', 'hero'),
    kpi(p.block_count, 'Blocks', `${p.scheduled} tasks scheduled`),
    kpi(p.shared_blocks, 'Shared blocks', 'two or more departments', p.shared_blocks ? 'good' : ''),
    kpi(p.unscheduled.length, 'Unscheduled',
        p.unscheduled.length ? 'deferred past the horizon' : 'entire backlog placed',
        p.unscheduled.length ? 'bad' : 'good'),
    kpi(p.status, 'Solver', `${p.wall_time}s wall time`),
  );
  root.append(k);
  root.append(gantt(p.blocks, p.horizon_start, p.horizon_days,
    'Coordinated block plan', `${p.block_count} blocks`));
}

async function renderCompare(root) {
  const c = await get('comparison');
  const k = el('div', 'kpis');
  k.append(
    kpi(c.headline_reduction_pct.toFixed(1) + '%', 'Fewer train-hours lost',
        `same work · ${c.sections} sections · ${c.horizon_days} days`, 'hero'),
    kpi(c.block_reduction_pct.toFixed(1) + '%', 'Fewer separate blocks',
        'one handover instead of several', 'good'),
    kpi('+' + c.extra_tasks_completed, 'More tasks completed',
        'full backlog, same horizon', 'good'),
  );
  root.append(k);

  const p = el('div', 'panel');
  p.append(el('h2', null, 'Manual process versus coordinated planning'));
  const n = el('div', 'note');
  n.innerHTML = '<b>“Ours (same work)”</b> re-plans exactly the task set the manual ' +
    'process managed to schedule — identical work, crews and horizon. The manual ' +
    'process is confined to a fixed night window, so it fits less work; comparing raw ' +
    'totals would flatter it. Both columns are shown rather than the kinder one. ' +
    'The percentage also moves with the solver budget and between runs, so quote it ' +
    'as a range with the budget attached.';
  p.append(n);
  const t = el('table');
  t.innerHTML = '<thead><tr><th>Metric</th><th class="num">Manual</th>' +
    '<th class="num">Ours (same work)</th><th class="num">Ours (full backlog)</th></tr></thead>';
  const tb = el('tbody');
  for (const r of c.rows) {
    const tr = el('tr');
    tr.append(el('td', null, r.metric));
    for (const v of [r.manual, r.ours_same_work, r.ours_full]) tr.append(el('td', 'num', v));
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
    kpi(m.auc.toFixed(3), 'Held-out AUC', `${m.backend} · ${m.records} records`, 'hero'),
    kpi((m.failure_rate * 100).toFixed(1) + '%', 'Failure rate in history',
        'noisy binary outcomes, not a formula'),
    kpi(m.log_loss.toFixed(3), 'Log loss', 'lower is better'),
  );
  root.append(k);

  const p = el('div', 'panel');
  p.append(el('h2', null, 'Feature importance (gain)'));
  const n = el('div', 'note');
  n.innerHTML = 'The model scores <b>which task to defer</b>, never where a block goes — ' +
    'placement stays with CP-SAT. Caveat we state rather than hide: the failure hazard ' +
    'behind this training data is one <b>we wrote</b> (ASSUMPTIONS.md A-08). The model ' +
    'earns its place by combining features into one explainable ranking that can be ' +
    'retrained on real history, not by discovering the relationship.';
  p.append(n);
  const total = m.importances.reduce((a, b) => a + b.gain, 0) || 1;
  const t = el('table');
  t.innerHTML = '<thead><tr><th>Feature</th><th class="num">Gain</th><th>Share</th></tr></thead>';
  const tb = el('tbody');
  for (const f of m.importances) {
    const pct = f.gain / total * 100;
    const tr = el('tr');
    tr.append(el('td', 'mono', f.feature));
    tr.append(el('td', 'num', pct.toFixed(1) + '%'));
    const bt = el('td'); bt.style.width = '52%';
    const bar = el('div', 'bar'); const fill = el('i');
    fill.style.width = pct.toFixed(1) + '%'; bar.append(fill); bt.append(bar);
    tr.append(bt); tb.append(tr);
  }
  t.append(tb); p.append(t); root.append(p);

  const q = el('div', 'panel');
  q.append(el('h2', null, 'Highest-criticality tasks'));
  q.append(el('div', 'note', 'Select a row for its per-feature contribution breakdown. '
    + 'Rows are keyboard reachable.'));
  const t2 = el('table');
  t2.innerHTML = '<thead><tr><th>Task</th><th>Activity</th><th>Dept</th><th>Section</th>' +
    '<th class="num">Severity</th><th class="num">Score</th></tr></thead>';
  const tb2 = el('tbody');
  for (const r of m.top_tasks) {
    const tr = el('tr', 'click');
    tr.tabIndex = 0;
    const idc = el('td', 'mono');
    idc.append(document.createTextNode(r.id));
    if (r.overdue) {
      const w = icon(I.warn, 13);
      w.style.cssText = 'color:var(--bad);margin-left:5px;vertical-align:-2px';
      idc.append(w);
      idc.append(el('span', 'vh', ' overdue'));
    }
    tr.append(idc);
    tr.append(el('td', null, r.activity.replace(/_/g, ' ')));
    const d = el('td');
    d.append(deptSwatch(r.department), document.createTextNode(' ' + r.department));
    d.style.whiteSpace = 'nowrap';
    tr.append(d);
    tr.append(el('td', 'mono', r.section));
    tr.append(el('td', 'num', r.severity));
    tr.append(el('td', 'num', r.score.toFixed(3)));
    const explain = async (ev) => {
      const res = await fetch(`/api/criticality/${r.id}?${params()}`);
      const x = await res.json();
      const rect = tr.getBoundingClientRect();
      showTip(`<b>Why ${r.id} scored ${x.score}</b><br>` +
        x.contributions.slice(0, 7).map(c =>
          `${c.feature}: <b style="color:${c.contribution > 0 ? 'var(--bad)' : 'var(--good)'}">` +
          `${c.contribution > 0 ? '+' : ''}${c.contribution}</b>`).join('<br>'),
        ev.clientX ? ev : { clientX: rect.left + 40, clientY: rect.bottom });
    };
    tr.addEventListener('click', explain);
    tr.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); explain(ev); }
      if (ev.key === 'Escape') hideTip();
    });
    tb2.append(tr);
  }
  t2.append(tb2);
  const sc2 = el('div', 'scroll'); sc2.append(t2); q.append(sc2);
  root.append(q);
}

async function renderSections(root) {
  const inst = await get('instance');
  const p = el('div', 'panel');
  p.append(el('h2', null, `Sections (${inst.sections.length})`));
  p.append(el('div', 'note', 'Bars show trains per hour, midnight to 23:00. '
    + 'Green hours are candidates for blocking, red are peak. Thresholds are '
    + 'per section, not absolute — one section is quiet at 02:00 and another at 14:00.'));
  const t = el('table');
  t.innerHTML = '<thead><tr><th>Section</th><th>Name</th><th class="num">km</th>' +
    '<th class="num">Trains/day</th><th class="num">Peak/h</th>' +
    '<th>Traffic by hour</th></tr></thead>';
  const tb = el('tbody');
  const peak = Math.max(...inst.sections.map(s => s.peak_trains_per_hour), 1);
  for (const s of inst.sections) {
    const tr = el('tr');
    tr.append(el('td', 'mono', s.id));
    tr.append(el('td', null, s.name));
    tr.append(el('td', 'num', s.length_km.toFixed(1)));
    tr.append(el('td', 'num', s.daily_trains.toFixed(0)));
    tr.append(el('td', 'num', s.peak_trains_per_hour.toFixed(1)));
    const c = el('td');
    const quiet = s.profile.reduce((a, v, i) => v < peak * .3 ? a.concat(i) : a, []);
    const svg = mk('svg', { width: 252, height: 26, role: 'img',
      'aria-label': `Peak ${s.peak_trains_per_hour.toFixed(1)} trains per hour. `
        + `Quietest hours: ${quiet.slice(0, 6).join(', ') || 'none'}.` });
    s.profile.forEach((v, h) => {
      const hh = Math.max(1.5, (v / peak) * 23);
      svg.append(mk('rect', { x: h * 10.4, y: 24 - hh, width: 8.8, height: hh, rx: 1.5,
        fill: v / peak > .6 ? 'var(--bad)' : (v / peak > .3 ? 'var(--accent)' : 'var(--good)') }));
    });
    c.append(svg); tr.append(c); tb.append(tr);
  }
  t.append(tb);
  const sc = el('div', 'scroll'); sc.append(t); p.append(sc);
  root.append(p);
}

/* ── shell ─────────────────────────────────────────────────────────── */
const WAIT = {
  plan: 'Solving the block plan…',
  compare: 'Running the manual baseline, the full plan and the like-for-like plan — three passes.',
  ml: 'Training the criticality model…',
  sections: 'Loading sections…',
};

function skeleton(root, text) {
  const s = el('div', 'status');
  s.append(el('div', 'spin'), document.createTextNode(text));
  root.append(s);
  const k = el('div', 'kpis');
  for (let i = 0; i < 4; i++) k.append(el('div', 'sk sk-kpi'));
  root.append(k, el('div', 'sk sk-panel'));
}

async function render() {
  const root = $('#view');
  hideTip();
  root.innerHTML = '';
  skeleton(root, WAIT[view] || 'Working…');
  $('#go').disabled = true;
  $('#live').textContent = WAIT[view] || 'Loading';

  // Build into a detached node so the skeleton stays up for the whole solve.
  const staged = document.createElement('div');
  try {
    const inst = await get('instance');
    const s = inst.sources;
    const prov = $('#prov');
    prov.innerHTML = '';
    prov.append(el('span', 'chip', inst.instance_id));
    for (const [name, kind] of Object.entries(s)) {
      const real = kind !== 'synthetic';
      prov.append(el('span', 'chip ' + (real ? 'real' : 'syn'),
        `${name}: ${real ? 'REAL' : 'generated'}`));
    }
    prov.append(el('span', 'chip',
      `${inst.sections.length} sections · ${inst.task_count} tasks · ${inst.overdue_count} overdue`));

    if (view === 'plan') await renderPlan(staged);
    else if (view === 'compare') await renderCompare(staged);
    else if (view === 'ml') await renderML(staged);
    else await renderSections(staged);

    root.innerHTML = '';
    root.append(...staged.childNodes);
    $('#live').textContent = 'Updated.';
  } catch (e) {
    root.innerHTML = '';
    const box = el('div', 'err');
    box.append(el('div', null, 'Could not load this view: ' + e.message));
    const retry = el('button', 'btn-primary', 'Retry');
    retry.style.marginTop = '12px';
    retry.addEventListener('click', render);
    box.append(retry);
    root.append(box);
    $('#live').textContent = 'Failed to load.';
  } finally {
    $('#go').disabled = false;
  }
}

/* Tabs: arrow-key navigation per the WAI-ARIA tabs pattern. */
const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab) {
  tabs.forEach(t => {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
  $('#view').setAttribute('aria-labelledby', tab.id);
  view = tab.dataset.v;
  render();
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (ev) => {
    const map = { ArrowRight: 1, ArrowLeft: -1, Home: 'first', End: 'last' };
    if (!(ev.key in map)) return;
    ev.preventDefault();
    const next = map[ev.key] === 'first' ? tabs[0]
      : map[ev.key] === 'last' ? tabs[tabs.length - 1]
      : tabs[(i + map[ev.key] + tabs.length) % tabs.length];
    next.focus(); selectTab(next);
  });
});

$('#go').addEventListener('click', render);
['days', 'tasks', 'grounded', 'tl'].forEach(id => $('#' + id).addEventListener('change', render));
document.addEventListener('scroll', hideTip, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
render();
