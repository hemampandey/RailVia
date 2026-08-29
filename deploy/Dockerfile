# RailVia — one image, one process.
#
# The UI is built to static files by Node at BUILD time, then served by
# FastAPI at RUN time. So the running container has no Node in it, one origin,
# no CORS and no proxy — and only one thing to deploy.
#
# It cannot be a Vercel-style serverless function: OR-Tools, SciPy, NumPy and
# scikit-learn come to ~460 MB against a 250 MB limit, and a solve takes ten
# seconds against a ten-second timeout. A container has neither constraint.

# ── build the UI ────────────────────────────────────────────────────────
FROM node:22-slim AS ui

WORKDIR /ui
COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
# Empty API origin: the UI is served from the same host as the API, so it
# calls /api directly rather than a hardcoded URL.
ENV STATIC_EXPORT=1
ENV NEXT_PUBLIC_API_ORIGIN=""
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build

# ── run the API, serving that UI ────────────────────────────────────────
FROM python:3.13-slim

WORKDIR /app

# Dependencies first: application edits should not rebuild this layer.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ src/
# The RailRadar responses and derived sections, committed deliberately so a
# deployment reproduces the same numbers with no API key and no network.
COPY data/cache/railradar/ data/cache/railradar/
COPY data/grounded_sections.json data/
COPY --from=ui /ui/out/ web/out/

ENV PYTHONUNBUFFERED=1
EXPOSE 8077

# One worker. Each holds its own solved-plan cache, and CP-SAT already uses
# every core it is given — more workers would multiply memory and duplicate
# solves rather than serve more traffic.
CMD ["sh", "-c", "uvicorn src.api.app:app --host 0.0.0.0 --port ${PORT:-8077} --workers 1"]
