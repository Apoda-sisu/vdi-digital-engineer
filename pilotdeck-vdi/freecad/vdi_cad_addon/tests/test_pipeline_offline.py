"""Offline unit tests for converter/layout/plant logic (no FreeCAD required)."""

import json
import os
import sys
import unittest

ADDON_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FREEcad_ROOT = os.path.dirname(ADDON_ROOT)
sys.path.insert(0, ADDON_ROOT)
sys.path.insert(0, FREEcad_ROOT)


class TestTagInference(unittest.TestCase):
    def test_infer_types(self):
        from engine.symbols import infer_type_from_tag

        self.assertEqual(infer_type_from_tag("P-401"), "pump")
        self.assertEqual(infer_type_from_tag("E-301"), "heat_exchanger")
        self.assertEqual(infer_type_from_tag("R-101"), "reactor")
        self.assertEqual(infer_type_from_tag("T-201"), "vessel")
        self.assertEqual(infer_type_from_tag("K-101"), "compressor")
        self.assertEqual(infer_type_from_tag("C-601", "compressor"), "compressor")


class TestCadCommandSchema(unittest.TestCase):
    def test_schema_file_exists(self):
        schema_path = os.path.join(
            os.path.dirname(ADDON_ROOT),
            "..",
            "mcp",
            "vdi-cad",
            "schemas",
            "cad-command-v1.schema.json",
        )
        schema_path = os.path.normpath(schema_path)
        self.assertTrue(os.path.isfile(schema_path))
        with open(schema_path) as f:
            schema = json.load(f)
        self.assertIn("1.0", schema["properties"]["version"]["enum"])
        self.assertIn("object_id", schema["properties"]["equipment"]["items"]["properties"])

    def test_plant_model_schema_exists(self):
        schema_path = os.path.normpath(
            os.path.join(os.path.dirname(ADDON_ROOT), "..", "mcp", "vdi-cad", "schemas", "plant-model-v1.schema.json")
        )
        self.assertTrue(os.path.isfile(schema_path))


class TestPlantCore(unittest.TestCase):
    def test_validate_and_merge(self):
        from vdi_cad_core.plant_schema import validate_plant_model
        from vdi_cad_core.plant_merge import merge_plant_model

        base = {
            "version": "1.0",
            "project_id": "MEOH-100",
            "revision": "A",
            "objects": [
                {
                    "object_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                    "class": "Equipment",
                    "tag": "P-401",
                    "attributes": {"design_P_MPaG": 1.0},
                    "relationships": [],
                }
            ],
            "views": [{"view_id": "pfd-100-001", "view_type": "pfd", "placements": {}}],
        }
        errors, _ = validate_plant_model(base)
        self.assertEqual(errors, [])

        merged = merge_plant_model(base, {
            "objects": [{
                "object_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                "class": "Equipment",
                "tag": "P-401",
                "attributes": {"design_P_MPaG": 2.5},
            }],
        })
        obj = merged["objects"][0]
        self.assertEqual(obj["attributes"]["design_P_MPaG"], 2.5)


class TestPlantViews(unittest.TestCase):
    def test_footprint_and_iso(self):
        from vdi_cad_core.plant_views import default_footprint, enrich_equipment_view_attributes, iso_project

        lx, ly = default_footprint("pump")
        self.assertEqual(lx, 60.0)
        obj = {"class": "Equipment", "tag": "P-401", "attributes": {"equipment_type": "pump"}}
        enrich_equipment_view_attributes(obj)
        self.assertEqual(obj["attributes"]["footprint_x"], 60.0)
        sx, sy = iso_project(100, 200, 500)
        self.assertIsInstance(sx, float)
        self.assertIsInstance(sy, float)


class TestObjectExport(unittest.TestCase):
    def test_csv_export(self):
        from vdi_cad_core.object_export import plant_model_to_object_list_csv, equipment_design_summary

        model = {
            "objects": [
                {
                    "object_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                    "class": "Equipment",
                    "tag": "P-401",
                    "attributes": {"equipment_type": "pump", "design_P_MPaG": 2.5, "design_T_C": 200},
                }
            ]
        }
        csv = plant_model_to_object_list_csv(model)
        self.assertIn("P-401", csv)
        summary = equipment_design_summary(model)
        self.assertTrue(summary["complete"])


