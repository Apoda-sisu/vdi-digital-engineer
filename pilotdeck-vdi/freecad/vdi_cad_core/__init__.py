"""VDI CAD core — PlantModel validation and merge (no FreeCAD required)."""

from vdi_cad_core.layout_engine import (
    equipment_bboxes,
    label_point_on_path,
    layout_has_collisions,
    route_pipe_orthogonal,
    sugiyama_layout,
)
from vdi_cad_core.plant_views import default_footprint, enrich_equipment_view_attributes, iso_project
from vdi_cad_core.plant_tables import build_pipe_table_from_model, pipe_table_row_text
from vdi_cad_core.plant_merge import merge_plant_model
from vdi_cad_core.plant_schema import (
    PLANT_OBJECT_CLASSES,
    normalize_plant_model,
    validate_plant_model,
)

__all__ = [
    "PLANT_OBJECT_CLASSES",
    "normalize_plant_model",
    "validate_plant_model",
    "merge_plant_model",
    "sugiyama_layout",
    "equipment_bboxes",
    "route_pipe_orthogonal",
    "label_point_on_path",
    "layout_has_collisions",
    "build_pipe_table_from_model",
    "pipe_table_row_text",
    "plant_model_to_object_list_csv",
    "equipment_design_summary",
    "default_footprint",
    "enrich_equipment_view_attributes",
    "iso_project",
]
