"""路径与符号几何单元测试"""

import json
from pathlib import Path

from core.paths import get_package_root, load_merged_config
from core.symbol_geometry import ui_category_matches, build_shape_from_symbol


def test_package_root_exists():
    root = get_package_root()
    assert root.is_dir()
    assert (root / "core").is_dir()


def test_load_config_no_crash():
    cfg = load_merged_config()
    assert "ai" in cfg
    assert "api_key" not in cfg.get("ai", {}) or cfg["ai"]["api_key"] != "sk-2c2ec59fb9b54aa19c8bb01bb33e016c"


def test_ui_category_matches():
    assert ui_category_matches("全部", "equipment")
    assert ui_category_matches("设备", "equipment")
    assert not ui_category_matches("设备", "instruments")


def test_build_shape_from_pump_json():
    sym_path = get_package_root() / "symbols/equipment/pumps/centrifugal_pump.json"
    with open(sym_path, encoding="utf-8") as f:
        sym = json.load(f)

    class FakeShape(dict):
        def translate(self, v):
            self["translated"] = (v.x, v.y, v.z)

        def fuse(self, other):
            return FakeShape({"type": "compound"})

    class FakePart:
        @staticmethod
        def makeCylinder(r, h):
            return FakeShape({"type": "cylinder", "r": r, "h": h})

        @staticmethod
        def makeBox(w, h, d):
            return FakeShape({"type": "box", "w": w, "h": h, "d": d})

        @staticmethod
        def makeLine(p1, p2):
            return FakeShape({"type": "line"})

        class Vector:
            def __init__(self, x, y, z=0):
                self.x, self.y, self.z = x, y, z

    sh = build_shape_from_symbol(sym, FakePart, 1.0)
    assert sh is not None
