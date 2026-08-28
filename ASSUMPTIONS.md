# ASSUMPTIONS.md

Every modelling assumption in this project, with its justification and its
current sourcing status. Required by PROJECT_BRIEF.md §3.

**Status key**

| Status | Meaning |
|--------|---------|
| `GROUNDED` | Traceable to a named public source, cited below and in a code comment. |
| `PROVISIONAL` | Plausible placeholder. Must be replaced or grounded before we quote numbers publicly. |
| `CONSTRUCT` | Our own modelling device with no real-world counterpart. Defensible by argument, not by citation. |

**No internal Indian Railways system has been accessed.** No TMS, SMMS, TDMS
or COA feed is connected, and none is likely to be.

**The timetable is a real exception.** Train schedules are public, and
`src/ingest/railradar.py` pulls them from the RailRadar API — a third-party
aggregator of public NTES data, *not* an official Railways endpoint. This
lets section geometry and hourly traffic stop being invented. Maintenance
backlogs stay synthetic: TMS/SMMS/TDMS have no public equivalent.

Provenance is therefore recorded **per component**, not per instance
(`DataProvenance` in `src/models/core.py`): `sections`, `tasks`, `traffic`
and `crew_capacity` each carry their own `SourceKind`. `is_synthetic` is a
computed field that is True if *any* component is generated, so partly-real
data can never be presented as wholly real.

---

## A-01 — Maintenance periodicities (`interval_days`)

**Status:** `PROVISIONAL` — *the largest open debt in the project.*

`src/generator/catalogue.py` assigns each activity type a mandated interval
(e.g. through packing 365 days, point machine maintenance 90 days). These
values are plausible but **not yet read out of a manual**.

Phase 2 replaces each with a value from the Indian Railways Permanent Way
Manual (ENGG), the AC Traction Manual (TRD), or the Signal Engineering
Manual (S&T), and records the clause number in the `ActivitySpec.source`
field.

We deliberately do **not** write clause numbers we have not read. A
fabricated citation is a worse failure than an admitted gap: a judge who
checks one invented reference discounts everything else we claim.

## A-02 — Traffic density profiles

**Status:** `PROVISIONAL` for the synthetic instance; **`GROUNDED` for the
hybrid instance** — fetched 2026-08-28 for the New Delhi–Ghaziabad corridor
(8 sections, 11 API requests).

The 24-hour `traffic_density_profile` on each section is one of three
hand-built archetypes (`suburban_trunk`, `mixed_trunk`, `branch_line`) in
`src/generator/sections.py`. Shapes were chosen to reproduce the qualitative
pattern of an Indian suburban corridor — twin commuter peaks, a deep night
trough, freight concentrated overnight — not measured from any timetable.

They are shaped so night hours are unambiguously the cheapest time to block.
This is the premise the optimiser exists to exploit; if it were false the
project would have no thesis. `tests/test_generator.py::
test_night_is_cheaper_than_morning_peak` asserts it holds.

**Real profiles are now derivable.** `scripts/fetch_timetable.py` builds each
section's profile from the published timetable: for a section between
adjacent stations A and B, every train appearing on both station boards with
consecutive stop sequences traverses that section, and it is credited to each
clock hour between its departure from A and arrival at B. The result is a
measured 24-bin histogram rather than a drawn curve.

Two details matter for correctness:

* Station boards are fetched with `includeIntermediate=true`, so
  **pass-through trains are counted**. Omitting them would undercount trunk
  traffic badly, understate the cost of blocking, and inflate our headline
  improvement.
* Corridors are derived from a real train's route rather than typed by hand,
  because consecutive stops on a route are adjacent by construction. Two
  stations that merely both exist on a line are not a section.

**Verified against live data (2026-08-28).** At Ghaziabad,
`includeIntermediate=true` returns 492 trains against 307 without it: 185
pass-through trains, **38% of that station's traffic**. Omitting them would
have understated the cost of blocking by more than a third and inflated our
headline improvement accordingly.

The synthetic instance still uses the hand-built archetypes below, and its
status stays `PROVISIONAL`.

## A-03 — Block durations and 15-minute granularity

**Status:** `PROVISIONAL` (durations) / `CONSTRUCT` (granularity)

Activity durations sit in the 60–240 minute range, matching the 2–4 hour
traffic-block windows typically granted in practice. Ranges per activity are
our estimates.

All durations are rounded to 15-minute multiples. This is a modelling
convenience: it matches how blocks are requested in practice and it keeps the
CP-SAT time grid small enough to solve inside the 60-second demo budget.

## A-04 — Day-of-week and freight variation

**Status:** day-of-week is now **`GROUNDED`**; freight remains `CONSTRUCT`
and absent.

Weekday traffic is multiplied by day-of-week factors (Fri 1.05, Sat 0.90,
Sun 0.75, otherwise 1.00) to reflect lighter weekend passenger services.
Freight is flagged on night hours (22:00–04:00) of mixed-traffic sections.

Both are qualitative patterns, not measured factors. They exist so the
optimiser faces a non-uniform week rather than seven identical days.

Day-of-week is now measured, freight is not:

* **Day-of-week is real.** The station board carries each train's `runDays`,
  at no extra request cost — the bulk lookup lacks it, but the per-station
  board has it. We therefore build a measured 7x24 traffic grid per section
  rather than scaling one weekday shape by invented multipliers.

  The real data corrects us: on Sahibabad–Ghaziabad, daily totals run
  350 (Sat) to 373 (Thu) — a spread of about 6%. Our hand-chosen Sunday
  multiplier of 0.75 was wrong by roughly 20 percentage points. A trunk
  section carrying long-distance traffic simply does not empty at weekends
  the way a commuter-only line would.
