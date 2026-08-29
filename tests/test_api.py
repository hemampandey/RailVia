"""API smoke tests.

Kept small and fast: these check the contract the front end depends on, not
schedule quality, which the optimiser tests cover.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from src.api.app import app

client = TestClient(app)
SMALL = {"grounded": "false", "tasks": "8", "days": "3", "seed": "1"}


def test_health():
    assert client.get("/api/health").json() == {"status": "ok"}


def test_instance_reports_per_component_provenance():
    body = client.get("/api/instance", params=SMALL).json()
    assert set(body["sources"]) == {"sections", "tasks", "traffic", "crew_capacity"}
    assert body["is_synthetic"] is True
    assert body["sections"]
    assert len(body["sections"][0]["profile"]) == 24


def test_plan_returns_blocks_with_task_detail():
    body = client.get("/api/plan", params={**SMALL, "time_limit": "5"}).json()
    assert body["status"] in ("OPTIMAL", "FEASIBLE")
    for block in body["blocks"]:
        assert block["tasks"]
        assert block["end"] > block["start"]
        assert set(block["tasks"][0]) >= {"id", "activity", "department", "severity"}
        # The saving from merging is what a planner actually acts on.
        assert block["saving"] >= 0
        assert block["separate_cost"] >= block["train_hours"] - 1e-6


def test_every_unscheduled_job_carries_a_reason_and_a_fix():
    """A planner needs to know why a job missed the plan, not just that it did."""
    body = client.get("/api/plan", params={**SMALL, "time_limit": "5"}).json()
    assert len(body["exceptions"]) == len(body["unscheduled"])
    for exc in body["exceptions"]:
        assert exc["reason"] and exc["fix"]
        assert exc["id"] in body["unscheduled"]


def test_shared_blocks_report_a_real_saving():
    body = client.get(
        "/api/plan",
        params={**SMALL, "tasks": "40", "days": "7", "time_limit": "8"},
    ).json()
    for block in body["blocks"]:
        if len(block["tasks"]) > 1:
            assert block["separate_cost"] >= block["train_hours"]


def test_criticality_exposes_importances_and_ranking():
    body = client.get("/api/criticality", params=SMALL).json()
    assert body["importances"]
    assert 0.0 < body["auc"] < 1.0
    assert body["top_tasks"]
    scores = [t["score"] for t in body["top_tasks"]]
    assert scores == sorted(scores, reverse=True)


def test_single_task_explanation():
    ranked = client.get("/api/criticality", params=SMALL).json()["top_tasks"]
    task_id = ranked[0]["id"]
    body = client.get(f"/api/criticality/{task_id}", params=SMALL).json()
    assert body["task_id"] == task_id
    assert body["contributions"]


def test_unknown_task_is_404():
    assert client.get("/api/criticality/NOPE", params=SMALL).status_code == 404


def test_comparison_contract():
    body = client.get("/api/comparison", params={**SMALL, "time_limit": "5"}).json()
    metrics = {row["metric"] for row in body["rows"]}
    assert "Train-hours lost" in metrics
    assert "Blocks shared across departments" in metrics
    assert "horizon_start" in body  # the baseline Gantt needs it to render
    assert isinstance(body["headline_reduction_pct"], float)


def test_service_is_a_pure_api():
    """The UI is a separate Next.js app; this service serves JSON only."""
    assert client.get("/").status_code == 404
    assert client.get("/api/health").json() == {"status": "ok"}


def test_cors_allows_the_next_dev_origin():
    """The browser calls this service directly — Next's dev proxy drops the
    socket on a 60-second solve."""
    res = client.get("/api/health", headers={"Origin": "http://localhost:3000"})
    assert res.headers.get("access-control-allow-origin") == "http://localhost:3000"


# --- decisions: approvals and completions ----------------------------------


def test_store_status_is_reported_honestly():
    """The UI must be able to say plainly whether decisions can be recorded."""
    body = client.get("/api/store").json()
    assert body["backend"] == "Supabase"
    assert isinstance(body["connected"], bool)
    assert body["detail"]


def test_decisions_require_a_signed_in_caller():
    """Every decision endpoint refuses an anonymous request.

    401 rather than 503: the store may be perfectly healthy — we simply do
    not know who is asking, and a decision has to be attributable.
    """
    payload = {"instance_id": "x", "section_id": "A-B", "start_iso": "2026-03-02T00:00:00"}
    assert client.post("/api/approvals", json=payload).status_code == 401
    assert client.post(
        "/api/completions", json={"instance_id": "x", "task_id": "T1"}
    ).status_code == 401
    assert client.get("/api/decisions", params={"instance_id": "x"}).status_code == 401
    assert client.get("/api/me").status_code == 401
    assert client.delete(
        "/api/approvals",
        params={"instance_id": "x", "section_id": "A", "start_iso": "t"},
    ).status_code == 401


def test_a_forged_token_is_rejected():
    """A token we cannot verify is no better than no token."""
    res = client.get("/api/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert res.status_code == 401


def test_planning_stays_open():
    """The plan is derived from a public timetable and simulated jobs, so it
    is not access-controlled here. Decisions are."""
    body = client.get("/api/plan", params={**SMALL, "time_limit": "5"})
    assert body.status_code == 200


def test_plan_exposes_instance_id_for_keying_decisions():
    body = client.get("/api/plan", params={**SMALL, "time_limit": "5"}).json()
    assert body["instance_id"]
