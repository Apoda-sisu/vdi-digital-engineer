"""Parametric 3D plant preview — same PlantObject IDs as 2D views."""

from typing import Any, Dict, List, Tuple

import FreeCAD as App
import Part

from engine.object_factory import bind_geometry_to_object
from engine.utils import safe_object_name


def _build_vessel(params: dict):
    r = float(params.get("diameter_mm", 60)) / 2
    h = float(params.get("height_mm", r * 4))
    leg = r * 0.5
    body = Part.makeCylinder(r, h, App.Vector(0, 0, leg))
    top = Part.makeSphere(r, App.Vector(0, 0, leg + h))
    bottom = Part.makeSphere(r, App.Vector(0, 0, leg))
    return body.fuse(top).fuse(bottom)


def _build_pump(params: dict):
    r = float(params.get("diameter_mm", 40)) / 2
    base = Part.makeBox(r * 4, r * 2, r * 0.4, App.Vector(-r * 2, -r, 0))
    casing = Part.makeCylinder(r, r * 1.2, App.Vector(0, 0, r * 0.4), App.Vector(0, 1, 0))
    motor = Part.makeCylinder(r * 0.9, r * 2, App.Vector(0, r * 1.5, r * 0.4), App.Vector(0, 1, 0))
    return base.fuse(casing).fuse(motor)


def _build_column(params: dict):
    r = float(params.get("diameter_mm", 50)) / 2
    h = float(params.get("height_mm", r * 8))
    skirt = Part.makeCone(r * 1.1, r, r * 1.2)
    body = Part.makeCylinder(r, h, App.Vector(0, 0, r * 1.2))
    top = Part.makeSphere(r, App.Vector(0, 0, r * 1.2 + h))
    return skirt.fuse(body).fuse(top)


def _build_hx(params: dict):
    r = float(params.get("diameter_mm", 50)) / 2
    length = float(params.get("footprint_x", r * 4))
    shell = Part.makeCylinder(r, length, App.Vector(0, 0, r), App.Vector(1, 0, 0))
    return shell


def _build_generic(params: dict):
    lx = float(params.get("footprint_x", 50))
    ly = float(params.get("footprint_y", 50))
    h = float(params.get("height_mm", 80))
    return Part.makeBox(lx, ly, h, App.Vector(-lx / 2, -ly / 2, 0))


BUILDERS = {
    "pump": _build_pump,
    "vessel": _build_vessel,
    "tank": _build_vessel,
    "reactor": _build_vessel,
    "column": _build_column,
    "heat_exchanger": _build_hx,
    "compressor": _build_pump,
    "generic": _build_generic,
}


def _pipe_segment(p1: Tuple[float, float, float], p2: Tuple[float, float, float], radius: float = 3.0):
    v1 = App.Vector(*p1)
    v2 = App.Vector(*p2)
    direction = v2.sub(v1)
    if direction.Length < 0.5:
        return None
    return Part.makeCylinder(radius, direction.Length, v1, direction)


def _manhattan_pipe(p1: Tuple[float, float, float], p2: Tuple[float, float, float], radius: float = 3.0):
    x1, y1, z1 = p1
    x2, y2, z2 = p2
    waypoints = [(x1, y1, z1), (x2, y1, z1), (x2, y2, z1), (x2, y2, z2)]
    shapes = []
    for a, b in zip(waypoints, waypoints[1:]):
        seg = _pipe_segment(a, b, radius)
        if seg:
            shapes.append(seg)
    return Part.makeCompound(shapes) if shapes else None


def render_3d(doc: App.Document, command: Dict[str, Any]) -> Dict[str, Any]:
    """Render 3D equipment + orthogonal pipes from PlantModel snapshot."""
    equipment = command.get("equipment", [])
    lines = command.get("lines", [])
    positions: Dict[str, Tuple[float, float, float]] = {}

    for eq in equipment:
        tag = eq.get("tag", "")
        pos = eq.get("position") or {}
        params = eq.get("parameters") or {}
        if not tag or pos.get("x") is None:
            continue
        positions[tag] = (
            float(pos["x"]),
            float(pos["y"]),
            float(pos.get("z", params.get("elevation_mm", 0))),
        )

    built = 0
    for eq in equipment:
        tag = eq.get("tag", "")
        if tag not in positions:
            continue
        x, y, z = positions[tag]
        eq_type = (eq.get("type") or "generic").lower()
        params = eq.get("parameters") or {}
        builder = BUILDERS.get(eq_type, _build_generic)
        shape = builder(params)
        obj = doc.addObject("Part::Feature", safe_object_name("EQ3D", tag))
        obj.Shape = shape
        obj.Placement = App.Placement(App.Vector(x, y, z), App.Rotation())
        oid = eq.get("object_id", "")
        if oid:
            bind_geometry_to_object(obj, oid, "Equipment", tag, params)
        built += 1

    pipe_count = 0
    for i, line in enumerate(lines):
        fr = line.get("from_tag", line.get("from", ""))
        to = line.get("to_tag", line.get("to", ""))
        p1 = positions.get(fr)
        p2 = positions.get(to)
        if not p1 or not p2:
            continue
        dn = line.get("dn", 100)
        try:
            radius = max(float(dn) / 40.0, 2.0)
        except (TypeError, ValueError):
            radius = 3.0
        shape = _manhattan_pipe(p1, p2, radius)
        if not shape:
            continue
        line_no = line.get("line_no", f"L{i+1}")
        obj = doc.addObject("Part::Feature", safe_object_name("PIPE3D", line_no))
        obj.Shape = shape
        oid = line.get("object_id", "")
        if oid:
            bind_geometry_to_object(obj, oid, "PipeRun", line_no, {"dn": line.get("dn")})
        pipe_count += 1

    doc.recompute()
    return {
        "equipment_count": built,
        "line_count": pipe_count,
        "view_type": "3d",
        "export_hint": "STEP",
    }
