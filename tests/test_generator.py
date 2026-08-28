"""The generator is a deliverable: it gets tested like one."""

from __future__ import annotations

from datetime import timedelta

import pytest

from src.adapters import SyntheticDataSource
from src.models import Department


@pytest.fixture(scope="module")
def instance():
    return SyntheticDataSource().load()


def test_phase0_shape(instance):
    assert len(instance.sections) == 5
    assert len(instance.tasks) == 20
    assert instance.horizon_days == 7
    assert len(instance.traffic) == 5 * 7 * 24
    assert len(instance.crew_capacity) == 7 * len(Department)


def test_generator_is_deterministic():
    a = SyntheticDataSource(seed=7).load()
    b = SyntheticDataSource(seed=7).load()
    assert a.model_dump_json() == b.model_dump_json()


def test_different_seeds_differ():
    a = SyntheticDataSource(seed=7).load()
    b = SyntheticDataSource(seed=8).load()
    assert a.model_dump_json() != b.model_dump_json()


def test_referential_integrity(instance):
    instance.validate_referential_integrity()  # raises on failure


def test_instance_declares_itself_synthetic(instance):
    # Non-negotiable: PROJECT_BRIEF.md section 3.
    assert instance.is_synthetic is True
    assert "SYNTHETIC" in instance.provenance


def test_is_overdue_matches_due_date(instance):
    for t in instance.tasks:
        assert t.is_overdue == (t.due_date < instance.horizon_start)


def test_due_date_follows_from_interval(instance):
    for t in instance.tasks:
        assert t.due_date == t.last_done_date + timedelta(days=t.interval_days)


def test_traffic_covers_every_section_day_hour(instance):
    seen = {(w.section_id, w.day, w.hour_of_day) for w in instance.traffic}
    assert len(seen) == len(instance.traffic)  # no duplicates
    for s in instance.sections:
        for offset in range(instance.horizon_days):
            day = instance.horizon_start + timedelta(days=offset)
            for hour in range(24):
                assert (s.id, day, hour) in seen


def test_night_is_cheaper_than_morning_peak(instance):
    """The core premise: blocking at 03:00 costs less than at 09:00.

    If this ever fails the optimiser has nothing interesting to discover.
    """
    night = [w.trains_per_hour for w in instance.traffic if w.hour_of_day == 3]
    peak = [w.trains_per_hour for w in instance.traffic if w.hour_of_day == 9]
    assert sum(night) < sum(peak)


def test_all_three_departments_present(instance):
    assert {t.department for t in instance.tasks} == set(Department)


def test_task_durations_are_quarter_hour_multiples(instance):
    for t in instance.tasks:
        assert t.duration_minutes % 15 == 0


def test_crew_capacity_covers_every_department_and_day(instance):
    seen = {(c.department, c.date) for c in instance.crew_capacity}
    assert len(seen) == len(instance.crew_capacity)
    for offset in range(instance.horizon_days):
        day = instance.horizon_start + timedelta(days=offset)
        for dept in Department:
            assert (dept, day) in seen


@pytest.mark.parametrize("seed", [1, 2, 3, 42, 99])
def test_scales_without_error(seed):
    inst = SyntheticDataSource(seed=seed, n_tasks=60, horizon_days=30).load()
    inst.validate_referential_integrity()
    assert len(inst.tasks) == 60
