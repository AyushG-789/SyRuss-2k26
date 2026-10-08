"""Generate a frequency-based GTFS feed from data/network/*.yaml into data/gtfs/.

The app's router reads the YAML directly; this feed exists so the network can be checked with
standard tools (MobilityData gtfs-validator, any GTFS viewer) and loaded into OTP later if wanted.

Usage: python scripts/build_gtfs.py
"""
from __future__ import annotations

import csv
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
NET = ROOT / "data" / "network"
OUT = ROOT / "data" / "gtfs"

# GTFS route_type: 1 = subway/metro, 2 = rail, 3 = bus, 4 = ferry
ROUTE_TYPE = {"metro": 1, "local": 2, "bus": 3, "ferry": 4}


def hms(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}:00"


def band_to_hms(band: str) -> tuple[str, str]:
    start, end = band.split("-")
    return f"{start}:00", f"{end}:00"


def write(name: str, header: list[str], rows: list[list]) -> None:
    with open(OUT / name, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def main() -> None:
    stations = yaml.safe_load((NET / "stations.yaml").read_text())["stations"]
    network = yaml.safe_load((NET / "lines.yaml").read_text())
    OUT.mkdir(parents=True, exist_ok=True)

    agencies = sorted({line["operator"] for line in network["lines"]})
    agency_id = {name: f"A{i + 1}" for i, name in enumerate(agencies)}
    write("agency.txt", ["agency_id", "agency_name", "agency_url", "agency_timezone"],
          [[agency_id[a], a, "https://example.org", "Asia/Kolkata"] for a in agencies])

    write("stops.txt", ["stop_id", "stop_name", "stop_lat", "stop_lon", "wheelchair_boarding"],
          [[s["id"], s["name"], s["lat"], s["lon"], 1 if s.get("step_free") else 2] for s in stations])

    write("calendar.txt", ["service_id", "monday", "tuesday", "wednesday", "thursday", "friday",
                           "saturday", "sunday", "start_date", "end_date"],
          [["DAILY", 1, 1, 1, 1, 1, 1, 1, "20260101", "20271231"]])

    routes, trips, stop_times, freqs = [], [], [], []
    for line in network["lines"]:
        lid = line["id"]
        routes.append([lid, agency_id[line["operator"]], lid, line["name"], ROUTE_TYPE[line["mode"]],
                       line.get("color", "#888888").lstrip("#")])
        for direction, seq in ((0, line["stations"]), (1, list(reversed(line["stations"])))):
            runs = line["run_minutes"] if direction == 0 else list(reversed(line["run_minutes"]))
            trip_id = f"{lid}_{direction}"
            trips.append([lid, "DAILY", trip_id, seq[-1], direction])
            t = 0
            for i, sid in enumerate(seq):
                stop_times.append([trip_id, hms(t), hms(t), sid, i + 1])
                if i < len(runs):
                    t += runs[i]
            for band, headway in line["headway_min"].items():
                start, end = band_to_hms(band)
                freqs.append([trip_id, start, end, headway * 60, 0])

    write("routes.txt", ["route_id", "agency_id", "route_short_name", "route_long_name", "route_type",
                         "route_color"], routes)
    write("trips.txt", ["route_id", "service_id", "trip_id", "trip_headsign", "direction_id"], trips)
    write("stop_times.txt", ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"], stop_times)
    write("frequencies.txt", ["trip_id", "start_time", "end_time", "headway_secs", "exact_times"], freqs)

    transfers = []
    for t in network.get("transfers", []):
        for a, b in ((t["a"], t["b"]), (t["b"], t["a"])):
            transfers.append([a, b, 2, t["walk_min"] * 60])
    write("transfers.txt", ["from_stop_id", "to_stop_id", "transfer_type", "min_transfer_time"], transfers)

    write("feed_info.txt", ["feed_publisher_name", "feed_publisher_url", "feed_lang", "feed_version"],
          [["RouteSaathi (hackathon prototype, approximate data)", "https://example.org", "en", "0.1"]])

    print(f"Wrote GTFS to {OUT.relative_to(ROOT)}: {len(stations)} stops, {len(routes)} routes, "
          f"{len(trips)} trips, {len(stop_times)} stop_times, {len(freqs)} frequency rows, "
          f"{len(transfers)} transfers")


if __name__ == "__main__":
    main()
