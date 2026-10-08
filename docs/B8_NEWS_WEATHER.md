# B8 — Real news + weather for Pakka Check

**Goal:** Pakka Check already uses *news* (weight 0.6) and a *rain prior* (0.2, waterlogging only)
— but only from the mock files `data/news_mock.json` and `data/official_mock.json`. B8 adds
**real Mumbai news (RSS)** and **real rain (Open-Meteo)** as extra evidence, behind a switch,
with the mocks staying the default so the demo never breaks.

No API keys are needed. Read `SPEC.md` §0 (rules), §4 (Pakka Check) and §4.5 (weights) first.

---

## 0. Setup

```bash
git checkout feature/b9-replan        # or main, once it is merged
git pull
git checkout -b feature/b8-feeds
cd backend && source .venv/bin/activate   # Python 3.11 venv (see README)
pytest -q                                  # everything should pass before you start
```

`feedparser`, `httpx` and `requests` are already in `requirements.txt`.

---

## 1. What you will build

```
backend/app/feeds/
  news_rss.py      fetch RSS → keep transit items → NewsItem list   (cache to backend/.cache/news/)
  weather.py       Open-Meteo → rain mm/h now → weather alert or None (cache to backend/.cache/weather/)
  extract.py       keyword extractor: text → {type, severity, affected{line_ids, stop_ids}} or None
  ingest.py        put NewsItems / weather into the event store as evidence
backend/app/api/feeds.py   GET /feeds/status · POST /admin/feeds/refresh
backend/tests/test_feeds.py
```

Flow:

```
RSS / Open-Meteo ──► fetch (or cached copy) ──► extract.py (is it about our network?) ──►
store.add_evidence(source_type="news" | "weather") ──► Pakka Check re-scores ──► /events, replan
```

---

## 2. Sources (checked — all return 200, no key)

| Source | URL |
|---|---|
| Google News search (best: you choose the query) | `https://news.google.com/rss/search?q=mumbai+local+train+delay&hl=en-IN&gl=IN&ceid=IN:en` |
| Times of India – Mumbai | `https://timesofindia.indiatimes.com/rssfeeds/-2128838597.cms` |
| Hindustan Times – Mumbai | `https://www.hindustantimes.com/feeds/rss/cities/mumbai-news/rssfeed.xml` |
| Free Press Journal – Mumbai | `https://www.freepressjournal.in/stories.rss?section=mumbai` |
| Open-Meteo (weather) | `https://api.open-meteo.com/v1/forecast?latitude=19.07&longitude=72.88&current=precipitation,rain&hourly=precipitation&forecast_days=1&timezone=Asia%2FKolkata` |

Good Google News queries: `mumbai local train delay`, `mumbai metro line 1`, `western railway mumbai`,
`central railway mumbai`, `mumbai waterlogging`, `mumbai mega block`.

Send a `User-Agent` header (`TravelBuddy/0.1 hackathon`), a 10 s timeout, and don't fetch more
than once every 5 minutes (cache).

---

## 3. Step by step

### Step 1 — `news_rss.py`
- `fetch_news(feeds: list[str]) -> list[NewsItem]` using `feedparser`.
- Return the **same shape as `data/news_mock.json`**:
  `{news_id, outlet, title, summary, url, published_at}`.
  `news_id` = `"NL_" + sha1(url)[:8]` (stable, so the same article is never added twice).
- Strip HTML from `summary` (Google News puts links in it).
- Save the raw result to `backend/.cache/news/<date>.json`. If the network fails, load the
  latest cached file. If there is no cache, return `[]` — **never crash**.

### Step 2 — `extract.py` (keyword extractor, no AI)
Turn a headline + summary into a structured disruption, or `None` if it isn't about our network.
B7 (LLM) will replace this later, so keep the same function signature:

```python
def extract(text: str) -> dict | None:
    # -> {"type": "delay", "severity": "medium",
    #     "affected": {"line_ids": ["METRO1"], "stop_ids": ["saki_naka"], "transfer_ids": []}}
```

- **Stops:** match station `name` and `aliases` from `data/network/stations.yaml`
  (case-insensitive, whole words). Use `load_typed_network()` from `app/data_loader.py`.
- **Lines** (keyword → line id):
  `western line / WR` → `WR_SLOW, WR_FAST` · `slow local` / `fast local` narrows it ·
  `central line / CR` → `CR_SLOW, CR_FAST` · `harbour` → `HARBOUR` ·
  `metro 1 / line 1 / versova-ghatkopar` → `METRO1` · `metro 3 / aqua line` → `METRO3` ·
  `BEST` → bus lines (only if a stop also matches).
