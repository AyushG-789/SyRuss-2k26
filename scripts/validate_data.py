"""Check that every id referenced anywhere in data/ exists and the files are internally consistent.

Usage: python scripts/validate_data.py        (exit code 1 if any error)
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml

DATA = Path(__file__).resolve().parent.parent / "data"
HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
BAND = re.compile(r"^(\d{2}:\d{2})-(\d{2}:\d{2})$")

errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def load_json(name: str) -> dict:
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def check_affected(where: str, affected: dict | None, stops: set, lines: set, transfers: set) -> None:
    if not affected:
        return
    for sid in affected.get("stop_ids", []):
        if sid not in stops:
            err(f"{where}: unknown stop_id {sid!r}")
    for lid in affected.get("line_ids", []):
        if lid not in lines:
            err(f"{where}: unknown line_id {lid!r}")
    for tid in affected.get("transfer_ids", []):
        if tid not in transfers:
            err(f"{where}: unknown transfer_id {tid!r}")


def main() -> int:
    stations = yaml.safe_load((DATA / "network/stations.yaml").read_text())["stations"]
    network = yaml.safe_load((DATA / "network/lines.yaml").read_text())
    yaml.safe_load((DATA / "network/fares.yaml").read_text())  # must at least parse

    # --- stations ---
    stop_ids: set[str] = set()
    for s in stations:
        if s["id"] in stop_ids:
            err(f"stations.yaml: duplicate id {s['id']!r}")
        stop_ids.add(s["id"])
        if not (18.8 < s["lat"] < 19.4 and 72.7 < s["lon"] < 73.2):
            err(f"stations.yaml: {s['id']} coordinates outside Mumbai: {s['lat']}, {s['lon']}")
        if s["mode"] not in {"local", "metro", "bus", "ferry"}:
            err(f"stations.yaml: {s['id']} has unknown mode {s['mode']!r}")

    # --- lines ---
    line_ids: set[str] = set()
    used_stops: set[str] = set()
    station_mode = {s["id"]: s["mode"] for s in stations}
    for line in network["lines"]:
        lid = line["id"]
        if lid in line_ids:
            err(f"lines.yaml: duplicate line id {lid!r}")
        line_ids.add(lid)
        sts = line["stations"]
        if len(sts) != len(set(sts)):
            err(f"lines.yaml: {lid} repeats a station")
        for sid in sts:
            used_stops.add(sid)
            if sid not in stop_ids:
                err(f"lines.yaml: {lid} uses unknown stop {sid!r}")
            elif station_mode[sid] != line["mode"]:
                err(f"lines.yaml: {lid} (mode {line['mode']}) uses {sid} which has mode {station_mode[sid]}")
        if len(line["run_minutes"]) != len(sts) - 1:
            err(f"lines.yaml: {lid} has {len(sts)} stations but {len(line['run_minutes'])} run_minutes (need {len(sts) - 1})")
        if any(m <= 0 for m in line["run_minutes"]):
            err(f"lines.yaml: {lid} has a non-positive run time")
        for band, hw in line["headway_min"].items():
            m = BAND.match(band)
            if not m or m.group(1) >= m.group(2) and m.group(2) != "24:00":
                err(f"lines.yaml: {lid} bad headway band {band!r}")
            if hw <= 0:
                err(f"lines.yaml: {lid} non-positive headway in {band}")

    transfer_ids: set[str] = set()
    for t in network.get("transfers", []):
        if t["id"] in transfer_ids:
            err(f"lines.yaml: duplicate transfer id {t['id']!r}")
        transfer_ids.add(t["id"])
        for end in ("a", "b"):
            if t[end] not in stop_ids:
                err(f"lines.yaml: transfer {t['id']} uses unknown stop {t[end]!r}")
        expected_id = f"T_{t['a']}__{t['b']}"
        if t["id"] != expected_id:
            warnings.append(f"lines.yaml: transfer id {t['id']} does not follow T_<a>__<b> ({expected_id})")

    for sid in stop_ids - used_stops:
        warnings.append(f"stations.yaml: {sid} is not on any line")

    # --- POIs ---
    pois = load_json("pois.json")["pois"]
    poi_ids = {p["id"] for p in pois}
    if len(poi_ids) != len(pois):
        err("pois.json: duplicate POI id")
    for p in pois:
        for sid in p["nearest_stops"]:
            if sid not in stop_ids:
                err(f"pois.json: {p['id']} nearest_stops has unknown stop {sid!r}")

    # --- travellers ---
    travellers = load_json("travellers.json")["travellers"]
    traveller_ids = {t["traveller_id"] for t in travellers}
    for t in travellers:
        for key in ("origin", "destination"):
            place = t.get(key)
            if place and place.get("poi_id") and place["poi_id"] not in poi_ids:
                err(f"travellers.json: {t['traveller_id']} {key} unknown poi {place['poi_id']!r}")
        for key in ("leave_at", "arrive_by"):
            if t.get(key) and not HHMM.match(t[key]):
                err(f"travellers.json: {t['traveller_id']} bad {key} {t[key]!r}")
        if t.get("itinerary"):
            stops = t["itinerary"]["stops"]
            if len(stops) > 5:
                err(f"travellers.json: {t['traveller_id']} itinerary has {len(stops)} stops (max 5)")
            for s in stops:
                if s["poi_id"] not in poi_ids:
                    err(f"travellers.json: {t['traveller_id']} itinerary unknown poi {s['poi_id']!r}")

    # --- reporters, reports, news, official ---
    reporter_ids = {r["reporter_id"] for r in load_json("reporters.json")["reporters"]}
    reports = load_json("reports_seed.json")["reports"]
    if len(reports) != 30:
        err(f"reports_seed.json: expected 30 reports, found {len(reports)}")
    report_ids = set()
    event_ids: set[str] = set()
    for r in reports:
        rid = r["report_id"]
        if rid in report_ids:
            err(f"reports_seed.json: duplicate {rid}")
        report_ids.add(rid)
        if r["reporter_id"] not in reporter_ids:
            err(f"reports_seed.json: {rid} unknown reporter {r['reporter_id']!r}")
        if not HHMM.match(r["reported_at"]):
            err(f"reports_seed.json: {rid} bad reported_at {r['reported_at']!r}")
        exp = r["expected"]
        check_affected(f"reports_seed.json {rid}", exp.get("affected"), stop_ids, line_ids, transfer_ids)
        if exp.get("event"):
            event_ids.add(exp["event"])

    news = load_json("news_mock.json")["news"]
    alerts = load_json("official_mock.json")["alerts"]
    for n in news:
        check_affected(f"news_mock.json {n['news_id']}", n["expected"].get("affected"), stop_ids, line_ids, transfer_ids)
    for a in alerts:
        check_affected(f"official_mock.json {a['alert_id']}", a["expected"].get("affected"), stop_ids, line_ids, transfer_ids)
    refs = {"report": report_ids, "news": {n["news_id"] for n in news}, "official": {a["alert_id"] for a in alerts}}

    # --- scenario ---
    scenario = load_json("scenarios/demo.json")
    seen_refs = set()
    for item in scenario["timeline"]:
        if not (HHMM.match(item["t"]) or DATE.match(item["t"])):
            err(f"demo.json: bad time {item['t']!r}")
        if item["kind"] == "action":
            if item.get("traveller_id") not in traveller_ids:
                err(f"demo.json: action for unknown traveller {item.get('traveller_id')!r}")
            continue
        if item["ref"] not in refs.get(item["kind"], set()):
            err(f"demo.json: unknown {item['kind']} ref {item['ref']!r}")
        seen_refs.add(item["ref"])
    for rid in report_ids - seen_refs:
        err(f"demo.json: report {rid} is never played in the timeline")
    for gt in scenario["ground_truth"]:
        if gt["event"] not in event_ids:
            err(f"demo.json: ground_truth event {gt['event']!r} not referenced by any report")
    for ev in event_ids - {gt["event"] for gt in scenario["ground_truth"]}:
        err(f"demo.json: event {ev!r} has no ground_truth entry")
    for key in ("expected_replans", "must_not_replan"):
        for x in scenario.get(key, []):
            if x["traveller_id"] not in traveller_ids:
                err(f"demo.json: {key} unknown traveller {x['traveller_id']!r}")
            if x["event"] not in event_ids:
                err(f"demo.json: {key} unknown event {x['event']!r}")

    for w in warnings:
        print(f"WARN  {w}")
    for e in errors:
        print(f"ERROR {e}")
    print(f"\n{len(stop_ids)} stops, {len(line_ids)} lines, {len(transfer_ids)} transfers, "
          f"{len(poi_ids)} POIs, {len(traveller_ids)} travellers, {len(reports)} reports, "
          f"{len(event_ids)} ground-truth events -> {len(errors)} errors, {len(warnings)} warnings")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
