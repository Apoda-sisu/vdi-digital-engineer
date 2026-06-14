"""Sheet coordinate helpers — no FreeCAD required."""

import os
import sys
import unittest

MOD_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
if MOD_DIR not in sys.path:
    sys.path.insert(0, MOD_DIR)

from engine.sheet import _bounds_center, _model_to_page, _subset_page_anchor


class _FakeBoundBox:
    def __init__(self, xmin, ymin, xmax, ymax):
        self.XMin = xmin
        self.YMin = ymin
        self.XMax = xmax
        self.YMax = ymax


class _FakeShape:
    def __init__(self, bbox):
        self.BoundBox = bbox


class _FakeObj:
    def __init__(self, xmin, ymin, xmax, ymax):
        self.Shape = _FakeShape(_FakeBoundBox(xmin, ymin, xmax, ymax))


class TestSheetCoords(unittest.TestCase):
    def test_subset_anchor_aligns_pipe_only_view(self):
        full = (0.0, 0.0, 200.0, 100.0)
        pipes = [_FakeObj(50, 10, 150, 20)]
        view_x, view_y, scale = 420.0, 280.0, 0.5
        ax, ay = _subset_page_anchor(full, pipes, view_x, view_y, scale)
        fcx, fcy = _bounds_center(full)
        pcx, pcy = 100.0, 15.0
        mx, my = 100.0, 15.0
        composite_page = _model_to_page(mx, my, view_x, view_y, scale, *full)
        subset_page = (ax + (mx - pcx) * scale, ay + (my - pcy) * scale)
        self.assertAlmostEqual(composite_page[0], subset_page[0], places=4)
        self.assertAlmostEqual(composite_page[1], subset_page[1], places=4)


if __name__ == "__main__":
    unittest.main()
