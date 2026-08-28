"""CP-SAT block planning model.

Formulation in plain language
-----------------------------
*Tasks* are the work to be done. *Blocks* are the windows during which a
section is handed over. Several tasks may share one block — that is the whole
point of the project, and it is why NoOverlap is applied to blocks rather
than to tasks. Forbidding two departments from working the same section at
once would forbid exactly the coordination we are trying to demonstrate.

Variables
  per task   start, end (duration fixed), present
  per block  start, end, present, and one optional interval for NoOverlap
  linking    assign[task, block] — which block carries which task

Constraints
  1. Every present task is assigned to exactly one block on its own section,
     and sits entirely inside it.
  2. Blocks on the same section never overlap  (NoOverlap).
  3. Each block lies inside one contiguous permitted window, so no block
     straddles a peak period. Permitted windows come from windows.py.
  4. Task start domains are pre-restricted to slots where the whole duration
     fits in permitted time. Redundant given (1) and (3), but it prunes the
     search early.
  5. Everything finishes inside the horizon (implicit in the slot domains).

Objective  minimise
     train-hours lost, summed over BLOCKS
   + a penalty for every task left unscheduled

Cost is charged per block, never per task. Two departments sharing one block
therefore pay once instead of twice, and the optimiser discovers co-location
on its own — there is no bonus term to point at, which is what makes the
result worth showing.

Why the unscheduled penalty exists even in Phase 1: with a pure train-hours
objective the cheapest schedule is the empty one, since doing nothing costs
nothing. The penalty is flat here; Phase 3 replaces it with the criticality
weight so that *which* task gets dropped becomes a judgement rather than an
accident.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from src.models import Department, PlanningInstance, Task
from src.optimiser.windows import (
    DEFAULT_PERCENTILE,
    TimeGrid,
    cumulative_train_hours,
    feasible_starts,
    permitted_runs,
    permitted_slots,
    traffic_by_slot,
)

log = logging.getLogger(__name__)

COST_SCALE = 100  # integer units per train-hour

# Must exceed the cost of any single block, or dropping work would look
# cheaper than doing it. Sized well above the worst case: a 6-hour block on
# the busiest section costs roughly 130 train-hours.
DEFAULT_UNSCHEDULED_PENALTY = 100_000

DEFAULT_TIME_LIMIT_SECONDS = 60.0  # A live demo cannot wait longer.


@dataclass
class ScheduledBlock:
    section_id: str
    start_slot: int
    end_slot: int
    task_ids: list[str]
    departments: list[Department]
    train_hours: float

    @property
    def is_shared(self) -> bool:
        return len(set(self.departments)) > 1


@dataclass
class Solution:
    status: str
    blocks: list[ScheduledBlock]
    unscheduled_task_ids: list[str]
    train_hours_lost: float
    objective: float
    wall_time: float
    best_bound: float
    impossible_task_ids: list[str] = field(default_factory=list)

    @property
    def feasible(self) -> bool:
        return self.status in ("OPTIMAL", "FEASIBLE")

    @property
    def shared_blocks(self) -> int:
        return sum(1 for b in self.blocks if b.is_shared)

    @property
    def scheduled_count(self) -> int:
        return sum(len(b.task_ids) for b in self.blocks)


class BlockPlanner:
    """Builds and solves the CP-SAT model for one planning instance."""

    def __init__(
        self,
        instance: PlanningInstance,
        percentile: float = DEFAULT_PERCENTILE,
        unscheduled_penalty: int = DEFAULT_UNSCHEDULED_PENALTY,
        time_limit: float = DEFAULT_TIME_LIMIT_SECONDS,
        slot_minutes: int = 15,
    ) -> None:
        self.instance = instance
        self.percentile = percentile
        self.unscheduled_penalty = unscheduled_penalty
        self.time_limit = time_limit
        self.grid = TimeGrid(instance.horizon_start, instance.horizon_days, slot_minutes)

        self.traffic = traffic_by_slot(instance, self.grid)
        self.permitted = {
            sid: permitted_slots(series, percentile) for sid, series in self.traffic.items()
        }
        self.runs = {sid: permitted_runs(p) for sid, p in self.permitted.items()}
        self.cumulative = {
            sid: cumulative_train_hours(series, self.grid, COST_SCALE)
            for sid, series in self.traffic.items()
        }

        self.model = cp_model.CpModel()
        self._build()

    # -- helpers -------------------------------------------------------------

    def duration_slots(self, task: Task) -> int:
        return self.grid.minutes_to_slots(task.duration_minutes)

    def _tasks_by_section(self) -> dict[str, list[Task]]:
        grouped: dict[str, list[Task]] = {s.id: [] for s in self.instance.sections}
        for task in self.instance.tasks:
            grouped.setdefault(task.section_id, []).append(task)
        return grouped

    # -- model ---------------------------------------------------------------

    def _build(self) -> None:
        model = self.model
        horizon = self.grid.n_slots
        self.task_start: dict[str, cp_model.IntVar] = {}
        self.task_end: dict[str, cp_model.IntVar] = {}
        self.task_present: dict[str, cp_model.IntVar] = {}
        self.assign: dict[tuple[str, int], cp_model.IntVar] = {}
        self.block_vars: dict[str, list[dict]] = {}
        self.impossible: list[str] = []

        grouped = self._tasks_by_section()

        for section_id, tasks in grouped.items():
            if not tasks:
                continue
            permitted = self.permitted[section_id]
            runs = self.runs[section_id]

            # --- task variables ---
            for task in tasks:
                length = self.duration_slots(task)
                starts = feasible_starts(permitted, length)
                present = model.NewBoolVar(f"present_{task.id}")
                self.task_present[task.id] = present

                if not starts:
                    # No permitted window is long enough for this task. Say so
                    # rather than letting an unexplained infeasibility surface.
                    model.Add(present == 0)
                    self.impossible.append(task.id)
                    start = model.NewIntVar(0, 0, f"start_{task.id}")
                    end = model.NewIntVar(0, 0, f"end_{task.id}")
                else:
                    start = model.NewIntVarFromDomain(
                        cp_model.Domain.FromValues(starts), f"start_{task.id}"
                    )
                    end = model.NewIntVar(0, horizon, f"end_{task.id}")
                    model.Add(end == start + length)
                self.task_start[task.id] = start
                self.task_end[task.id] = end

            # --- block variables: at most one block per task on this section ---
            blocks = []
            for index in range(len(tasks)):
                b_present = model.NewBoolVar(f"blk_{section_id}_{index}_present")
                b_start = model.NewIntVar(0, horizon, f"blk_{section_id}_{index}_start")
                b_end = model.NewIntVar(0, horizon, f"blk_{section_id}_{index}_end")
                b_size = model.NewIntVar(0, horizon, f"blk_{section_id}_{index}_size")
                model.Add(b_size == b_end - b_start)
                interval = model.NewOptionalIntervalVar(
                    b_start, b_size, b_end, b_present, f"blk_{section_id}_{index}_iv"
                )
                # An absent block is pinned to zero so it cannot drift and
                # cannot contribute cost.
                model.Add(b_start == 0).OnlyEnforceIf(b_present.Not())
                model.Add(b_end == 0).OnlyEnforceIf(b_present.Not())
                blocks.append(
                    {
                        "present": b_present, "start": b_start, "end": b_end,
                        "size": b_size, "interval": interval,
                    }
                )
            self.block_vars[section_id] = blocks

            # Constraint 2: blocks on one section never overlap.
            model.AddNoOverlap([b["interval"] for b in blocks])

            # Constraint 3: each present block sits inside ONE permitted run,
            # so a block cannot straddle a peak period even if both its tasks
            # are individually in quiet windows.
            for index, block in enumerate(blocks):
                if not runs:
                    model.Add(block["present"] == 0)
                    continue
                choices = []
                for run_index, (run_start, run_end) in enumerate(runs):
                    chosen = model.NewBoolVar(f"blk_{section_id}_{index}_run{run_index}")
                    model.Add(block["start"] >= run_start).OnlyEnforceIf(chosen)
                    model.Add(block["end"] <= run_end).OnlyEnforceIf(chosen)
                    choices.append(chosen)
                model.AddExactlyOne(choices).OnlyEnforceIf(block["present"])
                for chosen in choices:
                    model.AddImplication(chosen, block["present"])

            # Constraint 1: every present task occupies exactly one block on
            # its section, and nests inside it.
            for task in tasks:
                literals = []
                for index, block in enumerate(blocks):
                    chosen = model.NewBoolVar(f"assign_{task.id}_{index}")
                    self.assign[(task.id, index)] = chosen
                    model.Add(self.task_start[task.id] >= block["start"]).OnlyEnforceIf(chosen)
                    model.Add(self.task_end[task.id] <= block["end"]).OnlyEnforceIf(chosen)
                    model.AddImplication(chosen, block["present"])
                    literals.append(chosen)
                model.Add(sum(literals) == 1).OnlyEnforceIf(self.task_present[task.id])
                model.Add(sum(literals) == 0).OnlyEnforceIf(self.task_present[task.id].Not())

            # A block exists only to carry work.
            for index, block in enumerate(blocks):
                carried = [self.assign[(t.id, index)] for t in tasks]
                model.AddBoolOr(carried).OnlyEnforceIf(block["present"])
                for literal in carried:
                    model.AddImplication(literal, block["present"])

            # Symmetry breaking: interchangeable blocks would otherwise be
            # permuted endlessly. Unused blocks are packed at the tail, and
            # blocks in use run in increasing start order.
            #
            # The ordering MUST be conditional on both blocks being present.
            # Absent blocks are pinned to slot 0, so an unconditional
            # `start[i] <= start[i+1]` would read as `start[i] <= 0` whenever
            # a later block goes unused, forcing every section's first block
            # to begin at midnight and silently excluding better schedules.
            for index in range(len(blocks) - 1):
                model.AddImplication(
                    blocks[index + 1]["present"], blocks[index]["present"]
                )
                model.Add(
                    blocks[index]["start"] <= blocks[index + 1]["start"]
                ).OnlyEnforceIf(
                    [blocks[index]["present"], blocks[index + 1]["present"]]
                )

        self._build_objective()

    def _build_objective(self) -> None:
        model = self.model
        terms = []
        self.block_cost: dict[tuple[str, int], cp_model.IntVar] = {}

        for section_id, blocks in self.block_vars.items():
            cumulative = self.cumulative[section_id]
            ceiling = max(cumulative)
            for index, block in enumerate(blocks):
                at_start = model.NewIntVar(0, ceiling, f"cum_s_{section_id}_{index}")
                at_end = model.NewIntVar(0, ceiling, f"cum_e_{section_id}_{index}")
                # cost = cum[end] - cum[start]: the train-hours lost across
                # every slot the block occupies.
                model.AddElement(block["start"], cumulative, at_start)
                model.AddElement(block["end"], cumulative, at_end)
                cost = model.NewIntVar(0, ceiling, f"cost_{section_id}_{index}")
                model.Add(cost == at_end - at_start)
                self.block_cost[(section_id, index)] = cost
                terms.append(cost)

        for task_id, present in self.task_present.items():
            terms.append(self.unscheduled_penalty * (1 - present))

        model.Minimize(sum(terms))

    # -- solve ---------------------------------------------------------------

    def solve(self, log_search: bool = False, workers: int = 8) -> Solution:
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = self.time_limit
        solver.parameters.num_search_workers = workers
        solver.parameters.log_search_progress = log_search
        status = solver.Solve(self.model)
        status_name = solver.StatusName(status)

        log.info(
            "solver status=%s objective=%s bound=%s wall=%.2fs",
            status_name,
            solver.ObjectiveValue() if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
            solver.BestObjectiveBound() if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
            solver.WallTime(),
        )

        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return Solution(
                status=status_name, blocks=[], unscheduled_task_ids=
                [t.id for t in self.instance.tasks], train_hours_lost=0.0,
                objective=0.0, wall_time=solver.WallTime(), best_bound=0.0,
                impossible_task_ids=list(self.impossible),
            )

        tasks_by_id = {t.id: t for t in self.instance.tasks}
        blocks: list[ScheduledBlock] = []
        train_hours = 0.0

        for section_id, block_list in self.block_vars.items():
            for index, block in enumerate(block_list):
                if not solver.Value(block["present"]):
                    continue
                carried = [
                    task_id for (task_id, block_index), literal in self.assign.items()
                    if block_index == index
                    and tasks_by_id[task_id].section_id == section_id
                    and solver.Value(literal)
                ]
                if not carried:
                    continue
                cost = solver.Value(self.block_cost[(section_id, index)]) / COST_SCALE
                train_hours += cost
                blocks.append(
                    ScheduledBlock(
                        section_id=section_id,
                        start_slot=solver.Value(block["start"]),
                        end_slot=solver.Value(block["end"]),
                        task_ids=sorted(carried),
                        departments=sorted(
                            {tasks_by_id[t].department for t in carried},
                            key=lambda d: d.value,
                        ),
                        train_hours=round(cost, 3),
                    )
                )

        blocks.sort(key=lambda b: (b.start_slot, b.section_id))
        unscheduled = [
            t.id for t in self.instance.tasks if not solver.Value(self.task_present[t.id])
        ]
        return Solution(
            status=status_name,
            blocks=blocks,
            unscheduled_task_ids=unscheduled,
            train_hours_lost=round(train_hours, 3),
            objective=solver.ObjectiveValue(),
            wall_time=solver.WallTime(),
            best_bound=solver.BestObjectiveBound(),
            impossible_task_ids=list(self.impossible),
        )
