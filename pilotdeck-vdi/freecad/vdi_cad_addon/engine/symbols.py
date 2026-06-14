"""GB/HG process equipment symbols — 2D sketch primitives."""

from typing import Dict, List, Tuple

import FreeCAD as App
import Part

from engine.utils import draft_make_centered_text, safe_object_name

# Symbol size in mm (drawing units)
SYMBOL_SIZE = 40.0
DEFAULT_TEXT_SIZE = 4.0
DEFAULT_LINE_SPACING = 5.0

# ISA 仪表气泡 — 上下两行相对圆心的垂直偏移（mm）
# 上段（类型 PIC/PSV）：cy + UPPER；下段（位号）：cy - LOWER
# 下段偏低 → 减小 LOWER；下段偏高 → 增大 LOWER
BUBBLE_UPPER_Y_OFFSET = 2.5
BUBBLE_LOWER_Y_OFFSET = 1.8
BUBBLE_CHAR_WIDTH_RATIO = 0.52


def _add_sketch(doc, name: str, points: List[Tuple[float, float]], closed: bool = True):
    """Create a Part wire from 2D points."""
    vecs = [App.Vector(x, y, 0) for x, y in points]
    if closed and len(vecs) > 2:
        vecs.append(vecs[0])
    wire = Part.makePolygon(vecs)
    obj = doc.addObject("Part::Feature", name)
    obj.Shape = wire
    return obj


def draw_pump(doc, tag: str, x: float, y: float, size: float = SYMBOL_SIZE) -> App.DocumentObject:
    """Centrifugal pump symbol (circle + triangle)."""
    r = size / 2
    circle = Part.makeCircle(r, App.Vector(x, y, 0))
    tri = [
        (x - r * 0.6, y - r * 0.3),
        (x + r * 0.6, y),
        (x - r * 0.6, y + r * 0.3),
    ]
    wire = Part.Wire([Part.Edge(circle)])
    tri_wire = Part.makePolygon([App.Vector(px, py, 0) for px, py in tri + [tri[0]]])
    shape = Part.Compound([wire, tri_wire])
    obj = doc.addObject("Part::Feature", safe_object_name("SYM", tag))
    obj.Shape = shape
    obj.Label = tag
    return obj


def draw_vessel(doc, tag: str, x: float, y: float, size: float = SYMBOL_SIZE) -> App.DocumentObject:
    """Vertical vessel / tank (rectangle with rounded top)."""
    w, h = size * 0.6, size * 1.2
    pts = [
        (x - w / 2, y - h / 2),
        (x + w / 2, y - h / 2),
        (x + w / 2, y + h / 2 - w / 4),
        (x, y + h / 2),
        (x - w / 2, y + h / 2 - w / 4),
    ]
    return _add_sketch(doc, safe_object_name("SYM", tag), pts)


def draw_heat_exchanger(doc, tag: str, x: float, y: float, size: float = SYMBOL_SIZE) -> App.DocumentObject:
    """Shell & tube HX (circle with diagonal)."""
    r = size / 2
    circle = Part.makeCircle(r, App.Vector(x, y, 0))
    diag1 = Part.makeLine(App.Vector(x - r, y - r, 0), App.Vector(x + r, y + r, 0))
    diag2 = Part.makeLine(App.Vector(x - r, y + r, 0), App.Vector(x + r, y - r, 0))
    shape = Part.Compound([Part.Wire([Part.Edge(circle)]), diag1, diag2])
    obj = doc.addObject("Part::Feature", safe_object_name("SYM", tag))
    obj.Shape = shape
    obj.Label = tag
    return obj


def draw_reactor(doc, tag: str, x: float, y: float, size: float = SYMBOL_SIZE) -> App.DocumentObject:
    """Reactor (tall vessel with internal agitator line)."""
    obj = draw_vessel(doc, tag, x, y, size * 1.1)
    h = size * 1.2
    line = Part.makeLine(App.Vector(x, y - h / 2, 0), App.Vector(x, y + h / 2, 0))
    ag = doc.addObject("Part::Feature", safe_object_name("SYM", f"{tag}_ag"))
    ag.Shape = line
    return obj


