"""Tests for property_format — no FreeCAD GUI required."""

import json
import os
import sys
import unittest

MOD_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
if MOD_DIR not in sys.path:
    sys.path.insert(0, MOD_DIR)

from engine.property_format import format_plant_object, load_field_templates


class TestPropertyFormat(unittest.TestCase):
    def test_templates_load(self):
        tpl = load_field_templates()
        self.assertIn("Equipment", tpl["classes"])
        self.assertIn("PipeRun", tpl["classes"])

    def test_equipment_format(self):
        obj = {
            "object_id": "550e8400-e29b-41d4-a716-446655440001",
            "class": "Equipment",
            "tag": "R-101",
            "attributes": {
                "equipment_type": "reactor",
                "design_P_MPaG": 3.2,
                "design_T_C": 355,
                "oper_P_MPaG": 2.8,
                "oper_T_C": 320,
            },
            "relationships": [],
        }
        fmt = format_plant_object(obj)
        self.assertEqual(fmt["tag"], "R-101")
        self.assertEqual(fmt["class_label"], "设备")
        keys = [f["key"] for f in fmt["fields"]]
        self.assertIn("design_P_MPaG", keys)
        design = next(f for f in fmt["fields"] if f["key"] == "design_P_MPaG")
        self.assertIn("3.2", design["display"])

    def test_pipe_run_format(self):
        obj = {
            "object_id": "550e8400-e29b-41d4-a716-446655440099",
            "class": "PipeRun",
            "tag": "100-P-101-12-C1A",
            "attributes": {"dn": "DN300", "fluid": "合成气", "design_P_MPaG": 3.6},
            "relationships": [],
        }
        fmt = format_plant_object(obj)
        self.assertEqual(fmt["class_label"], "管段")
        self.assertTrue(any(f["key"] == "dn" for f in fmt["fields"]))


if __name__ == "__main__":
    unittest.main()
