# SPEC.md — TravelBuddy (Syrus 7.0 · PS5)

> **Paste this file into every AI coding session.** It is the single source of truth for names,
> schemas, formulas and endpoints. If code and SPEC disagree, fix one of them in the same PR.

Crowd-verified multimodal journey planner for Mumbai. Navigation apps tell you the schedule;
locals tell you the truth. We listen to locals, fact-check them ("Pakka Check"), and explain
every decision.

---

## 0. Ground rules (apply to every module)

1. **The LLM never produces numbers.** Times, fares, distances, confidence, scores and
   reliability come from Python. The LLM only (a) extracts structure from text, (b) picks tools,
   (c) writes reason sentences from a facts JSON.
2. **Every LLM output is validated** (Pydantic schema + database lookup). Invalid → retry once →
   fall back to a template / discard.
3. **IDs, not names.** Every stop, line, transfer, POI, traveller, report and event is referenced
   by the IDs defined in `data/`. Never invent IDs.
4. **Time comes from the simulated clock** (`app/clock.py`), never `datetime.now()` directly.
   Times in data files are local Mumbai time `HH:MM` on the demo date (`DEMO_DATE` in `.env`).
5. **Mock-first.** News and official alerts default to `data/*_mock.json`; live feeds are behind
   a toggle. All LLM and voice responses for demo inputs are cached on disk.
6. **Every module ships with pytest tests.** Commit after each working step.

---

## 1. Scope

| Item | Prototype scope |
|---|---|
| City | Mumbai, ~25 destinations (`data/pois.json`) |
| Modes | `local` (suburban rail), `metro`, `bus` (BEST), `walk`, `auto`, `taxi`, `cab` |
| Required by PS | 3 modes (metro, bus, last-mile) · 30 crowd reports · 5 traveller itineraries |
| Lines | WR slow/fast, CR slow/fast, Harbour, Metro 1, Metro 3, 6–10 BEST routes |
| Not in scope | Full city, live ride-hail APIs, real-time vehicle positions, user accounts/auth |

---

## 2. Data files (`data/`)

| File | Contents | Owner |
|---|---|---|
| `network/stations.yaml` | Every stop: id, name, mode, lat, lon, step_free, lifts | P1 |
| `network/lines.yaml` | Lines: ordered stops, run minutes, headways, transfers | P1 |
| `network/fares.yaml` | Fare slabs per mode + last-mile formulas | P3 |
| `pois.json` | Destinations: coords, hours, closed days, visit minutes, nearest stops | P4 |
| `travellers.json` | 5 demo profiles | P4 |
| `reports_seed.json` | 30 crowd reports, each with an `expected` block (ground truth) | P2 |
| `news_mock.json` | News items (same shape as live RSS output) | P3 |
| `official_mock.json` | Official alerts / "running normally" notices | P3 |
| `reporters.json` | Reporter accounts: age, reputation | P2 |
| `scenarios/demo.json` | Timeline replayed by the clock + ground truth for evaluation | P2 |
| `gtfs/` | **Generated** by `scripts/build_gtfs.py` — do not edit by hand | — |

`python scripts/validate_data.py` checks that every ID referenced anywhere exists. Run it in CI
and before every commit that touches `data/`.

### ID conventions
- Stops: `snake_case` station name + mode suffix where a station complex has separate parts:
  `dadar_wr`, `dadar_cr`, `dadar_m3`, `andheri_wr`, `andheri_m1`, `csmt`, `csmt_m3`.
- Lines: `WR_SLOW`, `WR_FAST`, `CR_SLOW`, `CR_FAST`, `HARBOUR`, `METRO1`, `METRO3`, `BEST_<no>`.
- Transfers: `T_<from>__<to>` e.g. `T_dadar_cr__dadar_wr`.
- POIs `poi_<name>`, travellers `TR1..TR5`, reports `R01..R30`, news `N01..`, official `O01..`,
  reporters `u01..`, events `E_<SHORT_NAME>` (ground truth) / `ev_<uuid>` (runtime).

---

## 3. Core schemas (Pydantic, `backend/app/schemas.py`)

