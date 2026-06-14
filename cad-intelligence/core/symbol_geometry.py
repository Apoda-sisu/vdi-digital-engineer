"""从符号 JSON geometry.components 构建 FreeCAD Part 形状"""

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

CATEGORY_UI_MAP = {
    "全部": None,
    "设备": "equipment",
    "仪表": "instruments",
    "管道": "piping",
    "标注": "annotations",
}


def ui_category_matches(ui_label: str, symbol_category: str) -> bool:
    expected = CATEGORY_UI_MAP.get(ui_label)
    if expected is None:
        return True
    return symbol_category == expected


def build_shape_from_symbol(symbol: Dict[str, Any], Part: Any, scale: float = 1.0) -> Any:
    """根据符号定义构建复合形状"""
    geometry = symbol.get("geometry") or {}
    components = geometry.get("components") or []
    if not components:
        return _fallback_by_name(symbol, Part, scale)

    shapes: List[Any] = []
    for comp in components:
        sh = _component_to_shape(comp, Part, scale)
        if sh:
            shapes.append(sh)

    if not shapes:
        return _fallback_by_name(symbol, Part, scale)

    compound = shapes[0]
    for sh in shapes[1:]:
        compound = compound.fuse(sh)
    return compound


def _vec(Part: Any, x: float, y: float, z: float = 0):
    """FreeCAD.Vector 优先（Part 模块无 Vector 属性）"""
    try:
        import FreeCAD
        return FreeCAD.Vector(x, y, z)
    except ImportError:
        return Part.Vector(x, y, z)


def _component_to_shape(comp: Dict[str, Any], Part: Any, scale: float) -> Optional[Any]:
    ctype = comp.get("type", "")
    params = comp.get("params") or {}
    pos = comp.get("position") or {}
    ox = float(pos.get("x", 0)) * scale
    oy = float(pos.get("y", 0)) * scale

    if ctype == "circle":
        r = float(params.get("radius", 10)) * scale
        sh = Part.makeCylinder(r, max(r * 0.4, 2))
        sh.translate(_vec(Part, ox, oy, 0))
        return sh
    if ctype == "rectangle":
        w = float(params.get("width", 20)) * scale
        h = float(params.get("height", 20)) * scale
        sh = Part.makeBox(w, h, max(min(w, h) * 0.2, 2))
        sh.translate(_vec(Part, ox, oy, 0))
        return sh
    if ctype == "line":
        start = params.get("start", [0, 0])
        end = params.get("end", [10, 0])
        p1 = _vec(Part, float(start[0]) * scale + ox, float(start[1]) * scale + oy, 0)
        p2 = _vec(Part, float(end[0]) * scale + ox, float(end[1]) * scale + oy, 0)
        return Part.makeLine(p1, p2)
    return None


def _fallback_by_name(symbol: Dict[str, Any], Part: Any, scale: float) -> Any:
    name = symbol.get("name", "")
    cat = symbol.get("category", "")
    if "泵" in name or "pump" in name.lower():
        return Part.makeCylinder(20 * scale, 40 * scale)
    if "阀" in name or "valve" in name.lower():
        b1 = Part.makeBox(30 * scale, 10 * scale, 10 * scale)
        b2 = Part.makeBox(10 * scale, 30 * scale, 10 * scale)
        return b1.fuse(b2)
    if cat == "instruments":
        return Part.makeSphere(15 * scale)
    return Part.makeBox(50 * scale, 50 * scale, 10 * scale)