class TestPlantTables(unittest.TestCase):
    def test_pipe_table_from_model(self):
        from vdi_cad_core.plant_tables import build_pipe_table_from_model, pipe_table_row_text

        model = {
            "objects": [
                {
                    "object_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                    "class": "PipeRun",
                    "tag": "100-P-101-12\"-C1A",
                    "attributes": {
                        "from_tag": "R-101",
                        "to_tag": "R-102",
                        "dn": 150,
                        "fluid": "合成气",
                    },
                }
            ]
        }
        rows = build_pipe_table_from_model(model)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["dn_label"], "DN150")
        self.assertIn("DN150", pipe_table_row_text(rows[0]))


class TestLayoutEngine(unittest.TestCase):
    def test_sugiyama_chain_left_to_right(self):
        from vdi_cad_core.layout_engine import layout_has_collisions, sugiyama_layout

        tags = ["A", "B", "C"]
        lines = [{"from_tag": "A", "to_tag": "B"}, {"from_tag": "B", "to_tag": "C"}]
        pos = sugiyama_layout(tags, lines)
        self.assertLess(pos["A"]["x"], pos["B"]["x"])
        self.assertLess(pos["B"]["x"], pos["C"]["x"])
        self.assertFalse(layout_has_collisions(pos, tags))

    def test_pipe_router_avoids_obstacle(self):
        from vdi_cad_core.layout_engine import route_pipe_orthogonal

        obstacles = [{"min_x": 90, "max_x": 110, "min_y": 90, "max_y": 110}]
        waypoints = route_pipe_orthogonal((50, 100), (150, 100), obstacles)
        self.assertGreaterEqual(len(waypoints), 2)

    def test_label_on_longest_segment(self):
        from vdi_cad_core.layout_engine import label_point_on_path

        pts = [(0, 0), (100, 0), (100, 50)]
        lx, ly = label_point_on_path(pts)
        self.assertAlmostEqual(lx, 50.0)
        self.assertAlmostEqual(ly, 0.0)


class TestDexpiExport(unittest.TestCase):
    def test_dexpi_xml_counts(self):
        from vdi_cad_core.dexpi_export import plant_model_to_dexpi_xml, dexpi_export_summary

        model = {
            "project_id": "MEOH-100",
            "revision": "A",
            "objects": [
                {
                    "object_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                    "class": "Equipment",
                    "tag": "P-401",
                    "attributes": {"equipment_type": "pump", "design_P_MPaG": 2.5},
                },
                {
                    "object_id": "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
                    "class": "PipeRun",
                    "tag": "100-P-101",
                    "attributes": {"from_tag": "P-401", "to_tag": "E-301", "dn": 150},
                },
            ],
        }
        xml = plant_model_to_dexpi_xml(model)
        self.assertIn("<Equipment", xml)
        self.assertIn("TagName=\"P-401\"", xml)
        self.assertIn("<PipingNetworkSegment", xml)
        summary = dexpi_export_summary(model)
        self.assertEqual(summary["equipment"], 1)
        self.assertEqual(summary["pipe_segments"], 1)


class TestRevision(unittest.TestCase):
    def test_merge_with_revision(self):
        from vdi_cad_core.plant_merge import merge_plant_model_with_revision
        from vdi_cad_core.revision import next_revision

        base = {
            "version": "1.0",
            "project_id": "MEOH-100",
            "revision": "A",
            "objects": [{
                "object_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                "class": "Equipment",
                "tag": "P-401",
                "attributes": {"design_P_MPaG": 1.0},
            }],
            "views": [{"view_id": "pfd-1", "view_type": "pfd", "title_block": {"revision": "A"}}],
            "change_log": [],
        }
        merged = merge_plant_model_with_revision(base, {
            "objects": [{
                "object_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                "attributes": {"design_P_MPaG": 2.0},
            }],
        })
        self.assertEqual(merged["revision"], "B")
        self.assertEqual(merged["objects"][0]["attributes"]["design_P_MPaG"], 2.0)
        self.assertEqual(merged["views"][0]["title_block"]["revision"], "B")
        self.assertEqual(len(merged["change_log"]), 1)
        self.assertEqual(next_revision("A"), "B")


class TestSymbolManager(unittest.TestCase):
    def test_symbol_library_loads(self):
        from engine.symbol_manager import SymbolManager
        import os

        repo_symbols = os.path.normpath(
            os.path.join(FREEcad_ROOT, "..", "..", "cad-intelligence", "symbols")
        )
        if not os.path.isdir(repo_symbols):
            self.skipTest("cad-intelligence symbols not available")
        mgr = SymbolManager(repo_symbols)
        self.assertGreaterEqual(mgr.count(), 40)


if __name__ == "__main__":
    unittest.main()
