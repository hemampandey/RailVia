"""Persistence boundary for planning decisions.

What actually needs storing is small: which proposed closures a planner has
approved, and which jobs have been reported done. Everything else in this
system is reproducible — instances rebuild byte-identically from a seed, and
the timetable is a set of cached files.

But approvals are exactly the thing that must NOT live in a browser. An
approval a colleague cannot see, with no record of who made it or when, is
the one part of this a railway would object to. So it gets a real store with
a real audit trail.

Supabase (hosted Postgres) is the only implementation, deliberately. A local
fallback would let two planners approve different things and never find out,
which is worse than being told the store is unreachable. When Supabase is
down, approving stops and says so; planning is unaffected, because the
planner is a pure function of its inputs and needs no store.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, timezone

from pydantic import BaseModel, Field


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Approval(BaseModel):
    """One planner accepting one proposed closure."""

    instance_id: str
    section_id: str
    start_iso: str
    decided_by: str = "demo-planner"
    decided_at: str = Field(default_factory=_now)
    note: str = ""

    @property
    def key(self) -> str:
        return f"{self.section_id}@{self.start_iso}"


class Completion(BaseModel):
    """One maintenance job reported done."""

    instance_id: str
    task_id: str
    completed_at: str = Field(default_factory=_now)
    completed_by: str = "demo-planner"
    note: str = ""


class Store(ABC):
    """Where planning decisions are recorded."""

    #: Shown in the UI so nobody has to guess where their approval went.
    backend: str = "unknown"
    shared: bool = False

    @abstractmethod
    def approve(self, approval: Approval) -> Approval: ...

    @abstractmethod
    def unapprove(self, instance_id: str, section_id: str, start_iso: str) -> None: ...

    @abstractmethod
    def approvals(self, instance_id: str) -> list[Approval]: ...

    @abstractmethod
    def complete(self, completion: Completion) -> Completion: ...

    @abstractmethod
    def uncomplete(self, instance_id: str, task_id: str) -> None: ...

    @abstractmethod
    def completions(self, instance_id: str) -> list[Completion]: ...

    def describe(self) -> str:
        scope = "shared" if self.shared else "this machine only"
        return f"{self.backend} ({scope})"
