"""FastAPI backend — a pure JSON API.

The front end is a separate Next.js app in `web/`, which calls this service
directly (see the CORS note below). There is no server-rendered UI here.

Solving is expensive (up to 60 seconds), so results are computed once per
distinct request and cached in-process. A demo must not re-solve on every
click, and the front end polls nothing.
"""

from __future__ import annotations

import functools

from fastapi import Body, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.adapters import GroundedTimetableSource, SyntheticDataSource
from src.baseline.compare import run_comparison
from src.ml.criticality import CriticalityModel
from src.models import PlanningInstance
from src.optimiser.model import BlockPlanner
from src.optimiser.windows import TimeGrid
from src.store import (
    Approval, AuthError, Caller, Completion, bearer, get_store, store_for,
    store_status, verify,
)

app = FastAPI(
    title="Automatic Block Planning (SIH26027)",
    description=(
        "Coordinated maintenance block scheduling. Traffic data is real "
        "(published Indian Railways timetable); maintenance tasks are synthetic."
    ),
    version="0.5.0",
)


# The Next.js front end calls this service directly rather than through the
# dev-server proxy: a solve can take 60 seconds and Next's rewrite proxy hangs
# the socket up long before that (ECONNRESET). Two origins plus CORS is the
# ordinary shape for a SPA over a separate API, and it removes the proxy as a
# failure point during a demo.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", "http://127.0.0.1:3000",
        "http://localhost:3001", "http://127.0.0.1:3001",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
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


def _separate_cost(block, planner, tasks_by_id) -> float:
    """What this block's work would cost as separate single-job closures.

    The saving from merging is the number a planner actually cares about, and
    it is not visible anywhere in the raw plan. Each job is priced on its own
    at the same start time, which is what the manual process would produce.
    """
    series = planner.traffic.get(block.section_id)
    if not series:
        return 0.0
    total = 0.0
    for task_id in block.task_ids:
        task = tasks_by_id[task_id]
        length = planner.grid.minutes_to_slots(task.duration_minutes)
        stop = min(block.start_slot + length, len(series))
        total += sum(series[s] for s in range(block.start_slot, stop)) * planner.grid.slot_hours
    return round(total, 2)


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


@functools.lru_cache(maxsize=4)
def _plan(grounded: bool, tasks: int, days: int, seed: int, time_limit: float,
          percentile: float):
    instance = _load(grounded, tasks, days, seed)
    _, _, scores = _criticality(grounded, tasks, days, seed)
    planner = BlockPlanner(
        instance, time_limit=time_limit, percentile=percentile, criticality=scores
    )
    return instance, planner, planner.solve(), scores


