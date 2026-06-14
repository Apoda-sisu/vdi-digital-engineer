"""2D wireframe rendering from symbol JSON geometry.components."""

from typing import Any, Dict, List, Optional

import FreeCAD as App
import Part


def _vec(x: float, y: float, z: float = 0):
    return App.Vector(x, y, z)


def _component_edges(comp: Dict[str, Any], scale: float) -> List[Any]:
    ctype = comp.get("type", "")
    params = comp.get("params") or {}
    pos = comp.get("position") or {}
    ox = float(pos.get("x", 0)) * scale
    oy = float(pos.get("y", 0)) * scale

    if ctype == "circle":
        r = float(params.get("radius", 10)) * scale
        return [Part.makeCircle(r, _vec(ox, oy, 0))]
    if ctype == "line":
        start = params.get("start", [0, 0])
        end = params.get("end", [10, 0])
        p1 = _vec(float(start[0]) * scale + ox, float(start[1]) * scale + oy, 0)
        p2 = _vec(float(end[0]) * scale + ox, float(end[1]) * scale + oy, 0)
        return [Part.makeLine(p1, p2)]
    if ctype == "rectangle":
        w = float(params.get("width", 20)) * scale
        h = float(params.get("height", 20)) * scale
        pts = [
            _vec(ox, oy, 0),
            _vec(ox + w, oy, 0),
            _vec(ox + w, oy + h, 0),
            _vec(ox, oy + h, 0),
            _vec(ox, oy, 0),
        ]
        return [Part.makeLine(a, b) for a, b in zip(pts, pts[1:])]
    return []


def build_symbol_wire(symbol: Optional[Dict], scale: float = 1.0) -> Any:
    edges: List[Any] = []
    if symbol:
        for comp in (symbol.get("geometry") or {}).get("components") or []:
            edges.extend(_component_edges(comp, scale))
    if not edges:
        return Part.makeLine(_vec(0, 0, 0), _vec(10 * scale, 0, 0))
    if len(edges) == 1:
        return edges[0]
    return Part.makeCompound(edges)


def _center_shape(shape: Any) -> Any:
    """Move shape so its bounding-box center sits at origin."""
    try:
        bb = shape.BoundBox
        if bb.XLength < 1e-9 and bb.YLength < 1e-9:
            return shape
        cx = (bb.XMin + bb.XMax) / 2.0
        cy = (bb.YMin + bb.YMax) / 2.0
        centered = shape.copy()
        centered.translate(_vec(-cx, -cy, 0))
        return centered
    except Exception:
        return shape


def draw_symbol_at(
    doc,
    symbol_id: str,
    tag: str,
    x: float,
    y: float,
    scale: float = 1.0,
    symbol: Optional[Dict] = None,
) -> App.DocumentObject:
    from engine.symbol_manager import get_symbol_manager
    from engine.utils import safe_object_name

    sym = symbol or get_symbol_manager().get(symbol_id)
    shape = _center_shape(build_symbol_wire(sym, scale))
    obj = doc.addObject("Part::Feature", safe_object_name("SYM", tag))
    obj.Shape = shape
    obj.Placement = App.Placement(_vec(x, y, 0), App.Rotation())
    obj.Label = tag
    return obj