def draw_column(doc, tag: str, x: float, y: float, size: float = SYMBOL_SIZE) -> App.DocumentObject:
    """Distillation column (tall narrow vessel)."""
    return draw_vessel(doc, tag, x, y, size * 1.5)


def draw_valve(doc, tag: str, x: float, y: float, size: float = SYMBOL_SIZE) -> App.DocumentObject:
    """Gate valve (bowtie shape)."""
    s = size / 3
    pts = [
        (x - s, y - s),
        (x, y),
        (x - s, y + s),
        (x + s, y + s),
        (x, y),
        (x + s, y - s),
    ]
    return _add_sketch(doc, safe_object_name("SYM", tag), pts, closed=False)


def draw_ball_valve(doc, tag: str, x: float, y: float, size: float = SYMBOL_SIZE) -> App.DocumentObject:
    """Ball valve — filled bowtie with center circle."""
    s = size / 3
    pts = [
        (x - s, y - s),
        (x, y),
        (x - s, y + s),
        (x + s, y + s),
        (x, y),
        (x + s, y - s),
    ]
    obj = _add_sketch(doc, safe_object_name("SYM", tag), pts, closed=False)
    circle = Part.makeCircle(s * 0.35, App.Vector(x, y, 0))
    obj.Shape = Part.Compound([obj.Shape, Part.Wire([Part.Edge(circle)])])
    return obj


def draw_check_valve(doc, tag: str, x: float, y: float, size: float = SYMBOL_SIZE) -> App.DocumentObject:
    """Check valve — triangle pointing flow direction."""
    s = size / 3
    pts = [
        (x - s, y - s * 0.8),
        (x + s * 0.6, y),
        (x - s, y + s * 0.8),
        (x - s, y - s * 0.8),
    ]
    stem = Part.makeLine(App.Vector(x + s * 0.6, y - s), App.Vector(x + s * 0.6, y + s))
    shape = Part.Compound([Part.makePolygon([App.Vector(px, py, 0) for px, py in pts]), stem])
    obj = doc.addObject("Part::Feature", safe_object_name("SYM", tag))
    obj.Shape = shape
    return obj


def draw_valve_by_type(
    doc, tag: str, x: float, y: float, valve_type: str = "gate", size: float = SYMBOL_SIZE
) -> App.DocumentObject:
    vt = (valve_type or "gate").lower()
    if vt == "ball":
        return draw_ball_valve(doc, tag, x, y, size)
    if vt == "check":
        return draw_check_valve(doc, tag, x, y, size)
    return draw_valve(doc, tag, x, y, size)


def draw_instrument_bubble(
    doc, tag: str, x: float, y: float, inst_type: str = "TI", size: float = 20.0
) -> App.DocumentObject:
    """ISA instrument bubble (circle + centered type/tag text)."""
    r = size / 2
    circle = Part.makeCircle(r, App.Vector(x, y, 0))
    obj = doc.addObject("Part::Feature", safe_object_name("INST", tag))
    obj.Shape = Part.Wire([Part.Edge(circle)])
    obj.Label = f"{inst_type}\n{tag}"

    font_size = max(2.5, size * 0.13)
    scale = size / 22.0
    draft_make_centered_text(
        doc,
        [inst_type, tag],
        x,
        y,
        font_size=font_size,
        upper_y_offset=BUBBLE_UPPER_Y_OFFSET * scale,
        lower_y_offset=BUBBLE_LOWER_Y_OFFSET * scale,
        char_width_ratio=BUBBLE_CHAR_WIDTH_RATIO,
    )
    return obj


def draw_compressor(doc, tag: str, x: float, y: float, size: float = SYMBOL_SIZE) -> App.DocumentObject:
    """Compressor symbol (circle + vertical arrow)."""
    r = size / 2
    circle = Part.makeCircle(r, App.Vector(x, y, 0))
    shaft = Part.makeLine(App.Vector(x, y - r * 0.5, 0), App.Vector(x, y + r * 0.5, 0))
    shape = Part.Compound([Part.Wire([Part.Edge(circle)]), shaft])
    obj = doc.addObject("Part::Feature", safe_object_name("SYM", tag))
    obj.Shape = shape
    obj.Label = tag
    return obj