* **Freight is genuinely absent from public data.** Goods paths are allotted
  dynamically and do not appear in published passenger timetables. For
  timetable-derived sections we therefore flag **no** goods windows at all
  rather than inventing them — see
  `tests/test_hybrid_adapter.py::test_no_goods_flag_invented_for_real_sections`.
  This makes real-section traffic an **undercount** at night, when freight
  actually runs. The direction of that error matters: it makes night blocks
  look cheaper than they are, so our improvement figures are, if anything,
  optimistic on this axis. State it rather than let a judge find it.

## A-05 — Unified severity scale

**Status:** `CONSTRUCT` — *and a genuine finding, not merely a shortcut.*

`Severity` is a 1–5 ordinal scale (1 cosmetic … 5 safety-critical).

No such shared scale exists: TMS, SMMS and TDMS each grade defects in their
own vocabulary. Any real integration must define a mapping onto one
comparable axis, because an optimiser cannot trade an ENGG defect against an
S&T defect without one. We surface this as a required integration decision
rather than hiding it inside the generator.

## A-06 — Crew capacity

**Status:** `PROVISIONAL`

Each department fields 1–3 crews per day (ENGG 2–3, TRD 1–2, S&T 1–2),
reduced by one on Sundays. Establishment strength for a real division would
come from the divisional office; these are placeholders sized so crew
capacity actually binds on some days, making the constraint meaningful rather
than decorative.

## A-07 — Backlog composition

**Status:** `CONSTRUCT`

Tasks are placed relative to their due date: ~25% already overdue when the
horizon opens, ~40% falling due inside it, the rest comfortably ahead. Small
instances vary from these targets by sampling noise (the 20-task Phase 0
instance lands at 15% overdue).

A maintenance backlog with no overdue work would make the deadline constraint
inert; one that is entirely overdue would make it infeasible. The mix is
chosen so the optimiser must genuinely triage.

## A-08 — Severity correlates with lateness

**Status:** `CONSTRUCT`

Severity is sampled with a distribution that shifts upward as a task runs
later. Justification is twofold: physically, an unattended defect degrades;
and practically, the Phase 3 criticality model needs learnable signal. A
purely random severity would make the ML component a demonstrable no-op.

**This is a known circularity and must be stated in the deck.** We generate
the correlation the model then learns. The model's value is not that it
discovers this relationship, but that it combines several such features into
one ranking, and that the ranking is explainable. We claim nothing more.

## A-09 — Section identity and length

**Status:** `PROVISIONAL` in the synthetic instance; **`GROUNDED`** in the
hybrid instance.

Section names are real inter-station stretches of the Delhi division,
Northern Railway (New Delhi, Shahdara, Sahibabad, Ghaziabad, Okhla,
Faridabad) — real places in a real order. **`length_km` values are
approximate**.

In the hybrid instance both problems disappear: sections come from a real
train's route, and `length_km` is the difference between the two stations'
`distance` values in the timetable (median over all trains calling at both,
since individual records can be wrong).

The fetched corridor is train 64422's route, New Delhi to Ghaziabad:
NDLS – Shivaji Bridge – Tilak Bridge – Mandawali Chander Vihar – Anand Vihar
– Chander Nagar – Delhi Shahdara B Panel – Sahibabad – Ghaziabad. Eight
sections, 1–7 km each.

## A-10 — Co-location eligibility

**Status:** `CONSTRUCT`

Most activities may share a block with another department's work on the same
section. Two are marked ineligible — `ballast_deep_screening` and
`lwr_destressing` — on the grounds that heavy track machinery occupies the
full section and excludes concurrent work.

Real eligibility is a safety determination and would be set by the divisional
engineer. We model it as a per-activity boolean so a real rule table can
replace it without touching the optimiser.

## A-11 — Task independence

**Status:** `CONSTRUCT`

Tasks carry no precedence relations: any task may be scheduled in any order.
Real maintenance has sequencing (screen ballast before packing). Adding
precedence to CP-SAT is straightforward and is deferred, not overlooked.

## A-12 — Single-line sections

**Status:** `CONSTRUCT`

A block occupies a whole section, so two blocks cannot overlap on one section.
Real multi-line sections permit work on one line while traffic runs on
another, at reduced capacity. Modelling this needs per-line traffic data we
do not have; the single-line assumption is **conservative** — it overstates
the cost of blocking, so our improvement figures are not flattered by it.

## A-13 — The traffic figure is a weekly mean

**Status:** `CONSTRUCT` (a reporting choice, not a data gap)

`Section.traffic_density_profile` is the **average across the seven days**,
not the union of all trains that ever traverse. The distinction is large:
482 distinct trains cross Sahibabad–Ghaziabad during a week, but only about
364 on any given day. Reporting the union would overstate every day.

The optimiser does not use this averaged figure at all — it costs blocks
against the measured per-day grid (`profile_by_dow`), so a Sunday block is
priced with Sunday's traffic.

---

## Known weaknesses to state out loud

1. **A-01 is unresolved.** Until periodicities come from the manuals, the
   instance is realistic in structure but not in calibration.
2. **A-08 is circular.** We generate the pattern the ML model learns.
3. **Traffic data is passenger-only.** Freight does not appear in public
   timetables, so night-time traffic on real sections is undercounted — the
   one place our figures could flatter us. See A-04.
4. **Uniform activity sampling under-represents TRD.** Phase 0 draws
   activities uniformly from a catalogue holding 5 ENGG, 4 S&T and 3 TRD
   entries, so TRD receives roughly a quarter of the tasks. For a project
   about three-department coordination this understates one department.
   Phase 2 samples department first, then activity within it.
