"""Pipe routing helpers — re-export from vdi_cad_core."""

from vdi_cad_core.layout_engine import (
    equipment_bboxes,
    label_point_on_path,
    route_pipe_orthogonal,
)

__all__ = [
    "equipment_bboxes",
    "label_point_on_path",
    "route_pipe_orthogonal",
]