def draw_generic(doc, tag: str, x: float, y: float, size: float = SYMBOL_SIZE) -> App.DocumentObject:
    """Generic equipment (rectangle)."""
    w, h = size * 0.8, size * 0.8
    pts = [
        (x - w / 2, y - h / 2),
        (x + w / 2, y - h / 2),
        (x + w / 2, y + h / 2),
        (x - w / 2, y + h / 2),
    ]
    return _add_sketch(doc, safe_object_name("SYM", tag), pts)


# Tag prefix → symbol type mapping
TAG_PREFIX_MAP: Dict[str, str] = {
    "P": "pump",
    "E": "heat_exchanger",
    "T": "vessel",
    "V": "vessel",
    "R": "reactor",
    "C": "column",
    "D": "column",
    "F": "vessel",
    "K": "compressor",
}


def infer_type_from_tag(tag: str, explicit_type: str = "") -> str:
    if explicit_type:
        t = explicit_type.lower()
        if "pump" in t:
            return "pump"
        if "exchanger" in t or "hx" in t:
            return "heat_exchanger"
        if "reactor" in t:
            return "reactor"
        if "column" in t or "tower" in t:
            return "column"
        if "valve" in t:
            return "valve"
        if "tank" in t or "vessel" in t:
            return "vessel"
        if "compressor" in t:
            return "compressor"
    prefix = tag.split("-")[0][:1].upper() if tag else ""
    return TAG_PREFIX_MAP.get(prefix, "generic")


def get_symbol_extents(eq_type: str, tag: str, size: float = SYMBOL_SIZE) -> Tuple[float, float]:
    """Return (half_width, half_height) for connection routing."""
    resolved = infer_type_from_tag(tag, eq_type)
    if resolved in ("vessel",):
        return size * 0.3, size * 0.6
    if resolved == "column":
        return size * 0.3, size * 0.9
    if resolved == "reactor":
        return size * 0.33, size * 0.66
    if resolved in ("pump", "heat_exchanger", "compressor"):
        return size / 2, size / 2
    if resolved == "valve":
        s = size / 3
        return s, s
    return size * 0.4, size * 0.4


def connection_ports(
    x1: float,
    y1: float,
    hw1: float,
    hh1: float,
    x2: float,
    y2: float,
    hw2: float,
    hh2: float,
) -> Tuple[Tuple[float, float], Tuple[float, float]]:
    """Exit/entry points on symbol edges facing each other."""
    dx = x2 - x1
    dy = y2 - y1
    if abs(dx) >= abs(dy):
        if dx >= 0:
            return (x1 + hw1, y1), (x2 - hw2, y2)
        return (x1 - hw1, y1), (x2 + hw2, y2)
    if dy >= 0:
        return (x1, y1 + hh1), (x2, y2 - hh2)
    return (x1, y1 - hh1), (x2, y2 + hh2)


def draw_equipment(
    doc,
    tag: str,
    eq_type: str,
    x: float,
    y: float,
    size: float = SYMBOL_SIZE,
    symbol_id: str = "",
) -> App.DocumentObject:
    """Draw equipment symbol by type or PlantObject symbol_id."""
    if symbol_id:
        try:
            from engine.symbol_renderer import draw_symbol_at
            from engine.symbol_manager import get_symbol_manager

            mgr = get_symbol_manager()
            if mgr.get(symbol_id):
                scale = size / 40.0
                return draw_symbol_at(doc, symbol_id, tag, x, y, scale=scale)
        except Exception:
            pass

    resolved = infer_type_from_tag(tag, eq_type)
    drawers = {
        "pump": draw_pump,
        "vessel": draw_vessel,
        "heat_exchanger": draw_heat_exchanger,
        "reactor": draw_reactor,
        "column": draw_column,
        "valve": draw_valve,
        "compressor": draw_compressor,
    }
    drawer = drawers.get(resolved, draw_generic)
    return drawer(doc, tag, x, y, size)