```python
Mode = Literal["local", "metro", "bus", "walk", "auto", "taxi", "cab", "ferry"]
DisruptionType = Literal[
    "delay", "closure", "lift_out", "diversion", "crowding",
    "waterlogging", "mega_block", "running_normally", "not_a_disruption"]
Severity = Literal["low", "medium", "high"]
SourceType = Literal["crowd", "news", "official", "weather"]
EventStatus = Literal["confirmed", "possible", "ignored", "expired", "coordinated"]
Lang = Literal["en", "hi", "mr", "hi-en", "mr-en"]

class Affected(BaseModel):
    line_ids: list[str] = []
    stop_ids: list[str] = []
    transfer_ids: list[str] = []          # e.g. a closed foot-overbridge at Dadar

class RawReport(BaseModel):              # what the app / seed file submits
    report_id: str
    reporter_id: str
    text: str
    lat: float | None = None
    lon: float | None = None
    reported_at: str                      # "HH:MM" demo-day local time
    lang: Lang | None = None

class StructuredReport(BaseModel):       # LLM extraction output (validated)
    report_id: str
    is_disruption: bool
    affected: Affected
    type: DisruptionType
    severity: Severity
    started_at: str | None                # "HH:MM", None = reported_at
    evidence_span: str                    # exact substring of the raw text
    source_type: SourceType = "crowd"

class Evidence(BaseModel):
    source_type: SourceType
    ref_id: str                           # report_id / news id / official id
    reporter_id: str | None
    weight: float                         # effective weight after anti-gaming
    at: str

class Event(BaseModel):                  # merged disruption
    event_id: str
    type: DisruptionType
    severity: Severity
    affected: Affected
    first_seen: str
    last_seen: str
    confidence: float                     # 0..1, from score.py only
    status: EventStatus
    expires_at: str
    evidence: list[Evidence]
    flags: list[str] = []                 # "coordinated_burst", "contradicted", ...
    expected_delay_min: int = 0           # for type=delay

class Leg(BaseModel):
    mode: Mode
    line_id: str | None
    from_id: str; to_id: str              # stop or "origin"/"destination"/poi id
    depart: str; arrive: str
    duration_min: int
    cost_inr: int
    walk_m: int = 0
    step_free: bool
    event_ids: list[str] = []             # events touching this leg
    risk: float = 0.0                     # 0..1

class RouteCard(BaseModel):
    plan_id: str
    label: Literal["fastest", "optimal", "cheapest"]
    recommended: bool
    legs: list[Leg]
    duration_min: int
    cost_inr: int
    transfers: int                        # vehicle changes only; final walk is not a transfer
    walk_min: int
    reliability: float                    # 0..1 = Π(1 - leg.risk)
    reliability_colour: Literal["green", "yellow", "red"]
    score: float                          # 0..10, from scorer.py
    reason: str                           # LLM-written, number-checked
    facts: dict                           # the exact JSON the reason was written from

class Traveller(BaseModel):
    traveller_id: str
    name: str
    origin: Place; destination: Place | None
    leave_at: str | None; arrive_by: str | None
    hard_deadline: bool = False
    max_budget_inr: int | None
    max_walk_min: int | None
    max_transfers: int | None
    priority: Literal["fastest", "cheapest", "fewest_transfers", "most_reliable", "balanced"]
    modes_allowed: list[Mode]
    step_free: bool = False               # HARD constraint
    heavy_luggage: bool = False           # soft
    avoid_crowds: bool = False            # soft
    language: Literal["en", "hi", "mr"] = "en"
    itinerary: Itinerary | None = None

class Place(BaseModel):
    label: str
    lat: float; lon: float
    poi_id: str | None = None

class Itinerary(BaseModel):
    day_start: str; day_end: str
    stops: list[ItineraryStop]            # max 5 for brute force

class ItineraryStop(BaseModel):
    poi_id: str
    visit_min: int | None = None          # default from pois.json
    must_visit: bool = True
    fixed_time: str | None = None
```

---

## 4. Verification Engine — "Pakka Check" (`backend/app/verify/`)

Pipeline: `extract → validate → merge → score → expire`. Runs on every new item and on every
clock tick (APScheduler job, 1 tick = 1 simulated minute).

### 4.1 Extract (`extract.py`)
- Input: `RawReport` + **candidate list** of up to 15 stops/lines (nearest by GPS + fuzzy name
  match with `rapidfuzz` against `stations.yaml` names and aliases).
- OpenAI structured output into `StructuredReport`. The model may only choose IDs from the
  candidate list.
- News and official items go through the same extractor with `source_type` set.

