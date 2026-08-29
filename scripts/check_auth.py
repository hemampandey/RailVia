"""Verify the two users and their roles once you have created them.

    .venv/bin/python scripts/check_auth.py

Checks, in order:
  * the API can reach Supabase
  * SUPABASE_JWT_SECRET is set, so sign-ins can be verified
  * both roles exist in `profiles`
  * exactly one head, which is the point of the split

It never asks for a password and never signs anyone in.
"""

from __future__ import annotations

import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from src.ingest.railradar import load_dotenv  # noqa: E402
from src.store.auth import JWT_SECRET_VAR  # noqa: E402

OK, BAD, WARN = "  OK  ", " FAIL ", " WARN "


def main() -> int:
    load_dotenv()
    problems = 0

    try:
        from src.store.supabase_store import SupabaseStore

        store = SupabaseStore()
        print(f"[{OK}] Supabase reachable")
    except Exception as exc:  # noqa: BLE001
        print(f"[{BAD}] Supabase unreachable: {exc}")
        return 1

    if os.environ.get(JWT_SECRET_VAR):
        print(f"[{OK}] {JWT_SECRET_VAR} is set — sign-ins can be verified")
    else:
        problems += 1
        print(f"[{BAD}] {JWT_SECRET_VAR} is NOT set")
        print("        Supabase → Project Settings → API → JWT Secret,")
        print("        then add it to .env and restart the API.")

    try:
        rows = (store.client.table("profiles")
                .select("id, role, full_name, department").execute().data) or []
    except Exception as exc:  # noqa: BLE001
        print(f"[{BAD}] cannot read profiles: {exc}")
        return 1

    if not rows:
        print(f"[{BAD}] no users yet")
        print("        Supabase → Authentication → Users → Add user (twice),")
        print("        then run the promote SQL at the bottom of "
              "src/store/schema.sql")
        return 1

    heads = [r for r in rows if r["role"] == "head"]
    engineers = [r for r in rows if r["role"] == "engineer"]
    print(f"[{OK}] {len(rows)} user(s) in profiles")
    for r in rows:
        name = r.get("full_name") or "(no name)"
        dept = f" · {r['department']}" if r.get("department") else ""
        print(f"        {r['role']:9} {name}{dept}")

    if not heads:
        problems += 1
        print(f"[{BAD}] nobody has the head role — nobody can grant a closure")
        print("        Run the promote SQL at the bottom of src/store/schema.sql")
    elif len(heads) > 1:
        print(f"[{WARN}] {len(heads)} heads. Not wrong, but the whole point of "
              "the split is that granting a closure is one person's call.")
    if not engineers:
        print(f"[{WARN}] no engineer account — you cannot demonstrate a refusal")

    print()
    if problems:
        print(f"{problems} thing(s) still to fix.")
        return 1
    print("Ready. Sign in at http://localhost:3000 as each user:")
    print("  head     — Approve and Mark done both work")
    print("  engineer — Mark done works; Approve is refused by Postgres, not "
          "just greyed out")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
