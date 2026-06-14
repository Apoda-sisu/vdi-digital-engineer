"""scheme_schema 单元测试（无需 FreeCAD）"""

import json
from pathlib import Path

from core.scheme_schema import build_pipe_list, enrich_scheme, validate_for_pfd, validate_for_pid


def test_enrich_builds_pipe_list():
    scheme = {
        "geometry": {
            "objects": [
                {"id": "EQ-001", "label": "P-1001"},
                {"id": "EQ-002", "label": "T-1001"},
            ],
            "connections": [
                {
                    "id": "CONN-001",
                    "from": "EQ-001",
                    "to": "EQ-002",
                    "label": "1001-A1A-H",
                    "stream_no": "S-101",
                    "parameters": {"diameter": "DN100", "medium": "进料"},
                }
            ],
        },
        "streams": [
            {"stream_no": "S-101", "connection_id": "CONN-001", "flow": "100 m³/h"}
        ],
    }
    enriched = enrich_scheme(scheme)
    pl = enriched["tables"]["pipe_list"]
    assert len(pl) == 1
    assert pl[0]["line_no"] == "1001-A1A-H"
    assert pl[0]["stream_no"] == "S-101"
    assert pl[0]["from_tag"] == "P-1001"


def test_validate_pfd_strict_streams():
    scheme = enrich_scheme({
        "geometry": {"objects": [{"id": "E1", "label": "P-1"}], "connections": []},
        "output_config": {"drawing_type": "pfd"},
    })
    loose = validate_for_pfd(scheme, strict=False)
    assert loose["ok"] is True
    assert any("streams" in w for w in loose["warnings"])

    strict = validate_for_pfd(scheme, strict=True)
    assert strict["ok"] is False


def test_example_pid_json_loads():
    path = Path(__file__).parent.parent / "examples/input/example_pid.json"
    with open(path, encoding="utf-8") as f:
        scheme = json.load(f)
    enriched = enrich_scheme(scheme)
    report = validate_for_pid(enriched, strict=True)
    assert report["ok"] is True
    assert report["instrument_count"] >= 4
    assert len(enriched["tables"]["pipe_list"]) >= 2
    assert enriched["tables"].get("instrument_list")


def test_example_pfd_json_loads():
    path = Path(__file__).parent.parent / "examples/input/example_pfd.json"
    with open(path, encoding="utf-8") as f:
        scheme = json.load(f)
    enriched = enrich_scheme(scheme)
    report = validate_for_pfd(enriched, strict=True)
    assert report["ok"] is True
    assert report["pipe_list_count"] >= 2
    assert report["stream_count"] >= 2