### 4.2 Validate (`validate.py`) — reject if any fails
1. Every `line_id` / `stop_id` / `transfer_id` exists.
2. Each `stop_id` is served by at least one `line_id` given (if both are given).
3. If GPS is present: nearest affected stop within 2 km of the GPS point.
4. `evidence_span` is a substring of the raw text (case-insensitive, whitespace-normalised).
5. `started_at` ≤ `reported_at`.
Rejected → `needs_review` log, shown on the transparency page.

### 4.3 Merge (`merge.py`)
A structured item joins an existing active event if **all** hold:
- overlapping `affected` (any shared line, stop or transfer),
- compatible type (same type, or `delay`↔`closure` on the same line), and
- `|reported_at - event.last_seen| ≤ 30 min`, and
- text embedding cosine ≥ 0.75 **or** identical affected stop + type.
`running_normally` items never create events; they attach as **contradicting** evidence.

### 4.4 Anti-gaming (`antigaming.py`) — applied before scoring
| Rule | Effect |
|---|---|
| One reporter, many reports on one event | Counts once (their highest weight) |
| New account (`account_age_days < 1`) or `reputation < 0.2` | Crowd weight **0.05** instead of 0.25 |
| **Coordinated burst**: ≥3 reports from new accounts on one event within 10 min with text similarity ≥ 0.85 | Whole burst collapses into **one** source of weight 0.05; event flagged `coordinated_burst`; status `coordinated` if nothing else supports it |
| Reputation | Crowd weight = `0.25 × (0.5 + reputation)`, capped at 0.35. Reputation ∈ [0,1], default 0.5 |
| Reputation update | Event confirmed → reporters +0.1; event contradicted → −0.2 |

### 4.5 Score (`score.py`)
Base weights: **official 0.8 · traffic API 0.7 · news 0.6 · crowd 0.25** (after anti-gaming) ·
**weather prior 0.2** (only for `waterlogging` when Open-Meteo rain ≥ 7.5 mm/h or a mock
orange/red alert is active).

```
support      = 1 − Π(1 − w_i)                    over independent, non-contradicting evidence
decay        = exp(−max(0, age_min − 15) / τ_type)   age = now − last_seen; no fading for 15 min
contradiction= max weight of contradicting evidence from a source with HIGHER trust
               than the strongest supporting source (official > traffic > news > crowd)
confidence   = clamp(support × decay − contradiction, 0, 1)
```
`τ_type` (minutes): delay 60 · closure 240 · lift_out 1440 · diversion 120 · crowding 30 ·
waterlogging 120 · mega_block = until announced end.
The 15-minute grace period stops a just-confirmed event from slipping back to "possible" while
nothing has changed. Only evidence with `at ≤ now` is used, so the demo clock can be replayed.
All weights, τ, lifetimes and thresholds live in `backend/app/verify/policy.py`.

### 4.6 Thresholds and effect on routing
| Confidence | Status | Routing effect |
|---|---|---|
| ≥ 0.70 | `confirmed` | closure → remove edge/stop/transfer; delay → add `expected_delay_min`; lift_out → stop not step-free; **triggers replan monitor** |
| 0.40 – 0.69 | `possible` | route unchanged, leg risk = confidence × 0.5, warning shown. **Exception:** `lift_out` is treated as confirmed for `step_free` travellers |
| < 0.40 | `ignored` | logged on transparency page only |
| — | `coordinated` | ignored for routing, shown with a "suspicious burst" badge |

### 4.6a Routing contract (`verify/store.py`)
`active_events(now) -> list[Event]` returns the **confirmed + possible** events at `now`, each with
`affected` (lines / stops / transfers) and `expected_delay_min` (delay: low 5, medium 15, high 25;
waterlogging 10; crowding 5). Routing applies §4.6 to these; it never reads raw reports.

### 4.7 Expire (`expire.py`)
Event lifetime from `last_seen`: delay 45 min · closure 4 h · lift_out 24 h · diversion 2 h ·
crowding 30 min · waterlogging 2 h · mega_block until its announced end. New supporting evidence
extends it. Expired events stay visible (greyed) on the transparency page.

