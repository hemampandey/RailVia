"""Supabase (hosted Postgres) store.

Configured with two environment variables, read from .env like the RailRadar
key:

    SUPABASE_URL=https://<project>.supabase.co
    SUPABASE_KEY=<anon or service key>

Run `src/store/schema.sql` in the Supabase SQL editor once to create the
tables.

Failure policy: if Supabase is unreachable at startup this raises, and the
factory in `__init__.py` falls back to SQLite rather than leaving the app
without anywhere to record a decision. Losing an approval silently would be
worse than recording it locally.
"""

from __future__ import annotations

import logging
import os

from src.store.base import Approval, Completion, Store

log = logging.getLogger(__name__)

URL_VAR = "SUPABASE_URL"
KEY_VAR = "SUPABASE_KEY"


class SupabaseNotConfigured(RuntimeError):
    pass


class SupabaseStore(Store):
    backend = "Supabase"
    shared = True

    def __init__(self, url: str | None = None, key: str | None = None) -> None:
        url = url or os.environ.get(URL_VAR)
        key = key or os.environ.get(KEY_VAR)
        if not url or not key:
            raise SupabaseNotConfigured(
                f"set {URL_VAR} and {KEY_VAR} in .env — see .env.example"
            )
        try:
            from supabase import create_client
        except ImportError as exc:  # pragma: no cover
            raise SupabaseNotConfigured("supabase package not installed") from exc

        self.client = create_client(url, key)
        # Fail here rather than on the planner's first approval.
        self.client.table("approvals").select("instance_id").limit(1).execute()
        log.info("Supabase store connected")

    def approve(self, approval: Approval) -> Approval:
        self.client.table("approvals").upsert(
            approval.model_dump(),
            on_conflict="instance_id,section_id,start_iso",
        ).execute()
        return approval

    def unapprove(self, instance_id: str, section_id: str, start_iso: str) -> None:
        (self.client.table("approvals").delete()
            .eq("instance_id", instance_id)
            .eq("section_id", section_id)
            .eq("start_iso", start_iso)
            .execute())

    def approvals(self, instance_id: str) -> list[Approval]:
        res = (self.client.table("approvals").select("*")
               .eq("instance_id", instance_id)
               .order("decided_at", desc=True).execute())
        return [Approval(**row) for row in (res.data or [])]

    def complete(self, completion: Completion) -> Completion:
        self.client.table("completions").upsert(
            completion.model_dump(), on_conflict="instance_id,task_id"
        ).execute()
        return completion

    def uncomplete(self, instance_id: str, task_id: str) -> None:
        (self.client.table("completions").delete()
            .eq("instance_id", instance_id).eq("task_id", task_id).execute())

    def completions(self, instance_id: str) -> list[Completion]:
        res = (self.client.table("completions").select("*")
               .eq("instance_id", instance_id)
               .order("completed_at", desc=True).execute())
        return [Completion(**row) for row in (res.data or [])]
