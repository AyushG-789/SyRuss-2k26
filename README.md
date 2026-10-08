# SyRuss-2k26 · RouteSaathi

Crowd-verified multimodal journey planner for Mumbai — Syrus 7.0, PS5 (Smart Mobility).
Navigation apps tell you the schedule; locals tell you the truth. We listen to locals,
fact-check them ("Pakka Check"), and explain every decision.

**Read [SPEC.md](SPEC.md) first.** It is the single source of truth for schemas, formulas,
endpoints and the demo story. Paste it into every AI coding session.

## Repo layout

```
SPEC.md              the spec (schemas, formulas, API, demo story, team split)
data/                seed data (network, POIs, travellers, 30 reports, mocks, scenario)
  network/           stations.yaml · lines.yaml · fares.yaml
  scenarios/demo.json  timeline replayed by the simulated clock + ground truth
scripts/             validate_data.py · build_gtfs.py · fetch_osm.py
backend/             FastAPI app (Python 3.11/3.12)
frontend/            Next.js + Tailwind + Leaflet
```

## Setup

### Backend (Python 3.11 or 3.12 — not 3.14, ML libraries don't support it yet)
```bash
cp .env.example .env            # then fill in API keys
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest                          # smoke tests
uvicorn app.main:app --reload --port 8000
```
Open http://localhost:8000/health and http://localhost:8000/docs.

### Frontend
```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```
Open http://localhost:3000. Until the backend endpoints exist, build screens against
`frontend/mocks/*.json` (same shapes as SPEC.md §3).

### Data scripts (run from repo root with the backend venv active)
```bash
python scripts/validate_data.py   # checks every id across data/ — run before committing data changes
python scripts/build_gtfs.py      # writes data/gtfs/ (git-ignored) for GTFS tools / validators
python scripts/fetch_osm.py       # re-fetches OSM stations/POIs and reports coordinate mismatches
```

## Data status — what still needs checking

Everything marked `verify: true` is an approximation and must be checked against official
sources before the demo. Do not invent numbers; if unsure, say so on the transparency page.

| File | Status | Owner |
|---|---|---|
| `network/stations.yaml` | Rail + metro coords from OSM (real). Bus stops approximate. `step_free` for local stations needs checking | P1 |
| `network/lines.yaml` | Station order real; run times + headways approximate; **BEST routes are placeholders** (`BEST_TODO_*`) — replace with real route numbers/stops | P1 |
| `network/fares.yaml` | All fares approximate — check each source | P3 |
| `pois.json` | Coords approximate; hours/closed days must be checked on official sites | P4 |
| `reports_seed.json`, `news_mock.json`, `official_mock.json` | Synthetic by design (labelled "mock"); add a few real past official notices as extra examples | P2 / P3 |
| `travellers.json`, `scenarios/demo.json` | Ready; adjust as the demo story evolves | P2 / P4 |

## Team workflow

| Person | Area | Branch |
|---|---|---|
| P1 | Network data, routing, baseline, day planner | `p1-routing` |
| P2 | Verification engine (Pakka Check), replan monitor | `p2-verify` |
| P3 | LLM parsing / explanations / number check, voice, feeds | `p3-llm-voice` |
| P4 | Frontend, simulated clock UI, eval + transparency pages | `p4-frontend` |

- Branch from `main`, open a PR, merge when tests pass. `main` must always run.
- Build module by module with tests; commit after every working step; roll back instead of looping on fixes.
- The LLM never produces numbers. Keys live in `.env` only.

**First milestone:** `POST /plan` for TR3 (Thane → Wankhede) returns 3 scored cards with no LLM involved.
