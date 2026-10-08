"""Fetch Mumbai stations and POIs from OpenStreetMap (Overpass) and compare with our data files.

Writes raw responses to data/osm/ (git-ignored) and prints, for every station / POI in our data,
the nearest OSM feature with a matching name and how far apart they are, so coordinates can be
corrected by hand. It never edits stations.yaml or pois.json itself.

Usage: python scripts/fetch_osm.py [stations|pois|all]
Data © OpenStreetMap contributors, ODbL.
"""
from __future__ import annotations

import json
import math
import re
import sys
import time
from pathlib import Path

import requests
import yaml

ROOT = Path(__file__).resolve().parent.parent
OSM_DIR = ROOT / "data" / "osm"
BBOX = "18.88,72.76,19.28,73.10"  # south, west, north, east
SERVERS = ["https://overpass-api.de/api/interpreter",
           "https://overpass.kumi.systems/api/interpreter"]
HEADERS = {"User-Agent": "TravelBuddy-hackathon/0.1 (Syrus 7.0 student project)"}

QUERIES = {
    "stations": f"""[out:json][timeout:120];
(
  nwr["railway"~"^(station|halt)$"]({BBOX});
  nwr["public_transport"="station"]({BBOX});
);
out center tags;""",
    "pois": f"""[out:json][timeout:120];
(
  nwr["tourism"~"^(museum|attraction|viewpoint|gallery)$"]({BBOX});
  nwr["amenity"="place_of_worship"]["name"]({BBOX});
  nwr["leisure"~"^(park|stadium)$"]["name"]({BBOX});
  nwr["natural"="beach"]["name"]({BBOX});
);
out center tags;""",
}


def overpass(query: str) -> dict:
    for attempt in range(3):
        for url in SERVERS:
            try:
                r = requests.post(url, data={"data": query}, headers=HEADERS, timeout=180)
                if r.ok and r.text.lstrip().startswith("{"):
                    return r.json()
                print(f"  {url}: HTTP {r.status_code}, retrying…")
            except requests.RequestException as exc:
                print(f"  {url}: {exc}, retrying…")
        time.sleep(15 * (attempt + 1))
    raise SystemExit("Overpass unavailable — try again in a few minutes.")


def norm(name: str) -> str:
    name = re.sub(r"\(.*?\)", "", name.lower())
    return re.sub(r"[^a-z0-9]", "", name)


def km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2
         + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2)
    return 12742 * math.asin(math.sqrt(a))


def features(data: dict) -> list[tuple[str, float, float]]:
    out = []
    for e in data["elements"]:
        name = e.get("tags", {}).get("name")
        c = e.get("center", e)
        if name and "lat" in c:
            out.append((name, c["lat"], c["lon"]))
    return out


def compare(kind: str, ours: list[dict], osm: list[tuple[str, float, float]]) -> None:
    print(f"\n{kind}: comparing {len(ours)} of ours with {len(osm)} OSM features")
    for item in ours:
        names = [item["name"], *item.get("aliases", [])]
        keys = {norm(n) for n in names}
        matches = [(km(item["lat"], item["lon"], la, lo), n, la, lo)
                   for n, la, lo in osm if norm(n) in keys or any(k and k in norm(n) for k in keys)]
        if not matches:
            print(f"  ?  {item['id']:<24} no OSM name match")
            continue
        d, n, la, lo = min(matches)
        flag = "OK " if d < 0.4 else "CHK"
        print(f"  {flag} {item['id']:<24} {d:5.2f} km from OSM '{n}' ({la:.4f}, {lo:.4f})")


def main() -> None:
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    OSM_DIR.mkdir(parents=True, exist_ok=True)
    if which in ("stations", "all"):
        print("Fetching stations…")
        data = overpass(QUERIES["stations"])
        (OSM_DIR / "stations_raw.json").write_text(json.dumps(data))
        ours = yaml.safe_load((ROOT / "data/network/stations.yaml").read_text())["stations"]
        compare("stations", [s for s in ours if s["mode"] != "bus"], features(data))
    if which in ("pois", "all"):
        print("Fetching POIs…")
        data = overpass(QUERIES["pois"])
        (OSM_DIR / "pois_raw.json").write_text(json.dumps(data))
        ours = json.loads((ROOT / "data/pois.json").read_text())["pois"]
        compare("pois", ours, features(data))


if __name__ == "__main__":
    main()
