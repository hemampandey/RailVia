#!/usr/bin/env bash
# Run both halves of the app.
#
# The optimiser is Python (OR-Tools, LightGBM) and the UI is Next.js, so two
# processes are unavoidable. Forgetting the Python one shows up in the browser
# as an opaque "Failed to fetch", which is why this script exists.
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -x .venv/bin/uvicorn ]]; then
  echo "No .venv — run:  python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2
  exit 1
fi
if [[ ! -d web/node_modules ]]; then
  echo "Web deps missing — run:  npm --prefix web install" >&2
  exit 1
fi

cleanup() { echo; echo "stopping…"; kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "API  → http://localhost:8077"
.venv/bin/uvicorn src.api.app:app --port 8077 --host 127.0.0.1 &

echo "App  → http://localhost:3000"
npm --prefix web run dev &

wait
