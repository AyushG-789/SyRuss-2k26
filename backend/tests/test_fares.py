from app.data_loader import load_typed_network
from app.routing.fares import (
    calculate_leg_costs,
    calculate_road_leg,
    calculate_slab_fare,
    haversine_km,
    is_auto_allowed,
)
from app.schemas import Leg


def test_haversine_distance_sanity():
    # Churchgate (18.9355, 72.8272) to CSMT (18.9405, 72.8358)
    dist = haversine_km(18.9355, 72.8272, 18.9405, 72.8358)
    assert 1.0 < dist < 2.0


def test_slab_fares_local_rail():
    _, _, _, fares = load_typed_network()
    cfg = fares.transit["local_2nd_class"]
    assert calculate_slab_fare(5.0, cfg) == 5
    assert calculate_slab_fare(10.0, cfg) == 5
    assert calculate_slab_fare(15.0, cfg) == 10
    assert calculate_slab_fare(25.0, cfg) == 15
    assert calculate_slab_fare(40.0, cfg) == 20
    assert calculate_slab_fare(55.0, cfg) == 25
    assert calculate_slab_fare(70.0, cfg) == 30


def test_slab_fares_metro_lines():
    _, _, _, fares = load_typed_network()
    m1 = fares.transit["metro_line1"]
    assert calculate_slab_fare(2.0, m1) == 10
    assert calculate_slab_fare(5.0, m1) == 20
    assert calculate_slab_fare(10.0, m1) == 30
    assert calculate_slab_fare(15.0, m1) == 40

    m3 = fares.transit["metro_line3"]
    assert calculate_slab_fare(2.0, m3) == 10
    assert calculate_slab_fare(10.0, m3) == 20
    assert calculate_slab_fare(45.0, m3) == 80


def test_slab_fares_best_bus():
    _, _, _, fares = load_typed_network()
    bus = fares.transit["best_non_ac"]
    assert calculate_slab_fare(3.0, bus) == 10
    assert calculate_slab_fare(8.0, bus) == 15
    assert calculate_slab_fare(12.0, bus) == 20
    assert calculate_slab_fare(18.0, bus) == 30
    assert calculate_slab_fare(25.0, bus) == 40


def test_auto_geographic_boundary():
    # Andheri (19.12) to Bandra (19.055) -> allowed
    assert is_auto_allowed(19.12, 19.055) is True
    # Churchgate (18.9355) to Dadar (19.019) -> south of 19.04, forbidden
    assert is_auto_allowed(18.9355, 19.019) is False
    # Exactly around boundary
    assert is_auto_allowed(19.041, 19.05) is True
    assert is_auto_allowed(19.039, 19.05) is False


def test_road_fares_auto_taxi_cab():
    _, _, _, fares = load_typed_network()
    # 2 km trip
    lat1, lon1 = 19.1200, 72.8400
    lat2, lon2 = 19.1350, 72.8400

    dur_auto, cost_auto, _ = calculate_road_leg("auto", lat1, lon1, lat2, lon2, fares)
    dur_taxi, cost_taxi, _ = calculate_road_leg("taxi", lat1, lon1, lat2, lon2, fares)
    dur_cab, cost_cab, _ = calculate_road_leg("cab", lat1, lon1, lat2, lon2, fares)

    assert dur_auto > 0 and cost_auto >= fares.auto.min_fare_inr
    assert dur_taxi > 0 and cost_taxi >= fares.taxi.min_fare_inr
    assert dur_cab > 0 and cost_cab >= fares.cab.base_inr


def test_through_ticketing_local_legs():
    stations, lines, _, fares = load_typed_network()
    # Journey: CR_FAST thane -> dadar_cr, walk transfer, WR_FAST dadar_wr -> churchgate
    legs = [
        Leg(
            mode="local",
            line_id="CR_FAST",
            from_id="thane",
            to_id="dadar_cr",
            depart="16:45",
            arrive="17:16",
            duration_min=31,
            cost_inr=0,
            step_free=False,
        ),
        Leg(
            mode="walk",
            line_id=None,
            from_id="dadar_cr",
            to_id="dadar_wr",
            depart="17:16",
            arrive="17:22",
            duration_min=6,
            cost_inr=0,
            step_free=False,
        ),
        Leg(
            mode="local",
            line_id="WR_FAST",
            from_id="dadar_wr",
            to_id="churchgate",
            depart="17:24",
            arrive="17:40",
            duration_min=16,
            cost_inr=0,
            step_free=False,
        ),
    ]

    updated = calculate_leg_costs(legs, stations, lines, fares)
    # First local leg gets the combined fare (Thane to Churchgate is ~34 km -> slab 45 km -> Rs 20)
    assert updated[0].cost_inr == 20
    # Walk transfer is free
    assert updated[1].cost_inr == 0
    # Second local leg is through-ticketed -> Rs 0
    assert updated[2].cost_inr == 0