@app.get("/api/plan")
def plan(
    grounded: bool = True, tasks: int = 120, days: int = 30,
    seed: int = 42, time_limit: float = 30.0, percentile: float = 25.0,
) -> dict:
    instance, planner, solution, scores = _plan(
        grounded, tasks, days, seed, time_limit, percentile
    )
    tasks_by_id = {t.id: t for t in instance.tasks}

    blocks = []
    for block in solution.blocks:
        payload = _block_payload(block, planner.grid, tasks_by_id)
        alone = _separate_cost(block, planner, tasks_by_id)
        payload["separate_cost"] = alone
        payload["saving"] = round(max(0.0, alone - block.train_hours), 2)
        payload["overdue_count"] = sum(
            1 for t in block.task_ids if tasks_by_id[t].is_overdue
        )
        blocks.append(payload)

    # Why each job missed the plan. A planner needs the reason, not the fact.
    exceptions = []
    for task_id in solution.unscheduled_task_ids:
        task = tasks_by_id[task_id]
        if task_id in solution.impossible_task_ids:
            reason = "no quiet window long enough on this section"
            fix = "shorten the job, split it, or widen the permitted hours"
        elif task.crew_required > planner.crew_ceiling.get(task.department, 99):
            reason = f"needs {task.crew_required} crews; department never has that many"
            fix = "borrow crew or split the job"
        else:
            reason = "deferred — crew and quiet windows went to more critical work"
            fix = "extend the horizon, or raise this job's priority"
        exceptions.append({
            "id": task_id, "section": task.section_id,
            "activity": task.activity_type, "department": task.department.value,
            "severity": task.defect_severity.value, "overdue": task.is_overdue,
            "due": task.due_date.isoformat(),
            "criticality": round(scores.get(task_id, 0.0), 3),
            "reason": reason, "fix": fix,
        })
    exceptions.sort(key=lambda e: (-e["criticality"], e["due"]))

    return {
        "instance_id": instance.instance_id,
        "status": solution.status,
        "wall_time": round(solution.wall_time, 2),
        "train_hours_lost": solution.train_hours_lost,
        "blocks": blocks,
        "block_count": len(solution.blocks),
        "scheduled": solution.scheduled_count,
        "task_total": len(instance.tasks),
        "shared_blocks": solution.shared_blocks,
        "unscheduled": solution.unscheduled_task_ids,
        "exceptions": exceptions,
        "late_tasks": solution.late_task_count,
        "total_saving": round(sum(b["saving"] for b in blocks), 1),
        "horizon_start": instance.horizon_start.isoformat(),
        "horizon_days": instance.horizon_days,
        "sections": {s.id: s.name for s in instance.sections},
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


# ── decisions: approvals and completions ────────────────────────────────
#
# These are the only things this system persists. Everything else is
# reproducible from a seed and the cached timetable.


class ApprovalIn(BaseModel):
    instance_id: str
    section_id: str
    start_iso: str
    decided_by: str = "demo-planner"
    note: str = ""


class CompletionIn(BaseModel):
    instance_id: str
    task_id: str
    completed_by: str = "demo-planner"
    note: str = ""


def _caller(authorization: str | None) -> Caller:
    """Who is making this request. 401 if we cannot say."""
    try:
        return verify(bearer(authorization))
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


def _store_as(caller: Caller):
    """A store scoped to the caller, so Postgres RLS applies to them."""
    try:
        return store_for(caller)
    except Exception as exc:  # noqa: BLE001
        # 503, not 500: the request was fine, the store is not reachable.
        # Never silently record the decision somewhere else.
        raise HTTPException(
            status_code=503,
            detail=f"Decisions are stored in Supabase, which is not available. {exc}",
        ) from exc


def _forbidden(exc: Exception) -> HTTPException:
    """Translate an RLS refusal into something a person can act on.

    Postgres rejects the write; we do not re-check the role here, because two
    places deciding the same thing is two places to disagree.
    """
    text = str(exc)
    if "row-level security" in text or "42501" in text or "violates" in text:
        return HTTPException(
            status_code=403,
            detail="Only the divisional head can grant or withdraw a closure.",
        )
    return HTTPException(status_code=502, detail=f"Supabase rejected the write: {text}")


@app.get("/api/store")
def store_state() -> dict:
    return store_status()


@app.get("/api/me")
def me(authorization: str | None = Header(default=None)) -> dict:
    """Who is signed in, and what they are allowed to do."""
    caller = _caller(authorization)
    store = _store_as(caller)
    role = store.role() or "engineer"
    return {
        "user_id": caller.user_id,
        "email": caller.email,
        "role": role,
        "can_approve": role == "head",
        "can_complete": True,
    }


@app.get("/api/decisions")
def decisions(
    instance_id: str, authorization: str | None = Header(default=None)
) -> dict:
    store = _store_as(_caller(authorization))
    return {
        "approvals": [a.model_dump() for a in store.approvals(instance_id)],
        "completions": [c.model_dump() for c in store.completions(instance_id)],
    }


@app.post("/api/approvals")
def add_approval(
    body: ApprovalIn, authorization: str | None = Header(default=None)
) -> dict:
    caller = _caller(authorization)
    store = _store_as(caller)
    record = Approval(**{**body.model_dump(), "decided_by": caller.label})
    try:
        return store.approve(record).model_dump()
    except Exception as exc:  # noqa: BLE001
        raise _forbidden(exc) from exc


@app.delete("/api/approvals")
def remove_approval(
    instance_id: str, section_id: str, start_iso: str,
    authorization: str | None = Header(default=None),
) -> dict:
    store = _store_as(_caller(authorization))
    try:
        store.unapprove(instance_id, section_id, start_iso)
    except Exception as exc:  # noqa: BLE001
        raise _forbidden(exc) from exc
    return {"removed": True}


@app.post("/api/completions")
def add_completion(
    body: CompletionIn, authorization: str | None = Header(default=None)
) -> dict:
    caller = _caller(authorization)
    store = _store_as(caller)
    record = Completion(**{**body.model_dump(), "completed_by": caller.label})
    try:
        return store.complete(record).model_dump()
    except Exception as exc:  # noqa: BLE001
        raise _forbidden(exc) from exc


@app.delete("/api/completions")
def remove_completion(
    instance_id: str, task_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    store = _store_as(_caller(authorization))
    try:
        store.uncomplete(instance_id, task_id)
    except Exception as exc:  # noqa: BLE001
        raise _forbidden(exc) from exc
    return {"removed": True}


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