### 4.8 Sanity checks the seed data must satisfy (tests in `tests/test_verify_seed.py`)
- 3 real crowd (rep 0.5) + 1 news → `1 − 0.75³ × 0.4 = 0.83` → **confirmed**
- 5 fake reports from new accounts in a burst → collapsed to 0.05 → **coordinated / ignored**
- 1 crowd + rain prior → `1 − 0.75 × 0.8 = 0.40` → **possible**
- 1 official alone → 0.8 → **confirmed**
- Crowd "line fully shut" + official "running normally" → **ignored**, flagged `contradicted`
Every report in `reports_seed.json` has `expected.status`; `tests/test_verify_seed.py` scores each
event at `check_at` and compares. One official notice can contradict one event and support
another (`expected.also_supports`, e.g. O02 contradicts "WR fully shut" but confirms the Andheri
delay). See the verdicts with `python scripts/score_seed_reports.py [--at HH:MM | --timeline]`.

---

## 5. Routing (`backend/app/routing/`)

> OSRM is for road/walk legs only. Transit is routed on our own graph.

### 5.1 Graph (`graph.py`, networkx `DiGraph`)
- **Ride edges**: `(line_id, stop_a) → (line_id, stop_b)` for consecutive stops,
  weight = run minutes.
- **Boarding edges**: `stop → (line_id, stop)`, weight = headway/2 at the current time band
  (expected wait). **Alighting edges**: `(line_id, stop) → stop`, weight 0.
- **Transfer edges**: from `lines.yaml` `transfers` (walk minutes, `step_free`), plus implicit
  same-stop transfers (boarding edge already models the wait).
- **Access/egress**: origin/destination → stops within 1.2 km by walk (distance × 1.3 ÷ 4.5 km/h;
  ÷ 3 km/h if step_free or heavy_luggage), and by auto/taxi/cab within 8 km
  (distance × 1.4 ÷ 18 km/h + 5 min wait).
- Autos are **not allowed** if either end is south of Bandra/Sion (lat < 19.04) → taxi instead.

### 5.2 Candidates
Run k-shortest simple paths (k = 8) under 4 weightings (time, cost-heavy, transfer-heavy,
walk-heavy), dedupe by leg sequence. Each candidate is turned into `Leg`s with real clock times.

### 5.3 Hard filters (rejected options are kept with a `rejected_reason`)
over budget · arrives after `arrive_by` when `hard_deadline` · uses a non-step-free stop/transfer
when `step_free` · uses a mode not in `modes_allowed` · walk > `max_walk_min` ·
transfers > `max_transfers` · touches a **confirmed** closure.

### 5.4 Disruption-aware vs baseline
- `baseline.py`: same pipeline, events ignored ("schedule-only").
- `aware.py` (**built**): confirmed closures / mega blocks (and lift outages for step-free or heavy-luggage travellers) are removed from the graph **before** the search; confirmed delays raise the boarding cost of that line and are added to the hit leg (later legs shift); candidates still touching a confirmed closure are rejected with the reason; plan `notes` say what was avoided vs the schedule-only plan. Getting off and back on the same line is never a candidate. `leg.risk` = max over events touching the leg of
  `confidence × impact` (impact: closure 1.0, delay 0.6, lift_out 1.0 if step_free else 0.1,
  waterlogging 0.5 on walk/road legs, crowding 0.2).
- `reliability = Π(1 − leg.risk)` → colour: green ≥ 0.90, yellow 0.70–0.89, red < 0.70.

### 5.5 Scoring (`scorer.py`) — 0..10
Normalise each metric across surviving candidates to 0..1 (best = 1):
`t` time (expected time = duration + Σ risk × expected_delay), `c` cost, `x` transfers,
`w` walk, `r` reliability.

