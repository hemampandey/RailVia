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

## Status: Phase 0 complete

| Phase | Scope | State |
|-------|-------|-------|
| 0 | Data model + tiny generator (5 sections, 20 tasks, 7 days) | done |
| 0.5 | Real timetable ingestion — pipeline built, awaiting API key | ready to run |
| 1 | Minimum viable CP-SAT optimiser | done |
| 2 | IRPWM-grounded data at scale, crew + deadline constraints | next |
| 3 | Criticality model + baseline simulator | |
| 4 | FastAPI + React Gantt UI | |
| 5 | Polish, re-planning, recorded demo | |

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

### Real timetable data

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
src/optimiser/    CP-SAT model: windows.py (time grid, permitted
                  windows), model.py (the solver model)
src/ml/           Criticality scoring             (Phase 3)
src/baseline/     Manual-process simulator        (Phase 3)
src/api/          FastAPI                         (Phase 4)
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
