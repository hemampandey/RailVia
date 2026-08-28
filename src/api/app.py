"""FastAPI backend.

Solving is expensive (up to 60 seconds), so results are computed once per
distinct request and cached in-process. A demo must not re-solve on every
click, and the front end polls nothing.
"""

from __future__ import annotations

import functools
import pathlib

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src.adapters import GroundedTimetableSource, SyntheticDataSource
from src.baseline.compare import run_comparison
from src.ml.criticality import CriticalityModel
from src.models import PlanningInstance
from src.optimiser.model import BlockPlanner
from src.optimiser.windows import TimeGrid

STATIC_DIR = pathlib.Path(__file__).resolve().parent / "static"

app = FastAPI(
    title="Automatic Block Planning (SIH26027)",
    description=(
        "Coordinated maintenance block scheduling. Traffic data is real "
        "(published Indian Railways timetable); maintenance tasks are synthetic."
    ),
    version="0.5.0",
)


@functools.lru_cache(maxsize=8)
def _load(grounded: bool, tasks: int, days: int, seed: int) -> PlanningInstance:
    source = (
        GroundedTimetableSource(seed=seed, n_tasks=tasks, horizon_days=days)
        if grounded
        else SyntheticDataSource(seed=seed, n_tasks=tasks, horizon_days=days)
    )
    return source.load()


@functools.lru_cache(maxsize=4)
def _criticality(grounded: bool, tasks: int, days: int, seed: int):
    instance = _load(grounded, tasks, days, seed)
    model = CriticalityModel()
    report = model.train(instance.sections)
    return model, report, model.score_instance(instance)


@functools.lru_cache(maxsize=4)
def _comparison(grounded: bool, tasks: int, days: int, seed: int, time_limit: float):
    instance = _load(grounded, tasks, days, seed)
    _, _, scores = _criticality(grounded, tasks, days, seed)
    return run_comparison(instance, time_limit=time_limit, criticality=scores)


def _block_payload(block, grid: TimeGrid, tasks_by_id: dict) -> dict:
    return {
        "section_id": block.section_id,
        "start": grid.to_datetime(block.start_slot).isoformat(),
        "end": grid.to_datetime(block.end_slot).isoformat(),
        "hours": round((block.end_slot - block.start_slot) * grid.slot_minutes / 60, 2),
        "train_hours": block.train_hours,
        "departments": [d.value for d in block.departments],
        "shared": block.is_shared,
        "tasks": [
            {
                "id": tid,
                "activity": tasks_by_id[tid].activity_type,
                "department": tasks_by_id[tid].department.value,
                "severity": tasks_by_id[tid].defect_severity.value,
                "overdue": tasks_by_id[tid].is_overdue,
            }
            for tid in block.task_ids
        ],
    }


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/instance")
def instance_summary(
    grounded: bool = True, tasks: int = 120, days: int = 30, seed: int = 42
) -> dict:
    instance = _load(grounded, tasks, days, seed)
    return {
        "instance_id": instance.instance_id,
        "horizon_start": instance.horizon_start.isoformat(),
        "horizon_days": instance.horizon_days,
        "is_synthetic": instance.is_synthetic,
        "provenance": instance.provenance,
        "sources": {k: v.value for k, v in instance.sources.components.items()},
        "sections": [
            {
                "id": s.id, "name": s.name, "length_km": s.length_km,
                "daily_trains": s.daily_trains,
                "peak_trains_per_hour": s.peak_trains_per_hour,
                "profile": s.traffic_density_profile,
            }
            for s in instance.sections
        ],
        "task_count": len(instance.tasks),
        "overdue_count": sum(1 for t in instance.tasks if t.is_overdue),
    }


@app.get("/api/plan")
def plan(
    grounded: bool = True, tasks: int = 120, days: int = 30,
    seed: int = 42, time_limit: float = 30.0, percentile: float = 25.0,
) -> dict:
    instance = _load(grounded, tasks, days, seed)
    _, _, scores = _criticality(grounded, tasks, days, seed)
    planner = BlockPlanner(
        instance, time_limit=time_limit, percentile=percentile, criticality=scores
    )
    solution = planner.solve()
    tasks_by_id = {t.id: t for t in instance.tasks}
    return {
        "status": solution.status,
        "wall_time": round(solution.wall_time, 2),
        "train_hours_lost": solution.train_hours_lost,
        "blocks": [_block_payload(b, planner.grid, tasks_by_id) for b in solution.blocks],
        "block_count": len(solution.blocks),
        "scheduled": solution.scheduled_count,
        "shared_blocks": solution.shared_blocks,
        "unscheduled": solution.unscheduled_task_ids,
        "late_tasks": solution.late_task_count,
        "horizon_start": instance.horizon_start.isoformat(),
        "horizon_days": instance.horizon_days,
    }


@app.get("/api/comparison")
def comparison(
    grounded: bool = True, tasks: int = 120, days: int = 30,
    seed: int = 42, time_limit: float = 30.0,
) -> dict:
    result = _comparison(grounded, tasks, days, seed, time_limit)
    grid = TimeGrid(result.instance.horizon_start, result.instance.horizon_days, 15)
    tasks_by_id = {t.id: t for t in result.instance.tasks}
    return {
        "rows": [
            {"metric": m, "manual": a, "ours_same_work": b, "ours_full": c}
            for m, a, b, c in result.rows()
        ],
        "headline_reduction_pct": result.headline_reduction_pct,
        "block_reduction_pct": result.block_reduction_pct,
        "sections": len(result.instance.sections),
        "horizon_days": result.instance.horizon_days,
        "horizon_start": result.instance.horizon_start.isoformat(),
        "baseline_blocks": [
            _block_payload(b, grid, tasks_by_id) for b in result.baseline.blocks
        ],
        "extra_tasks_completed": (
            result.planned_full.scheduled_count - result.baseline.scheduled_count
        ),
    }


@app.get("/api/criticality")
def criticality(
    grounded: bool = True, tasks: int = 120, days: int = 30, seed: int = 42
) -> dict:
    model, report, scores = _criticality(grounded, tasks, days, seed)
    instance = _load(grounded, tasks, days, seed)
    tasks_by_id = {t.id: t for t in instance.tasks}
    ranked = sorted(scores.items(), key=lambda kv: -kv[1])
    return {
        "backend": model.backend,
        "auc": round(report.auc, 3),
        "log_loss": round(report.log_loss, 3),
        "records": report.n_records,
        "failure_rate": round(report.failure_rate, 4),
        "importances": [
            {"feature": name, "gain": float(value)} for name, value in report.importances
        ],
        "top_tasks": [
            {
                "id": tid, "score": round(score, 4),
                "activity": tasks_by_id[tid].activity_type,
                "department": tasks_by_id[tid].department.value,
                "section": tasks_by_id[tid].section_id,
                "severity": tasks_by_id[tid].defect_severity.value,
                "overdue": tasks_by_id[tid].is_overdue,
            }
            for tid, score in ranked[:25]
        ],
    }


@app.get("/api/criticality/{task_id}")
def explain_task(
    task_id: str, grounded: bool = True, tasks: int = 120,
    days: int = 30, seed: int = 42,
) -> dict:
    model, _, scores = _criticality(grounded, tasks, days, seed)
    instance = _load(grounded, tasks, days, seed)
    if task_id not in scores:
        raise HTTPException(status_code=404, detail=f"unknown task {task_id}")
    return {
        "task_id": task_id,
        "score": round(scores[task_id], 4),
        "contributions": [
            {"feature": name, "contribution": round(float(value), 4)}
            for name, value in model.explain(instance, task_id)
        ],
    }


if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")
