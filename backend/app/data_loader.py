"""Loads the seed files in data/ once and indexes them by id. SPEC.md §2."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import yaml

from .config import settings


@dataclass
class SeedData:
    stations: dict[str, dict]
    lines: dict[str, dict]
    transfers: dict[str, dict]
    fares: dict
    pois: dict[str, dict]
    travellers: dict[str, dict]
    reporters: dict[str, dict]
    reports: dict[str, dict]
    news: dict[str, dict]
    official: dict[str, dict]
    scenario: dict
    stops_by_line: dict[str, list[str]] = field(default_factory=dict)
    lines_by_stop: dict[str, list[str]] = field(default_factory=dict)


def _json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _yaml(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_seed(data_dir: Path | None = None) -> SeedData:
    d = data_dir or settings.data_dir
    network = _yaml(d / "network/lines.yaml")
    seed = SeedData(
        stations={s["id"]: s for s in _yaml(d / "network/stations.yaml")["stations"]},
        lines={line["id"]: line for line in network["lines"]},
        transfers={t["id"]: t for t in network.get("transfers", [])},
        fares=_yaml(d / "network/fares.yaml"),
        pois={p["id"]: p for p in _json(d / "pois.json")["pois"]},
        travellers={t["traveller_id"]: t for t in _json(d / "travellers.json")["travellers"]},
        reporters={r["reporter_id"]: r for r in _json(d / "reporters.json")["reporters"]},
        reports={r["report_id"]: r for r in _json(d / "reports_seed.json")["reports"]},
        news={n["news_id"]: n for n in _json(d / "news_mock.json")["news"]},
        official={a["alert_id"]: a for a in _json(d / "official_mock.json")["alerts"]},
        scenario=_json(d / settings.scenario_file),
    )
    for lid, line in seed.lines.items():
        seed.stops_by_line[lid] = list(line["stations"])
        for sid in line["stations"]:
            seed.lines_by_stop.setdefault(sid, []).append(lid)
    return seed
