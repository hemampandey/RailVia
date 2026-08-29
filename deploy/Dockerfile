# The planning API.
#
# A container, not a serverless function. The dependencies alone are ~460 MB
# (OR-Tools 139, SciPy 193, NumPy 64, scikit-learn 45) against Vercel's 250 MB
# limit, and a solve takes ten seconds against a ten-second Hobby timeout.
# This workload is CPU-bound and long-running, which is the opposite of what
# serverless is for.
#
# Runs as-is on Render, Railway, Fly.io, or any VM.
FROM python:3.13-slim

WORKDIR /app

# Dependencies first, so application edits do not rebuild this layer.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ src/
# The RailRadar responses and derived sections. Committed deliberately, so
# the deployment reproduces the same numbers with no API key and no network.
COPY data/cache/railradar/ data/cache/railradar/
COPY data/grounded_sections.json data/

ENV PYTHONUNBUFFERED=1
EXPOSE 8077

# One worker: each holds its own solved-plan cache, and the solver already
# uses every core it is given. Extra workers would multiply memory and
# duplicate work rather than serve more traffic.
CMD ["sh", "-c", "uvicorn src.api.app:app --host 0.0.0.0 --port ${PORT:-8077} --workers 1"]
