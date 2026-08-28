"""Scenario re-planning."""

from __future__ import annotations

from src.models import Department
from src.optimiser.model import BlockPlanner
from src.optimiser.replan import Disruption, replan_after
from tests.test_optimiser_constraints import NIGHT_SPARSE, build_instance, task


def _instance():
    return build_instance(
        {"S1": NIGHT_SPARSE, "S2": NIGHT_SPARSE},
        [task(f"T{i}", "S1" if i % 2 else "S2", 60, dept=list(Department)[i % 3])
         for i in range(8)],
        horizon_days=6,
    )


def test_completed_work_is_not_replanned():
    instance = _instance()
    original = BlockPlanner(instance, time_limit=15).solve()
    grid = BlockPlanner(instance, time_limit=1).grid
    at = 3 * grid.slots_per_day
    result = replan_after(instance, original, Disruption(at, "S1", 8), time_limit=15)

    assert set(result.completed_task_ids).isdisjoint(result.carried_task_ids)
    replanned_ids = {t for b in result.replanned.blocks for t in b.task_ids}
    assert replanned_ids.isdisjoint(result.completed_task_ids)


def test_unscheduled_work_is_carried_forward():
    """Work the first plan could not place must not be quietly forgotten."""
    instance = _instance()
    original = BlockPlanner(instance, time_limit=15).solve()
    result = replan_after(instance, original, Disruption(0, "S1", 4), time_limit=15)
    for task_id in original.unscheduled_task_ids:
        assert task_id in result.carried_task_ids


def test_disrupted_section_is_avoided_during_the_overrun():
    instance = _instance()
    original = BlockPlanner(instance, time_limit=15).solve()
    grid = BlockPlanner(instance, time_limit=1).grid
    at = 2 * grid.slots_per_day
    overrun = 12
    result = replan_after(instance, original, Disruption(at, "S1", overrun), time_limit=15)
    for block in result.replanned.blocks:
        if block.section_id != "S1":
            continue
        assert not (block.start_slot < at + overrun and at < block.end_slot)


def test_replan_reports_its_own_delta():
    instance = _instance()
    original = BlockPlanner(instance, time_limit=15).solve()
    result = replan_after(instance, original, Disruption(96, "S1", 8), time_limit=15)
    assert isinstance(result.train_hours_delta, float)
    assert "train-hours" in result.summary()