- **Type** (first match wins):
  `suspended, closed, halted, shut` → `closure` ·
  `delay, delayed, late, snag, signal failure, disrupted` → `delay` ·
  `waterlogging, waterlogged, flooded, flooding` → `waterlogging` ·
  `mega block` → `mega_block` · `crowd, overcrowded, rush` → `crowding` ·
  `running normally, resumed, restored` → `running_normally`.
- **Severity:** `high` if suspended/halted/closed or "hour", `low` if "minor"/"few minutes", else `medium`.
- Return `None` if there is **no type** or **no line and no stop** (most city news isn't transit).
- Ignore items whose date isn't today (mega block notices for next Sunday must not count —
  see N04 / O05 in the mocks).

### Step 3 — `weather.py`
- `rain_now() -> float` (mm/h) from Open-Meteo `current.precipitation`.
- `weather_alert(now) -> dict | None`: if rain ≥ **7.5 mm/h** return an alert in the same shape
  as `O04` in `official_mock.json` (`source_type: "weather"`), else `None`.
- Cache like the news. This only boosts **waterlogging** events (that logic already exists in
  `store.add_report` and `score.evaluate` — don't change it).

### Step 4 — Event store: one new method (`app/verify/store.py`)
`add_report` already does the matching/merging for crowd reports. Add a sibling that does the
same for news, reusing its logic (or refactor `add_report` to take a `source_type`):

```python
def add_evidence(self, *, source_type, ref_id, text, at, type, severity, affected) -> tuple[str, bool]:
    # same as add_report but RawEvidence(source_type=source_type, reporter_id=None, ...)
    # skip if an evidence with this ref_id already exists (no double counting)
```

For weather: append the alert to `self.weather_alerts` **and** to every existing waterlogging
event's evidence (see how `seed.py` does it).

⚠️ Do **not** change any weights, thresholds or anti-gaming rules in `verify/policy.py`.

### Step 5 — Time: the demo clock vs real time (important)
The demo runs on a **simulated** day (`DEMO_DATE=2026-10-20`, clock 16:30–18:30). Real articles
have real dates. Rule:
- In `live` mode, a real item counts as arriving **at the current demo-clock time** when it is
  ingested (`at = clock.now()`), and only if it was published **today (real date)** within the
  last 3 hours. Keep the real `published_at` and `url` on the evidence text so judges can click it.
- In `mock` mode (default) nothing changes — the scripted story still plays.

### Step 6 — Switches + API
- `.env`: `NEWS_MODE=mock|live`, `WEATHER_MODE=mock|live` (already in `app/config.py`).
- `app/api/feeds.py`:
  - `GET /feeds/status` → `{news_mode, weather_mode, last_fetch, items_seen, items_used, rain_mm_h, source: "live"|"cache"|"mock"}`
  - `POST /admin/feeds/refresh` → fetch now + ingest → `{added: [event_id...], skipped: n}`
- Register the router in `app/main.py`. Optionally call refresh every 5 min in the existing
  lifespan task (see `app/api/journeys.py` → `AlertHub.run`), only when mode is `live`.
- Add both endpoints to the API table in `SPEC.md` §10.

### Step 7 — Tests (`backend/tests/test_feeds.py`) — no internet in tests
Use saved sample files (put a few real RSS items in `backend/tests/fixtures/`):
- extractor: *"Metro Line 1 services hit after technical snag near Saki Naka"* →
  `delay`, `METRO1`, `saki_naka`; a cricket/politics headline → `None`;
  *"mega block on Sunday"* → ignored on another date.
- ingest: one news item on an existing crowd event raises its confidence
  (e.g. 3 crowd + 1 news ≈ 0.83 → confirmed, SPEC §4.6 example); the same item twice counts once.
- weather: 10 mm/h → alert; 2 mm/h → `None`; network error → cached value, no crash.
- `pytest -q` must stay green (currently 104 tests).

---

## 4. Done when
- [ ] `NEWS_MODE=mock` (default): all existing tests pass, demo unchanged.
- [ ] `NEWS_MODE=live`: `POST /admin/feeds/refresh` pulls real headlines; transit ones show up in
      `/events` with `source_type: "news"` evidence and their link.
- [ ] Wi-Fi off → uses the cache, nothing crashes.
- [ ] `WEATHER_MODE=live` reports real rain in `/feeds/status`.
- [ ] `SPEC.md` updated; Transparency page can say: *"News: Google News / TOI / HT / FPJ RSS,
      keyword-matched; weather: Open-Meteo"*.

## 5. Don'ts
- Don't commit `.env`, `backend/.cache/` or any keys.
- Don't change Pakka Check weights or thresholds.
- Don't make tests call the internet.
- Don't touch `app/routing/` (Ayush) or `app/replan/` (Avani) — talk to them if you need to.

## 6. Who to ask
- Event store / Pakka Check / replan → Avani (Person B)
- Routing / `/plan` → Ayush (Person A)
