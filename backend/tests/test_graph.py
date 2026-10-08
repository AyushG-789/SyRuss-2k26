from app.data_loader import load_seed, load_typed_network
from app.routing.graph import build_multimodal_graph, get_line_headway
from app.schemas import Traveller


def test_headway_lookup_peak_vs_offpeak():
    _, lines, _, _ = load_typed_network()
    wr_slow = lines["WR_SLOW"]

    # Peak hour (07:00-11:00) headway is 4 min
    assert get_line_headway(wr_slow, "08:30") == 4
    assert get_line_headway(wr_slow, "09:00") == 4

    # Afternoon (11:00-17:00) headway is 7 min
    assert get_line_headway(wr_slow, "14:00") == 7

    # Evening peak (17:00-21:00) headway is 4 min
    assert get_line_headway(wr_slow, "18:00") == 4

    # Night (21:00-24:00) headway is 9 min
    assert get_line_headway(wr_slow, "22:30") == 9


def test_graph_construction_nodes_and_edges():
    stations, lines, transfers, fares = load_typed_network()
    seed = load_seed()
    tr3 = Traveller.model_validate(seed.travellers["TR3"])

    G = build_multimodal_graph(stations, lines, transfers, fares, tr3, "16:40")

    # Sanity checks
    assert G.number_of_nodes() > 200
    assert G.number_of_edges() > 400
    assert "origin" in G
    assert "destination" in G
    assert "thane" in G
    assert "csmt" in G
    assert "churchgate" in G

    # Check Dadar transfer edge exists
    assert G.has_edge("dadar_cr", "dadar_wr")
    edge = G.get_edge_data("dadar_cr", "dadar_wr")
    assert edge["edge_type"] == "transfer"
    assert edge["duration_min"] == 6


def test_step_free_filtering_in_graph():
    stations, lines, transfers, fares = load_typed_network()
    seed = load_seed()
    tr1 = Traveller.model_validate(seed.travellers["TR1"])
    assert tr1.step_free is True

    G = build_multimodal_graph(stations, lines, transfers, fares, tr1, "17:20")

    # Non-step-free stations (like thane or dadar_cr) should not have boarding edges in G
    # or should not be connectable for wheelchair users
    for u, v, d in G.edges(data=True):
        if d.get("edge_type") in {"boarding", "alighting", "transfer"}:
            assert d.get("step_free") is True
