"""PlantModel multi-view helpers — footprint, elevation, iso projection (no FreeCAD)."""

from __future__ import annotations

import math
from typing import Any, Dict, List, Tuple

FOOTPRINT_MAP: Dict[str, Tuple[float, float]] = {
    "pump": (60.0, 35.0),
    "valve": (20.0, 15.0),
    "vessel": (45.0, 45.0),
    "tank": (60.0, 60.0),
    "heat_exchanger": (120.0, 40.0),
    "exchanger": (120.0, 40.0),
    "reactor": (55.0, 55.0),
    "column": (40.0, 40.0),
    "compressor": (90.0, 50.0),
    "fan": (70.0, 50.0),
    "generic": (50.0, 50.0),
}


def default_footprint(equipment_type: str) -> Tuple[float, float]:
    key = (equipment_type or "generic").lower()
    return FOOTPRINT_MAP.get(key, FOOTPRINT_MAP["generic"])


def enrich_equipment_view_attributes(obj: Dict[str, Any]) -> None:
    """Add footprint / elevation / 3D sizing defaults on Equipment.attributes."""
    if obj.get("class") != "Equipment":
        return
    attrs = obj.setdefault("attributes", {})
    lx, ly = default_footprint(attrs.get("equipment_type", "generic"))
    if attrs.get("footprint_x") is None:
        attrs["footprint_x"] = lx
    if attrs.get("footprint_y") is None:
        attrs["footprint_y"] = ly
    if attrs.get("elevation_mm") is None:
        attrs["elevation_mm"] = 0.0
    d = max(float(attrs["footprint_x"]), float(attrs["footprint_y"]))
    if attrs.get("diameter_mm") is None:
        attrs["diameter_mm"] = d
    if attrs.get("height_mm") is None:
        attrs["height_mm"] = d * 2.0


def iso_project(x: float, y: float, z: float = 0.0, scale: float = 0.15) -> Tuple[float, float]:
    """Simplified isometric projection (2D pseudo-iso)."""
    sx = (x - y) * math.cos(math.radians(30)) * scale
    sy = (x + y) * math.sin(math.radians(30)) * scale + z * scale
    return sx, sy


def layout_view_id(project_id: str = "VDI-PROJECT") -> str:
    return f"layout-{project_id.split('-')[-1]}-001"


def isometric_view_id(project_id: str = "VDI-PROJECT") -> str:
    return f"iso-{project_id.split('-')[-1]}-001"


def model_3d_view_id(project_id: str = "VDI-PROJECT") -> str:
    return f"model-3d-{project_id.split('-')[-1]}-001"


def equipment_3d_position(
    placement: Dict[str, float],
    elevation_mm: float = 0.0,
) -> Dict[str, float]:
    return {
        "x": float(placement.get("x", 0)),
        "y": float(placement.get("y", 0)),
        "z": float(elevation_mm),
    }


def build_iso_table_rows(lines: List[dict], positions_3d: Dict[str, Tuple[float, float, float]]) -> List[dict]:
    rows = []
    for line in lines:
        fr = line.get("from_tag") or line.get("from") or ""
        to = line.get("to_tag") or line.get("to") or ""
        p1 = positions_3d.get(fr, (0, 0, 0))
        p2 = positions_3d.get(to, (0, 0, 0))
        rows.append({
            "line_no": line.get("line_no", ""),
            "from_tag": fr,
            "to_tag": to,
            "dn": line.get("dn", ""),
            "elev_from": int(p1[2]),
            "elev_to": int(p2[2]),
            "medium": line.get("fluid", ""),
            "material": line.get("material", ""),
        })
    return rows
