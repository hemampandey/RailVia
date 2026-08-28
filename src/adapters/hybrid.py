"""Real timetable + synthetic maintenance backlog.

This is the most honest instance we can currently build, and the reason the
distinction matters:

  * `sections` and `traffic` come from the **published Indian Railways
    timetable**, via the RailRadar aggregator. Real section geometry, real
    trains, real hourly distribution.
  * `tasks` and `crew_capacity` remain **synthetic**. Maintenance backlogs
    live in TMS/SMMS/TDMS, which are internal systems with no public
    equivalent. Nothing we can do closes that gap.

Which means the cost side of the objective — train-hours lost, the number in
the headline claim — is computed against real traffic. Only the work being
scheduled is invented. That is a materially stronger position than a fully
synthetic instance, and it is worth stating precisely rather than rounding
off in either direction.

This class occupies the COA slot: COA holds the timetable internally, and the
public timetable is the same information.
"""

from __future__ import annotations

import json
import pathlib
import random
from datetime import date

from src.adapters.base import DataSource
from src.models import (
    DataProvenance,
    PlanningInstance,
    Section,
    SourceKind,
)

DEFAULT_GROUNDED_PATH = pathlib.Path("data/grounded_sections.json")

PROVENANCE = (
    "HYBRID. Sections and traffic derived from the published Indian Railways "
    "timetable via the RailRadar API (a third-party aggregator of public NTES "
    "data, not an official Railways endpoint). Maintenance tasks and crew "
    "capacity are SYNTHETIC — TMS/SMMS/TDMS have no public equivalent. "
    "See ASSUMPTIONS.md."
)


class GroundedTimetableSource(DataSource):
    """Builds a planning instance on real timetable-derived sections.

    Reads the file written by scripts/fetch_timetable.py. The API is never
    called at load time: the fetch is a separate, cached, offline step, so a
    demo cannot fail because of someone's network.
    """

    is_synthetic = False  # of the timetable half; the instance reports per component
    is_connected = True

    def __init__(
        self,
        path: pathlib.Path | str = DEFAULT_GROUNDED_PATH,
        seed: int = 42,
        n_tasks: int = 20,
        horizon_days: int = 7,
        horizon_start: date = date(2026, 3, 2),  # a Monday
        division: str = "Delhi (Northern Railway)",
    ) -> None:
        self.path = pathlib.Path(path)
        self.seed = seed
        self.n_tasks = n_tasks
        self.horizon_days = horizon_days
        self.horizon_start = horizon_start
        self.division = division

    @property
    def provenance(self) -> str:  # type: ignore[override]
        return (
            f"timetable-derived sections from {self.path}; "
            f"{self.n_tasks} synthetic tasks, seed={self.seed}"
        )

    def describe(self) -> str:
        return f"[HYBRID] {type(self).__name__}: {self.provenance}"

    def available(self) -> bool:
        return self.path.exists()

    def load_sections(self) -> list[Section]:
        if not self.path.exists():
            raise FileNotFoundError(
                f"{self.path} not found. Build it first:\n"
                f"  RAILRADAR_API_KEY=... .venv/bin/python scripts/fetch_timetable.py "
                f"--from-train <number> --start <code> --end <code>"
            )
        payload = json.loads(self.path.read_text())
        sections: list[Section] = []
        for record in payload["sections"]:
            profile = [float(x) for x in record["traffic_density_profile"]]
            if len(profile) != 24 or sum(profile) == 0:
                # A zero profile means no traversals were found: the pair is
                # probably not adjacent. Dropping it is right — a section that
                # looks empty would be scheduled through rush hour for free.
                continue
            length = record.get("length_km")
            sections.append(
                Section(
                    id=record["id"],
                    name=f"{record['station_a']} - {record['station_b']}",
                    division=self.division,
                    # Fall back only when the timetable carried no distance.
                    length_km=float(length) if length else 1.0,
                    traffic_density_profile=profile,
                )
            )
        if not sections:
            raise ValueError(
                f"{self.path} yielded no usable sections (all profiles empty)."
            )
        return sections

    def load(self) -> PlanningInstance:
        # The adapter layer is the one place permitted to know the generator
        # exists; downstream packages must go through DataSource.
        from src.generator.synthetic import (
            build_crew_capacity,
            build_traffic,
            generate_tasks,
        )

        sections = self.load_sections()
        rng = random.Random(self.seed)
        tasks = generate_tasks(
            rng, sections, self.n_tasks, self.horizon_start, self.horizon_days
        )

        instance = PlanningInstance(
            instance_id=(
                f"hybrid-s{self.seed}-{len(sections)}sec-"
                f"{self.n_tasks}task-{self.horizon_days}d"
            ),
            generated_at=__import__("datetime").datetime(2026, 1, 1),
            seed=self.seed,
            sources=DataProvenance(
                sections=SourceKind.PUBLIC_TIMETABLE,
                tasks=SourceKind.SYNTHETIC,
                traffic=SourceKind.PUBLIC_TIMETABLE,
                crew_capacity=SourceKind.SYNTHETIC,
                notes=(
                    "Traffic and section geometry from the published timetable; "
                    "maintenance backlog and crew strength generated."
                ),
            ),
            provenance=PROVENANCE,
            horizon_start=self.horizon_start,
            horizon_days=self.horizon_days,
            sections=sections,
            tasks=tasks,
            traffic=build_traffic(sections, self.horizon_start, self.horizon_days),
            crew_capacity=build_crew_capacity(
                rng, self.horizon_start, self.horizon_days
            ),
        )
        instance.validate_referential_integrity()
        return instance
