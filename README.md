# Automatic Block Planning — SIH26027

Coordinated maintenance block scheduling for Indian Railways. Three
departments (ENGG, TRD, S&T) currently request track-blocking windows
independently; this system merges their demands into one schedule that
completes the required maintenance while losing the fewest train-hours.

See [PROJECT_BRIEF.md](PROJECT_BRIEF.md) for full scope and build order.

> **Data provenance is tracked per component.** Maintenance backlogs are
> synthetic — TMS, SMMS and TDMS are internal systems with no public
> equivalent. **Train traffic is real**: section geometry and hourly traffic
> profiles are derived from the published Indian Railways timetable via the
> RailRadar API. Every planning instance records a `SourceKind` for each of
> `sections`, `tasks`, `traffic` and `crew_capacity`, and reports
> `is_synthetic=True` if *any* component is generated.
> See [ASSUMPTIONS.md](ASSUMPTIONS.md).

## Status: all phases complete

| Phase | Scope | State |
|-------|-------|-------|
| 0 | Data model + tiny generator (5 sections, 20 tasks, 7 days) | done |
| 0.5 | Real timetable ingestion (RailRadar) | done |
| 1 | Minimum viable CP-SAT optimiser | done |
| 2 | Real scale (39 sections, 300 tasks), crew + deadline constraints | done |
| 3 | Criticality model + baseline simulator | done |
| 4 | FastAPI + browser UI | done |
| 5 | Scenario re-planning, recorded demo | done |

## The headline

**~16% fewer train-hours lost across a 30-day horizon, on 39 sections with 3
departments, for an identical set of maintenance tasks** — measured over four
runs at a 60-second solver budget, range 9.5% to 24.5%.

Quote the range, not the best run. A time-limited parallel search returns one
of several good schedules, and the spread is wide because the solver is still
improving when the clock stops. The figure also moves with the budget: the
same instance gives roughly 6% at 30 seconds. Budget and instance size belong
next to the number every time it is stated. See
[ASSUMPTIONS.md](ASSUMPTIONS.md) A-19.

Consistent across every run, and far more stable than the percentage:

| | Manual | Ours (same work) |
|---|---|---|
| Blocks shared across departments | 0 | 21–37 |
| Peak-hour blocks | 8 | 0 |
| Separate blocks | 218 | 155–201 |
| Tasks finishing late | 135 | 93–115 |

Separately, given the same month the planner completes **54 more tasks** than
the manual process manages.

Neither column is quoted alone: see [ASSUMPTIONS.md](ASSUMPTIONS.md) A-17 for
exactly what the baseline is allowed to do and why the comparison is
normalised to identical work.

**Reducing that variance is the first thing to fix.** The spread comes from
the solver stopping well short of proving optimality on a 300-task instance;
better search hints or a tighter formulation would narrow it.

## Setup

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Run

Generate an instance and write it to JSON:

```bash
.venv/bin/python scripts/generate.py --seed 42 --tasks 20 --days 7
```

Inspect it in human-readable form — this is the Phase 0 gate:

```bash
.venv/bin/python scripts/inspect_data.py
```

### Reproducing the numbers without an API key

The RailRadar responses and the derived section file are **committed**
(`data/cache/railradar/`, `data/grounded_sections.json`). They are public
timetable data, and tracking them means every figure here can be reproduced
offline by anyone, with no key and no network. `--offline` forces cache-only:

```bash
.venv/bin/python scripts/fetch_timetable.py --from-train 64422,64076,64464,64908 --offline
```

### Fetching fresh timetable data

Get a free sandbox key (1,000 requests/month) at
<https://railradar.in/developers>, then put it in a `.env` file in the repo
root — `.env` is gitignored, so the key is never committed:

```bash
cp .env.example .env
```

Edit `.env` and replace the placeholder with your key. Then confirm the
response shape with one request:

```bash
.venv/bin/python scripts/probe_api.py --station NDLS
```

Then build real section profiles. Deriving the corridor from a train's route
guarantees the station pairs are physically adjacent:

```bash
.venv/bin/python scripts/fetch_timetable.py --from-train 12002 --start NDLS --end GZB
```

Cost is 1 request for the route plus 1 per station. Responses are cached to
disk permanently and never re-fetched, so re-runs are free and the job is
resumable. Then:

```bash
.venv/bin/python scripts/inspect_data.py --grounded
```

### Solve

```bash
.venv/bin/python scripts/optimise.py --grounded
```

Prints the permitted windows per section, the block plan as a text table, and
the train-hours lost. `--percentile` controls how much of each section's day
is open to planned work (default: quietest 25%).

### Before / after — the headline number

```bash
.venv/bin/python scripts/compare.py --grounded --tasks 300 --days 30
```

### The app

Two processes: a Python API (the optimiser lives here — OR-Tools and LightGBM
have no Node equivalent) and a Next.js front end. Start both with:

```bash
./run.sh
```

Or separately, in two terminals:

```bash
.venv/bin/uvicorn src.api.app:app --port 8077
```

```bash
npm --prefix web run dev
```

If the browser says it cannot reach the planning API, the Python half is not
running — that is the usual cause.

Then open <http://localhost:3000>. The browser calls the API directly on port
8077 rather than through Next's rewrite proxy — a solve can take 60 seconds
and the dev proxy drops the socket long before that (`ECONNRESET`). CORS is
configured for the dev origins; set `NEXT_PUBLIC_API_ORIGIN` to point
elsewhere.

