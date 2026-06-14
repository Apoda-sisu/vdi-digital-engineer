"""Simplified piping isometric renderer (2D pseudo-iso, not true 3D)."""

import math
from typing import Any, Dict, List, Tuple

import FreeCAD as App
import Part

from engine.object_factory import bind_geometry_to_object
from engine.symbols import DEFAULT_LINE_SPACING, DEFAULT_TEXT_SIZE
from engine.utils import draft_make_text, safe_object_name

try:
    from vdi_cad_core.plant_views import iso_project
except ImportError:
    def iso_project(x, y, z=0.0, scale=0.15):
        sx = (x - y) * math.cos(math.radians(30)) * scale
        sy = (x + y) * math.sin(math.radians(30)) * scale + z * scale
        return sx, sy


ISO_SCALE = 0.15
_ORIGIN_X = 200.0
_ORIGIN_Y = 150.0


def _positions_3d(equipment: List[Dict]) -> Dict[str, Tuple[float, float, float]]:
    out = {}
    for eq in equipment:
        tag = eq.get("tag", "")
        pos = eq.get("position") or {}
        params = eq.get("parameters") or {}
        if not tag or pos.get("x") is None:
            continue
        out[tag] = (
            float(pos["x"]),
            float(pos["y"]),
            float(pos.get("z", params.get("elevation_mm", 0))),
        )
    return out


def _iso_pipe_segment(p1: Tuple[float, float, float], p2: Tuple[float, float, float]):
    x1, y1, z1 = p1
    x2, y2, z2 = p2
    mid = (x2, y2, z1)
    s1 = iso_project(x1, y1, z1, ISO_SCALE)
    m1 = iso_project(*mid, scale=ISO_SCALE)
    e1 = iso_project(x2, y2, z2, ISO_SCALE)
    edges = []
    if s1 != m1:
        edges.append(Part.makeLine(
            App.Vector(s1[0] + _ORIGIN_X, s1[1] + _ORIGIN_Y, 0),
            App.Vector(m1[0] + _ORIGIN_X, m1[1] + _ORIGIN_Y, 0),
        ))
    if m1 != e1:
        edges.append(Part.makeLine(
            App.Vector(m1[0] + _ORIGIN_X, m1[1] + _ORIGIN_Y, 0),
            App.Vector(e1[0] + _ORIGIN_X, e1[1] + _ORIGIN_Y, 0),
        ))
    return Part.Compound(edges) if edges else None


def render_isometric(doc: App.Document, command: Dict[str, Any]) -> Dict[str, Any]:
    """Render simplified isometric pipe routing."""
    equipment = command.get("equipment", [])
    lines = command.get("lines", [])
    positions = _positions_3d(equipment)

    for eq in equipment:
        tag = eq.get("tag", "")
        p = positions.get(tag)
        if not p:
            continue
        sx, sy = iso_project(p[0], p[1], p[2], ISO_SCALE)
        circle = Part.makeCircle(8, App.Vector(sx + _ORIGIN_X, sy + _ORIGIN_Y, 0))
        obj = doc.addObject("Part::Feature", safe_object_name("ISO", tag))
        obj.Shape = circle
        oid = eq.get("object_id", "")
        if oid:
            bind_geometry_to_object(obj, oid, "Equipment", tag, eq.get("parameters") or {})
        draft_make_text(doc, [tag], sx + _ORIGIN_X - 10, sy + _ORIGIN_Y + 10, font_size=DEFAULT_TEXT_SIZE * 0.8)

    routed = 0
    iso_table = command.get("tables", {}).get("iso_pipe_list") or []
    for i, line in enumerate(lines):
        fr = line.get("from_tag", line.get("from", ""))
        to = line.get("to_tag", line.get("to", ""))
        p1 = positions.get(fr)
        p2 = positions.get(to)
        if not p1 or not p2:
            continue
        shape = _iso_pipe_segment(p1, p2)
        if not shape:
            continue
        line_no = line.get("line_no", f"L{i+1}")
        obj = doc.addObject("Part::Feature", safe_object_name("ISOPIPE", line_no))
        obj.Shape = shape
        oid = line.get("object_id", "")
        if oid:
            bind_geometry_to_object(obj, oid, "PipeRun", line_no, {
                "dn": line.get("dn"), "fluid": line.get("fluid", ""),
            })
        s1 = iso_project(*p1, scale=ISO_SCALE)
        e1 = iso_project(*p2, scale=ISO_SCALE)
        mx = (s1[0] + e1[0]) / 2 + _ORIGIN_X
        my = (s1[1] + e1[1]) / 2 + _ORIGIN_Y
        dn = line.get("dn", "")
        label = f"{line_no} DN{dn}" if dn else line_no
        draft_make_text(doc, [label], mx, my + 5, font_size=DEFAULT_TEXT_SIZE * 0.75)
        routed += 1

    note_y = 20.0
    draft_make_text(
        doc,
        ["简化单线轴测图（非真 3D 投影）"],
        20,
        note_y,
        font_size=DEFAULT_TEXT_SIZE * 0.7,
    )

    if not iso_table:
        iso_table = [
            {
                "line_no": l.get("line_no", ""),
                "from_tag": l.get("from_tag", ""),
                "to_tag": l.get("to_tag", ""),
                "dn": l.get("dn", ""),
            }
            for l in lines
        ]
    for k, row in enumerate(iso_table[:12]):
        text = (
            f"{row.get('line_no','')} | {row.get('from_tag','')}→{row.get('to_tag','')} | "
            f"DN{row.get('dn','')} | +{row.get('elev_from',0)}→+{row.get('elev_to',0)}"
        )
        draft_make_text(doc, [text], 20, note_y - (k + 1) * (DEFAULT_LINE_SPACING + 1), font_size=DEFAULT_TEXT_SIZE * 0.65)

    doc.recompute()
    return {
        "equipment_count": len(positions),
        "line_count": routed,
        "view_type": "isometric",
        "iso_table_rows": len(iso_table),
        "mode": "simplified_2d_iso",
    }
