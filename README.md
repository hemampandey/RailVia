---
title: RailVia
emoji: 🚂
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
short_description: Coordinated maintenance block planning for Indian Railways
---

# RailVia — Automatic Block Planning (SIH26027)

> **Coordinated maintenance block scheduling for Indian Railways.**  
> Three departments (**ENGG**, **TRD**, **S&T**) currently request track-closure windows independently. **RailVia** synchronizes their requirements against live train timetables, merging maintenance activities into shared windows to minimize passenger/freight train delays.

---

## 🎯 The Core Problem & The Headline Result

### The Status Quo
- **Siloed Requests**: Track (ENGG), Electrical Catenary (TRD), and Signals (S&T) book track possessions in isolation via separate systems (TMS, TDMS, SMMS).
- **Traffic Disruption**: The same section of track is often closed 3 separate times in a month during peak passenger traffic, creating severe congestion and maintenance backlogs.

### RailVia's Impact (Measured on 39 Real Sections, 30-Day Horizon)

| Metric | Manual Process (Baseline) | RailVia (CP-SAT Coordinated) |
|---|---|---|
| **Train-Hours Lost** | High | **~16% Reduction** *(Range: 9.5% to 24.5%)* |
| **Shared Multi-Dept Blocks** | **0** (All isolated) | **21 to 37 Coordinated Blocks** |
| **Peak-Hour Disruptions** | **8** | **0 (Zero peak blocks granted)** |
| **Tasks Completed** | Baseline | **+54 additional tasks completed** |
| **Late Tasks** | 135 | **93 to 115** (~25% improvement) |

---

## 🏗️ Architecture Overview

```
                 [ Incoming Data Feeds ]
     TMS (Track) · TDMS (Power) · SMMS (Signals) · COA (Timetable)
                               │
                               ▼
                   [ 1. Railway Adapter Layer ]
              (IRPWM Domain Rules & Data Provenance)
                               │
                               ▼
                   [ 2. ML Criticality Ranking ]
              (LightGBM / Scikit-Learn Urgency Scoring)
                               │
                               ▼
               [ 3. Google OR-Tools CP-SAT Solver ]
           (Greedy Warm-Start + Hard Safety Constraints)
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
    [ 4. FastAPI Backend ]         [ Dynamic Re-planner ]
   (Cached REST Endpoints)       (Overruns & Fracture Handler)
                │
                ▼
    [ 5. Next.js Web Dashboard ]
   (24h Gantt · Calendar Matrix · Network Map · Postgres RLS)
```

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- Python 3.11+ (Python 3.13 recommended)
- Node.js 20+

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/hemampandey/RailVia.git
cd RailVia

# Setup Python virtual environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Setup Frontend dependencies
cd web && npm install && cd ..
```

### 3. Run the Full Application (One Command)
```bash
./run.sh
```
* Starts the **FastAPI Backend** on `http://localhost:8077`
* Starts the **Next.js Dashboard** on `http://localhost:3000`

### 4. Freeing / Killing Used Ports (Troubleshooting)
If port `8077` or `3000` is already in use by a background process, free them with:

```bash
# Kill both backend (8077) and frontend (3000) processes on macOS/Linux
lsof -ti :8077 -ti :3000 | xargs kill -9

# Or kill individually:
lsof -ti :8077 | xargs kill -9   # Kill FastAPI backend
lsof -ti :3000 | xargs kill -9   # Kill Next.js frontend

# Clear Next.js cache and restart cleanly:
./run.sh --clean
```

---

## 🧪 CLI & Solver Commands

### Run the Baseline Comparison (Headline Metric)
```bash
.venv/bin/python scripts/compare.py --grounded --tasks 300 --days 30
```

### Run the CP-SAT Optimizer
```bash
.venv/bin/python scripts/optimise.py --grounded --percentile 25
```

### Run the Test Suite (212 Automated Tests)
```bash
.venv/bin/pytest
```

### Run Scenario Re-planning Demo
```bash
.venv/bin/python scripts/demo.py --out demo_run.txt
```

---

## 🔒 Security & Role-Based Access Control (RBAC)

Role-based access is cryptographically enforced at the database level using **PostgreSQL Row-Level Security (RLS)**:

| Role | Permissions & Authority |
|---|---|
| **Divisional Head (DOM / DRM)** | Exclusive authority to sanction/grant closures (`/api/approvals`) and modify schedules. |
| **Section Engineer** | View schedules, acknowledge assigned tasks, and submit field work execution logs (`/api/completions`). |

### Supabase Setup (Optional for Persistent Approvals)
1. Run [`src/store/schema.sql`](src/store/schema.sql) in your Supabase SQL Editor.
2. Add your keys to `.env`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

---

## 🚢 Deployment (Render & Docker)

RailVia packages the UI and API into a **single unified container**:
- **Stage 1 (Node 22)**: Compiles Next.js into static production assets (`STATIC_EXPORT=1`).
- **Stage 2 (Python 3.13 + OpenMP)**: Runs FastAPI + CP-SAT, serving both the API and the web UI from a single port/origin.

### Deploying to Render:
1. Push this repository to GitHub.
2. On Render Dashboard: Click **New** → **Blueprint** → Select this repository.
3. Render automatically provisions the service via [`render.yaml`](render.yaml) using [`Dockerfile`](Dockerfile).

---

## 📁 Repository Layout

```
├── data/              # Committed RailRadar timetables & grounded section profiles
├── deploy/            # Deployment configuration and container templates
├── scripts/           # CLI entry points (optimise, compare, demo, generate)
├── src/
│   ├── adapters/      # Unified DataSource interface & subsystem adapter boundary
│   ├── api/           # FastAPI backend routes & deterministic plan caching
│   ├── baseline/      # Manual scheduling simulator for baseline benchmarking
│   ├── generator/     # IRPWM-grounded synthetic maintenance backlog generator
│   ├── ingest/        # RailRadar live train timetable feed parser
│   ├── ml/            # LightGBM task criticality ranking & explainability
│   ├── models/        # Pydantic core schemas (PlanningInstance, Block, Task)
│   ├── optimiser/     # CP-SAT constraint programming solver & dynamic re-planner
│   └── store/         # Supabase PostgreSQL connection & Row-Level Security policies
├── tests/             # 212 comprehensive pytest unit and regression test cases
├── web/               # Next.js 15 Web Dashboard (Gantt, Calendar, Map, Approvals)
├── Dockerfile         # Multi-stage container definition
├── render.yaml        # Render cloud blueprint specification
└── run.sh             # Local dev environment runner
```

---

## 📜 Assumptions & Grounding

* **Real Train Timetables**: Section geometry and hourly train counts are derived directly from published Indian Railways timetables via RailRadar API (`data/cache/railradar/`).
* **Maintenance Grounding**: Task durations and periodicities strictly follow Indian Railways Permanent Way Manual (**IRPWM**) guidelines.
* Full operational assumptions and mathematical formulation details are documented in [ASSUMPTIONS.md](ASSUMPTIONS.md).