**Next.js 15 App Router, TypeScript, no UI framework.** Styling is plain CSS
driven by semantic design tokens, so light and dark come from one set of
variables. A sidebar carries the four views with live counts, the store status
and the theme toggle. The plan is fetched once in a context provider shared by
every route, so switching views never re-solves.

### Sign-in, roles, and where decisions are stored

Two roles, matching how a division works:

| Role | Can |
|---|---|
| **Divisional head** | Grant and withdraw closures, and report work done |
| **Section engineer** | Report work done. Cannot grant a closure |

Taking track out of service is an authority decision, not a departmental
one — so approving is the head's alone. Both roles see the whole plan: an
engineer needs it to know when their section is free.

**This is enforced in Postgres, not in the UI.** Hiding the Approve button
is a courtesy; the row-level-security policies in
[`src/store/schema.sql`](src/store/schema.sql) are the control. An engineer
who calls the REST API directly still cannot insert an approval. The API
verifies the Supabase JWT so it knows who is asking and can attribute the
decision, then acts *as that user* against Postgres so the database decides —
rather than the API enforcing a second, separately-maintained opinion.

Approvals and completions are the only things this system persists;
everything else rebuilds from a seed and the cached timetable. They go to
**Supabase and nowhere else** — no local fallback, because an approval one
planner can see and another cannot is worse than being told the store is
unreachable. Without it, planning works normally and the decision actions are
disabled with an explanation.

**Setup**

1. Create a project at [supabase.com](https://supabase.com)
2. Run [`src/store/schema.sql`](src/store/schema.sql) in the SQL editor
3. Add the two users under Authentication → Users, then promote one to head
   with the SQL at the bottom of that file
4. Add to `.env` in the repo root (gitignored):

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_JWT_SECRET=your-jwt-secret
```

5. Copy `web/.env.local.example` to `web/.env.local` and fill in the same
   project URL and anon key

The JWT secret is under Project Settings → API. The anon key is public by
design — it is safe in a browser precisely because row-level security, not
the key, is what protects the data.

### Recorded demo (stage backup)

```bash
.venv/bin/python scripts/demo.py --out demo_run.txt
```

Runs every stage and writes a transcript. Deterministic given the seed, so
the recording and a live run produce identical numbers.

Run the tests:

```bash
.venv/bin/python -m pytest -q
```

## Layout

```
src/models/       Pydantic data model — the shared vocabulary
src/ingest/       RailRadar client + timetable -> traffic-profile derivation
src/generator/    Synthetic instance generator (a deliverable, not a shortcut)
src/adapters/     THE BOUNDARY: DataSource interface, synthetic source,
                  hybrid (real traffic + synthetic tasks), and typed stubs
                  for the four real systems
src/optimiser/    CP-SAT model: windows.py (time grid, permitted windows),
                  model.py (solver model), replan.py (disruption re-planning)
src/ml/           Criticality scoring (LightGBM) + explainability
src/baseline/     Manual-process simulator and the before/after comparison
src/api/          FastAPI — a pure JSON API, no server-rendered UI
src/store/        Supabase persistence, JWT verification, role schema
web/              Next.js 15 front end (App Router, TypeScript)
scripts/          CLI entry points
tests/            pytest — constraint tests mandatory from Phase 1
```

### The adapter boundary

`src/adapters/base.py` defines `DataSource`. `SyntheticDataSource` is the only
implementation that returns data today; `TMSAdapter`, `SMMSAdapter`,
`TDMSAdapter` and `COAAdapter` declare the integration contract and raise
`NotYetIntegrated` when loaded. They report `[NOT CONNECTED]`, never `[LIVE]`.

`tests/test_adapter_boundary.py` fails the build if anything downstream
imports the generator directly, so "real feeds plug in here" stays true rather
than becoming a slide claim.


## Departures from the brief, and why

Three, each forced by measurement rather than preference:

1. **The peak-hour rule is per-section, not a flat `trains_per_hour > 8`.**
   Real traffic kills the flat rule: Sahibabad–Ghaziabad never drops below
   2.9 trains/hour and offers no contiguous sub-8 window longer than 2 hours,
   so every task over 120 minutes there would have been infeasible. Each
   section's quietest 25% of hours is now the permitted set. (A-14)

2. **NoOverlap applies to blocks, not tasks.** Applied to tasks it would
   forbid two departments working one section at once — precisely the
   coordination the project exists to demonstrate. Tasks nest inside blocks;
   blocks are what cannot overlap.

3. **The UI is Next.js, and decisions persist to Supabase.** The brief
   specified React plus a Gantt library, and "SQLite. Sufficient. Do not
   introduce Postgres." Supabase is hosted Postgres. Both are deliberate
   choices made during the build rather than oversights.

## Honest limitations

- **Maintenance periodicities are still provisional.** No IRPWM clause
  numbers are cited because none have been read. Fabricating them would be
  the worst thing we could do to our own credibility. (A-01)
- **Freight is invisible.** Goods paths are absent from public timetables, so
  night traffic on real sections is undercounted — the one axis where our
  figures could flatter us. (A-04)
- **The failure hazard the ML model learns is one we wrote.** The model earns
  its place by combining features into an explainable ranking that can be
  retrained on real history, not by discovering the relationship. Held-out
  AUC is 0.68, which is what learning from noisy events should look like.
  (A-08)
- **The improvement scales with backlog density** — sparse work offers fewer
  chances to merge blocks. Always quote the instance size.
- **The headline varies run to run** (9.5–24.5% over four runs) because
  parallel time-limited search is not reproducible, and single-worker or
  deterministic-time alternatives were measured and are unusable. The data is
  fully deterministic; the search is not. (A-19)
