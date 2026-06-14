"""Equipment layout plan renderer (footprint + grid + equipment table)."""

from typing import Any, Dict, List, Tuple

import FreeCAD as App
import Part

from engine.layout import annotate_zone_below, content_bounds
from engine.object_factory import bind_geometry_to_object
from engine.symbols import DEFAULT_LINE_SPACING, DEFAULT_TEXT_SIZE
from engine.utils import draft_make_text, safe_object_name

try:
    from vdi_cad_core.plant_views import default_footprint
except ImportError:
    def default_footprint(equipment_type: str):
        return (50.0, 50.0)


def _footprint(eq: dict) -> Tuple[float, float]:
    params = eq.get("parameters") or {}
    lx = params.get("footprint_x")
    ly = params.get("footprint_y")
    if lx and ly:
        return float(lx), float(ly)
    return default_footprint(eq.get("type", "generic"))


def _positions_from_command(equipment: List[Dict]) -> Dict[str, Tuple[float, float]]:
    positions = {}
    for eq in equipment:
        tag = eq.get("tag", "")
        pos = eq.get("position") or {}
        if tag and pos.get("x") is not None and pos.get("y") is not None:
            positions[tag] = (float(pos["x"]), float(pos["y"]))
    return positions


def _footprint_rect(lx: float, ly: float):
    x0, y0 = -lx / 2, -ly / 2
    pts = [
        App.Vector(x0, y0, 0),
        App.Vector(x0 + lx, y0, 0),
        App.Vector(x0 + lx, y0 + ly, 0),
        App.Vector(x0, y0 + ly, 0),
        App.Vector(x0, y0, 0),
    ]
    return Part.makePolygon(pts)


def _grid_lines(x_min: float, y_min: float, x_max: float, y_max: float, spacing: float = 500.0):
    edges = []
    x = x_min - (x_min % spacing)
    while x <= x_max + spacing:
        edges.append(Part.makeLine(App.Vector(x, y_min - 30, 0), App.Vector(x, y_max + 30, 0)))
        x += spacing
    y = y_min - (y_min % spacing)
    while y <= y_max + spacing:
        edges.append(Part.makeLine(App.Vector(x_min - 30, y), App.Vector(x_max + 30, y)))
        y += spacing
    return Part.Compound(edges) if edges else None


def render_layout(doc: App.Document, command: Dict[str, Any]) -> Dict[str, Any]:
    """Render equipment layout plan from CadCommand."""
    equipment = command.get("equipment", [])
    lines = command.get("lines", [])
    positions = _positions_from_command(equipment)
    eq_by_tag = {eq.get("tag"): eq for eq in equipment}

    drawn = 0
    for eq in equipment:
        tag = eq.get("tag", "")
        if tag not in positions:
            continue
        x, y = positions[tag]
        lx, ly = _footprint(eq)
        obj = doc.addObject("Part::Feature", safe_object_name("LAY", tag))
        obj.Shape = _footprint_rect(lx, ly)
        obj.Placement = App.Placement(App.Vector(x, y, 0), App.Rotation())
        oid = eq.get("object_id", "")
        if oid:
            bind_geometry_to_object(
                obj, oid, "Equipment", tag,
                {**(eq.get("parameters") or {}), "footprint_x": lx, "footprint_y": ly},
            )
        draft_make_text(doc, [tag], x - lx / 2, y + ly / 2 + 6, font_size=DEFAULT_TEXT_SIZE * 0.9)
        drawn += 1

    if positions:
        min_x, min_y, max_x, max_y = content_bounds(positions, equipment)
        grid = _grid_lines(min_x - 80, min_y - 80, max_x + 80, max_y + 80)
        if grid:
            gfc = doc.addObject("Part::Feature", "Layout_Grid")
            gfc.Shape = grid
            gfc.Label = "轴网"

    eq_table = command.get("tables", {}).get("equipment_list") or equipment
    row_count = min(len(eq_table), 20) + 1
    tx, ty = annotate_zone_below(positions, equipment, row_count)
    draft_make_text(doc, ["设备表 | 位号 | X | Y | 外形 | 标高"], tx, ty, font_size=DEFAULT_TEXT_SIZE)
    for k, eq in enumerate(eq_table[:20]):
        tag = eq.get("tag", "")
        pos = positions.get(tag, (0, 0))
        lx, ly = _footprint(eq_by_tag.get(tag, eq))
        elev = (eq_by_tag.get(tag, eq).get("parameters") or {}).get("elevation_mm", 0)
        row = f"{tag} | {int(pos[0])} | {int(pos[1])} | {int(lx)}x{int(ly)} | {elev}"
        draft_make_text(
            doc, [row], tx, ty - (k + 1) * (DEFAULT_LINE_SPACING + 1),
            font_size=DEFAULT_TEXT_SIZE * 0.85,
        )

    doc.recompute()
    return {
        "equipment_count": drawn,
        "line_count": len(lines),
        "view_type": "layout",
        "equipment_table_rows": len(eq_table),
    }
