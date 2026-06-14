"""Tests for pick_resolver — TechDraw bbox hit test without FreeCAD."""

import os
import sys
import unittest

MOD_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
if MOD_DIR not in sys.path:
    sys.path.insert(0, MOD_DIR)

from engine import pick_resolver


class _FakeBoundBox:
    def __init__(self, xmin, ymin, xmax, ymax):
        self.XMin = xmin
        self.YMin = ymin
        self.XMax = xmax
        self.YMax = ymax


class _FakeShape:
    def __init__(self, bbox):
        self.BoundBox = bbox


class _FakeEquip:
    def __init__(self, tag, bbox):
        self.Shape = _FakeShape(bbox)
        self.VDI_ObjectId = f"id-{tag}"
        self.VDI_Class = "Equipment"
        self.VDI_Tag = tag
        self.VDI_Attributes = "{}"


class _FakeView:
    TypeId = "TechDraw::DrawViewPart"
    Scale = 0.5
    X = 420.0
    Y = 280.0

    def __init__(self, sources):
        self.Source = sources


class _FakeSel:
    def __init__(self, obj, picked=None):
        self.Object = obj
        self.SubObjects = []
        self.PickedPoints = picked or []


def _props(tag):
    return {
        "object_id": f"id-{tag}",
        "class": "Equipment",
        "tag": tag,
        "attributes": {},
        "relationships": [],
    }


class _FakeViewWithVdi(_FakeView):
    """TechDraw view with VDI bound — per-object pick path."""

    def __init__(self, tag, sources=None):
        super().__init__(sources or [])
        self.VDI_ObjectId = f"id-{tag}"
        self.VDI_Class = "Equipment"
        self.VDI_Tag = tag
        self.VDI_Attributes = "{}"


class TestPickResolver(unittest.TestCase):
    def test_techdraw_view_vdi_direct_hit(self):
        view = _FakeViewWithVdi("T-201")
        sel = [_FakeSel(view)]
        result = pick_resolver._resolve_techdraw_selection(None, sel, pick_point=None)
        self.assertIsNotNone(result)
        self.assertEqual(result["tag"], "T-201")
        self.assertEqual(result["method"], "techdraw_view_vdi")

    def test_dist_point_segment(self):
        d = pick_resolver._dist_point_segment_2d(5.0, 5.0, 0.0, 0.0, 10.0, 0.0)
        self.assertAlmostEqual(d, 5.0, places=4)

    def test_techdraw_selection_without_pick_point(self):
        view = _FakeView([])
        sel = [_FakeSel(view)]
        result = pick_resolver._resolve_techdraw_selection(None, sel, pick_point=None)
        self.assertIsNone(result)

    def test_page_to_model_hit_second_equipment(self):
        r101 = _FakeEquip("R-101", _FakeBoundBox(0, 0, 20, 20))
        r102 = _FakeEquip("R-102", _FakeBoundBox(100, 0, 120, 20))
        view = _FakeView([r101, r102])

        # R-102 center in model ≈ (110, 10) → page (425, 272.5)
        page_pt = (425.0, 272.5)
        hit = pick_resolver._resolve_symbol_near_point(None, view, pick_point=page_pt)
        self.assertIsNotNone(hit)
        self.assertEqual(hit["tag"], "R-102")
        self.assertEqual(hit["method"], "techdraw_symbol_bbox")

    def test_does_not_default_to_first_without_hit(self):
        r101 = _FakeEquip("R-101", _FakeBoundBox(0, 0, 20, 20))
        r102 = _FakeEquip("R-102", _FakeBoundBox(100, 0, 120, 20))
        view = _FakeView([r101, r102])
        hit = pick_resolver._resolve_symbol_near_point(None, view, pick_point=None)
        self.assertIsNone(hit)

    def test_hit_test_vdi_sources_nearest(self):
        r101 = _FakeEquip("R-101", _FakeBoundBox(0, 0, 20, 20))
        r102 = _FakeEquip("R-102", _FakeBoundBox(100, 0, 120, 20))
        view = _FakeView([r101, r102])
        vdi = [(r101, _props("R-101")), (r102, _props("R-102"))]
        # Near R-101 but outside strict bbox — should still pick nearest
        page_near_r101 = pick_resolver._page_to_model(
            420.0, 280.0, view.X, view.Y, view.Scale, (0, 0, 120, 20)
        )
        hit = pick_resolver._hit_test_vdi_sources(vdi, page_near_r101, view)
        self.assertIsNotNone(hit)
        self.assertEqual(hit["tag"], "R-101")

    def test_nearest_respects_distance_threshold(self):
        r101 = _FakeEquip("R-101", _FakeBoundBox(0, 0, 20, 20))
        r102 = _FakeEquip("R-102", _FakeBoundBox(100, 0, 120, 20))
        view = _FakeView([r101, r102])
        vdi = [(r101, _props("R-101")), (r102, _props("R-102"))]
        # Far from both symbols — should miss, not default to R-101
        page_far = pick_resolver._page_to_model(
            600.0, 600.0, view.X, view.Y, view.Scale, (0, 0, 120, 20)
        )
        hit = pick_resolver._hit_test_vdi_sources(vdi, page_far, view)
        self.assertIsNone(hit)

    def test_techdraw_geometry_view_uses_composite_name(self):
        class _Doc:
            def getObject(self, name):
                return "composite" if name == "VDI_View" else None

        class _Legacy:
            Name = "VDI_V_R101"

        out = pick_resolver._techdraw_geometry_view(_Doc(), _Legacy())
        self.assertEqual(out, "composite")

    def test_extract_pick_point_prefers_picked_points(self):
        sel = [_FakeSel(None, picked=[(425.0, 272.5, 0.0)])]
        pt = pick_resolver.extract_pick_point(sel, fallback_pnt=(0.0, 0.0))
        self.assertEqual(pt, (425.0, 272.5))


if __name__ == "__main__":
    unittest.main()