| Plan | Weights (t, c, x, w, r) |
|---|---|
| fastest | 0.60, 0.05, 0.10, 0.05, 0.20 |
| cheapest | 0.10, 0.60, 0.10, 0.05, 0.15 |
| optimal | 0.30, 0.20, 0.15, 0.10, 0.25 (shifted toward the traveller's `priority`, +0.15) |

`score = 10 × Σ weight × metric`, rounded to 1 decimal. Each label picks the best candidate under
its weights; if two labels pick the same route, the second takes its next best. **Recommended**
= the optimal card unless the traveller's priority says otherwise.

---

## 6. LLM layer (`backend/app/llm/`)

Provider: **Google Gemini** (REST `generateContent` + function calling, `backend/app/llm/gemini.py`).
`GEMINI_MODEL` (default `gemini-flash-lite-latest`, ~1–2 s) with `GEMINI_FALLBACK_MODEL`
(`gemini-flash-latest`) tried on 429/5xx. Key: `GEMINI_API_KEY` in `.env` (never committed).

### 6.0 Chatbot (`chat.py`, `POST /chat`)
- Body `{messages: [{role: user|assistant, text}], journey_id?}` → `{reply, source: gemini|template|fallback,
  model, tools_used, trip: {traveller, from, to, options[]} | null, problems[] | null, note}`.
- Gemini only understands the question and words the answer; facts come from the tools below.
  Replies in the traveller's language (en / hi / mr / Hinglish), ≤ 70 words.
- **Number check** (`check_numbers.py`): every number in the reply (incl. Devanagari digits) must
  appear in a tool result or the user's message → otherwise retry once → otherwise a plain
  template built from the tool results (`source: "template"`).
- **No key / quota / outage** → rule-based fallback for "A to B (by HH:MM)" and line/station
  status (`source: "fallback"`). Never crashes.
- Place names resolved by `app/places.py` (POIs + stations + aliases, same tiers as the web form).
- UI: floating "Ask TravelBuddy" panel on every page (`frontend/components/ChatAssistant.tsx`);
  trip answers show option cards (with live problems) + "Open full route details" → `/routes?t=`.

### 6.1 Request parsing (`parse_request.py`)
Natural language (any of en/hi/mr) → partial `Traveller` fields; the UI pre-fills the form for
the user to confirm. Place names resolved through `geocode.py` (POIs → stations → Nominatim, cached).

### 6.2 Agent tools (function calling)
```
plan_trip(origin, destination, leave_at?, arrive_by?, budget, walk, changes, priority, modes, …)
                                     -> options[] with live problems on each route   (built)
get_live_problems(line?, station?)   -> confirmed/possible + untrusted (fake burst) events  (built)
explain_problem(event_id)            -> evidence, weights, thresholds                (built)
get_my_journey(journey_id?)          -> saved trip + replan proposal (B9)            (built)
plan_routes(traveller) -> RouteCard[] (numbers only, reason empty)
get_events(status?, line_id?, stop_id?) -> Event[]
get_fares(legs) -> int
check_opening_hours(poi_id, at) -> {open: bool, opens, closes}
search_news(query, since) -> NewsItem[]
plan_itinerary(traveller) -> ItineraryPlan
```

### 6.3 Explanations (`explain.py`) + number check (`check_numbers.py`)
- Input: the card's `facts` JSON (numbers, compared alternatives, event ids, source counts).
- Output: one sentence ≤ 25 words, in the traveller's language, naming the specific source
  ("3 commuters + CR update, 82%").
- `check_numbers.py` extracts every number (incl. ₹, min, %, times) from the sentence and
  requires each to appear in `facts` (after unit normalisation). Fail → regenerate once → use
  template `"{label}: {duration} min, ₹{cost}, {transfers} transfers, reliability {rel}%."`.

---

## 7. Voice (`backend/app/voice/`)
- STT: Sarvam **Saaras** → `{text, language}`.
- TTS: Sarvam **Bulbul** with `target_language_code` ∈ `en-IN | hi-IN | mr-IN` on **every**
  call; returns base64 audio → frontend decodes and plays.
- Fallback: OpenAI TTS. Cache audio by `sha256(text+lang)` in `backend/.cache/tts/`.

---

## 8. Replanning (`backend/app/replan/monitor.py`, `impact.py`)
1. `POST /journeys` saves the card the traveller chose. On every check (each `/journeys` read,
   and once a second while a client is connected to `/ws/alerts`) the monitor looks at journeys
   that aren't `completed` and finds **confirmed** events that hit a leg not yet finished.
   `possible` events never trigger a replan.
   - Matching (`impact.py`): transfer events hit only that transfer walk (not trains passing
     through); line events hit rides on that line (with stops: only rides whose stretch includes
     one); stop-only events hit rides passing the stop and legs starting/ending there;
     `lift_out` only matters to step-free / heavy-luggage travellers.
   - closure / mega_block / (lift_out for step-free) = **blocked**; other types add
     `expected_delay_min`. Confirmed delays under 5 min are ignored.
2. Replan from the traveller's position: the start of the first unfinished leg — or, if they are
   already riding a train/bus, where that ride stops (they stay on it). Remaining budget =
   `max_budget_inr` − money already spent. Alternatives are checked against the same events
   (blocked dropped, delays added) until routing does this itself (A5).
3. Propose only if the old route is blocked, or an alternative arrives ≥ 3 min earlier.
   Otherwise the journey gets a `notice` ("delay on your route; it is still the best option" /
   "no working alternative found"). Events are asked about once.
4. Proposal: `{proposal_id, event_ids, affected_leg_idx, from_label, old_card (hit legs carry
   event_ids + risk), new_card (completed legs + new route), delta:{min, inr}, old_blocked, message}`.
   Pushed over WebSocket `/ws/alerts` as `{type:"replan_proposal", journey_id, proposal}`.
5. Plan changes **only** after `POST /journeys/{id}/replan/accept`. `reject` keeps the old plan.
   Both decisions are logged in `journey.log` for evaluation. `/admin/reset` clears journeys.

---

## 9. Day planner (`backend/app/itinerary/planner.py`)
- ≤ 5 stops: try every order (≤ 120). Travel time between stops from the router (aware or
  baseline). Check each arrival against opening hours and closed days; must-visit stops that
  can't fit → infeasible; optional stops may be dropped (penalty).
- Objective: total travel time + 0.2 × cost(₹) − 10 × (optional stops kept); tie-break on slack.
- Output: timeline `[arrive, visit_start, leave, leg_to_next]` with slack per stop; flag slack < 10 min.

---

## 10. API (`backend/app/api/`)

| Method | Path | Body → Response |
|---|---|---|
| GET | `/health` | → `{status:"ok", clock}` |
| POST | `/reports` | `{reporter_id, text, type, severity, affected, reported_at?}` → `{event_id, created_event, status, confidence}` (structured fields required until the LLM extractor exists; ids validated; unknown reporter = new account) |
| GET | `/events?status=&line_id=&stop_id=` | → `Event[]` scored at the demo clock, newest first; events not yet reported are hidden |
| GET | `/events/{id}` | → `{event, breakdown: {support, decay, contradiction, summary, evidence[]}}` |
| GET | `/verify/policy` | → all Pakka Check weights, thresholds, lifetimes |
| POST | `/chat` | `{messages, journey_id?}` → `{reply, source, tools_used, trip, problems, note}` (§6.0) |
| POST | `/parse-request` | `{text, language}` → `{traveller: partial Traveller, missing: [field]}` |
| POST | `/plan` | `{traveller, mode:"aware"|"baseline"}` → `{cards: RouteCard[3], rejected: [{legs, reason}]}` |
| POST | `/itinerary` | `{traveller}` (with `itinerary`) → `{feasible, stops[{arrive, visit_start, leave, slack_min, tight, leg{route, card}}], dropped[], total_travel_min, total_cost_inr, warnings[]}` |
| POST | `/journeys` | `{traveller, card}` → `Journey` (`journey_id`, status `upcoming\|active\|completed`, card, proposal, notice, log) |
| GET | `/journeys` | → all saved journeys |
| GET | `/journeys/{id}` | → journey + current card + pending proposal (polling fallback for the socket) |
| POST | `/journeys/{id}/replan/accept` · `/reject` | → updated journey (409 if nothing pending) |
| POST | `/voice/stt` | audio → `{text, language}` |
| POST | `/voice/tts` | `{text, language}` → `{audio_base64, mime}` |
| GET | `/eval?refresh=` | → §12 results: `schedule_only` vs `travelbuddy` totals, `classification`, `trips[]` (cached; computed on a fresh scripted copy of the scenario) |
| GET | `/transparency` | → sources, weights, thresholds, lifetimes, assumptions, event log |
| GET/POST | `/admin/clock` | `{set?: "HH:MM", advance_min?: int, speed?: float}` → `{now, speed, mode}` |
| POST | `/admin/reset` | `{mode?: "scripted"\|"manual"}` → reload seed, clock to scenario start, paused. **scripted**: seed items arrive at their scheduled times as the clock moves. **manual**: only pre-start history is loaded; the presenter injects the rest |
| POST | `/admin/inject` | `{ref_ids?: ["R04","N01"], preset?: "fake_burst"}` → copies of seed items arrive *now* on the demo clock, joining their seed event |
| GET | `/admin/presets` | → one-click inject buttons `[{id, label, refs, expect}]` |
| GET | `/admin/timeline` | → scenario items with state `history \| done \| upcoming \| not_injected \| other_day` |
| WS | `/ws/alerts` | server → client: `clock {now}`, `event_update {event_id, status, confidence}`, `replan_proposal {journey_id, proposal}`, `journey_notice {journey_id, notice}` |

Backend runs on `:8000`, frontend on `:3000`, CORS allows `http://localhost:3000`.
Frontend reads `NEXT_PUBLIC_API_URL`.

---

## 11. Frontend pages (`frontend/app/`)

Design system: `frontend/app/globals.css` (from the team's "Marg Transit" DESIGN.md — Plus Jakarta
Sans, emerald primary, amber alerts, white hairline cards, Material Symbols icons). App shell =
left sidebar + top bar (latest confirmed Pakka Check alert, live/sample feed status).

| Route | Content |
|---|---|
| `/` | Home & Transit Hub (team design): quick route finder → straight to results, quick trips, **live** Pakka Check stats (confirmed / reports checked / fakes rejected), 5 transport modes + network pulse per line from `/events` (transfer closures don't mark train lines), live problems map, **5 one-click demo travellers** (TR4 → Day Itinerary) |
| `/plan` | Journey Planner (team design), all live: places with suggestions, via, Depart now/at/Arrive by, modes, priority, step-free, **trip limits** (budget, max walk, max changes, hard deadline, heavy luggage, avoid crowds, language), live Pakka Check advisories (→ `/events/{id}`), **live preview** of the top routes (`POST /plan`, debounced), map with network + problems. `?from=&to=` prefill. Only saved-place shortcuts are sample |
| `/routes/[TR1..TR5]`, `/routes?t=<json>` | Route Results (team design `route_results_comparison`): **aware** plans (A5) with score, reliability, live problems per leg, fare breakdown, interchanges; mode filter + sort; map with active selection; trade-off matrix; **"What Pakka Check changed"** notes (e.g. *Avoided: Dadar FOB closure*); **Normal app vs TravelBuddy** for the same trip (`mode: baseline`); rejected options (deduped). Sample plans only if the backend is down |
| `/track` | Live Trip Tracking (team design) on **real data**: the trip from *Start trip* (saved via `POST /journeys`, id in localStorage for the chatbot), moved by the **demo clock** — phase (not started / on the way / arrived), time left, ETA (+ confirmed delays), fare paid so far, current leg + next stop, milestones per leg with Pakka Check problems (`journey.live_hits`), map with route + "you" marker. **Replan banner** with Switch / Keep (`/replan/accept|reject`). Report Issue → `POST /reports` at the next stop. No trip → empty state with a one-click demo trip (TR3 via the Dadar FOB). Share link + SOS are labelled samples |
| `/admin` | Demo control (presenter): demo clock + slider, scripted ↔ manual, inject presets, live disruptions, story timeline |
| `/report` | Report Incident — design-faithful copy of the team design (citizen incident console). **Real:** category → disruption type, description, linked station, corridor + direction → `POST /reports` with the verdict shown; live header counts; Nearby Active Feed from `/events` with "I see this too" (a crowd confirmation — same reporter counts once). **Sample:** voice memo/transcript, media (previewed locally, not uploaded), reputation card (`frontend/lib/mockReport.ts`) |
| `/stations` | Station Explorer & Nearby (team design): search, radius, mode chips, station cards, real map. Departures, gates and facilities are **labelled sample** (`frontend/lib/mockStations.ts`) |
| `/events/[id]` | Disruption detail: verdict + trust gauge, every evidence item (source, time, reporter, weight, note, burst coverage), the confidence maths (support × freshness, contradiction), thresholds, expiry, map. Linked from Report feed, Home, Planner, Tracking, Transparency |
| `/transparency` | Transparency (B10): sources + weights + live/mock mode, formula, thresholds, anti-gaming, lifetimes, routing rules, AI + number check, assumptions & limits, network counts, **live event log** (incl. ignored / fake bursts), replan decisions |
| `/compare` | Compare + evaluation (A10): headline numbers (late trips, minutes lost, fake-report reroutes, report accuracy), extra cost/walk, trip-by-trip table with real arrival vs plan |
| `/itinerary` | Day Itinerary (A9): start, day window, budget, up to 5 stops (must/optional, fixed time) → best order with arrive/visit/leave, slack, tight flags, each hop's live route on the map, dropped stops, warnings |
| `/dashboard` | Placeholder (removed from the menu) |


Only real data is shown — panels in the design with no data source (card balance, vehicle speed,
carbon, CCTV crowding, station gates) were intentionally left out.

Until the backend exists, the frontend uses `frontend/mocks/*.json` with exactly the shapes above.

---

## 12. Evaluation (`backend/app/eval/run_eval.py`)
Run all 5 travellers twice (baseline vs aware) against `scenarios/demo.json` ground truth:
a leg on a really-closed line/transfer → journey **failed** (or + 30 min if a fallback exists);
a leg on a really-delayed line → + true delay.

| Metric | Schedule-only | TravelBuddy |
|---|---|---|
| Late or failed journeys (of 5) | | |
| Average arrival delay (min) | | |
| False reroutes caused by fake reports | n/a | |
| Extra cost (₹) / extra walking (min) vs baseline plan | | |
| Report classification accuracy vs `expected.status` | n/a | |

**Results (12 trips = TR1, TR2, TR3, TR5 × fastest/optimal/cheapest; `python -m app.eval.run_eval`):** late 3 → **1**, average minutes lost to problems 9.2 → **4.6**, replans 3 with **0 caused by fake reports**, reports judged correctly **24 / 24**, cost +₹111 and walking −23 min in total. A closure only counts if you reach it after it started; TR2's optimal route crossed the Dadar FOB before Pakka Check could confirm it, so both lose 25 min there — shown honestly.

---

## 13. Demo story (simulated clock, demo date `DEMO_DATE`, scenario start 16:30)

| Clock | What judges see |
|---|---|
| 16:30 | Radar empty-ish; 3 stale morning reports already greyed out (expired) |
| 16:35 | TR3 (Thane → Wankhede, arrive by 18:30, ₹150) plans: Fastest = CR to Dadar → WR to Churchgate → walk. Saves journey |
| 16:40 | **Fake burst**: 5 new accounts post "Metro 1 completely shut". Radar shows grey "suspicious burst" pin, confidence 5%. TR2 is **not** rerouted |
| 16:50 | Noise reports arrive → filtered as not_a_disruption |
| 17:05 | Real Metro 1 problem at Saki Naka: 3 established users (Hinglish/Marathi) → possible (58%) |
| 17:12 | News item N01 matches → **confirmed 83%** → TR2 gets replan proposal → Accept |
| 17:15 | Dadar FOB closure: 2 commuters + CR official → confirmed → TR3 replan proposal (fast local to CSMT → taxi), shows affected leg → Accept |
| 17:20 | "WR completely band" + WR official "running normally" → ignored, contradicted |
| 17:25 | 1 waterlogging report near Azad Maidan + rain alert → possible 40% → TR4 itinerary shows warning, keeps plan |
| 17:30 | Lift-out at BKC Metro 3 (2 reports) → possible, but TR1 (wheelchair) is routed around it |
| 18:00 | Andheri delay expires, pin greys out |
| end | `/eval` page: baseline vs TravelBuddy numbers |

---

## 14. Repo layout

```
SyRuss-2k26/
├── SPEC.md  README.md  .env.example  .gitignore
├── data/                 # §2 (seed + generated gtfs/)
├── scripts/              # fetch_osm.py · build_gtfs.py · validate_data.py
├── backend/
│   ├── requirements.txt  requirements-ml.txt
│   └── app/
│       ├── main.py config.py clock.py schemas.py db.py data_loader.py
│       ├── routing/  verify/  llm/  voice/  replan/  itinerary/  feeds/  eval/  api/
│       └── tests/
├── frontend/             # Next.js (App Router) + Tailwind + Leaflet
└── docs/                 # architecture diagram, assumptions.md, demo-script.md
```

## 15. Team & branches
| Person | Area | Branch |
|---|---|---|
| P1 | Data network, routing, baseline, day planner | `p1-routing` |
| P2 | Reports seed, verification engine, replan monitor | `p2-verify` |
| P3 | LLM parsing/agent/explanations, number check, voice, feeds | `p3-llm-voice` |
| P4 | Frontend, simulated clock UI, eval + transparency pages | `p4-frontend` |

Merge to `main` via PR; `main` must always run (`/health` OK, tests green).
