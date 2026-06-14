"""PFD (Process Flow Diagram) renderer."""

from typing import Any, Dict, List, Tuple

import FreeCAD as App
import Part

from engine.symbols import (
    DEFAULT_LINE_SPACING,
    DEFAULT_TEXT_SIZE,
    SYMBOL_SIZE,
    connection_ports,
    draw_equipment,
    get_symbol_extents,
)
from engine.object_factory import bind_geometry_to_object
from engine.pipe_router import equipment_bboxes, label_point_on_path, route_pipe_orthogonal
from engine.utils import draft_make_text, safe_object_name


_EPS = 1e-6


def _segment(a: Tuple[float, float], b: Tuple[float, float]):
    """Create line segment; skip zero-length (OCC raises on identical points)."""
    if abs(a[0] - b[0]) < _EPS and abs(a[1] - b[1]) < _EPS:
        return None
    va = App.Vector(a[0], a[1], 0)
    vb = App.Vector(b[0], b[1], 0)
    return Part.makeLine(va, vb)


def _draw_path(doc, name: str, waypoints: List[Tuple[float, float]]):
    segments = []
    for i in range(len(waypoints) - 1):
        seg = _segment(waypoints[i], waypoints[i + 1])
        if seg:
            segments.append(seg)
    if not segments:
        return None
    shape = segments[0] if len(segments) == 1 else Part.Compound(segments)
    obj = doc.addObject("Part::Feature", name)
    obj.Shape = shape
    return obj


def _draw_flow_arrow(doc, name: str, p1: Tuple[float, float], p2: Tuple[float, float], size: float = 4.0):
    """Small triangle arrow at p2 pointing from p1."""
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    length = (dx * dx + dy * dy) ** 0.5
    if length < _EPS:
        return None
    ux, uy = dx / length, dy / length
    px, py = -uy, ux
    tip = App.Vector(p2[0], p2[1], 0)
    left = App.Vector(p2[0] - ux * size + px * size * 0.5, p2[1] - uy * size + py * size * 0.5, 0)
    right = App.Vector(p2[0] - ux * size - px * size * 0.5, p2[1] - uy * size - py * size * 0.5, 0)
    wire = Part.makePolygon([left, tip, right, left])
    obj = doc.addObject("Part::Feature", name)
    obj.Shape = wire
    return obj


def _positions_from_command(equipment: List[Dict]) -> Dict[str, Tuple[float, float]]:
    """Use converter-computed positions only (no renderer-side grid layout)."""
    positions: Dict[str, Tuple[float, float]] = {}
    for eq in equipment:
        tag = eq.get("tag", "")
        pos = eq.get("position") or {}
        if tag and "x" in pos and "y" in pos:
            positions[tag] = (float(pos["x"]), float(pos["y"]))
    return positions


def _obstacle_boxes(
    positions: Dict[str, Tuple[float, float]],
    eq_by_tag: Dict[str, Dict],
    exclude_tags: Tuple[str, ...] = (),
    half_size: float = 20.0,
) -> List[Dict[str, float]]:
    tags = [t for t in positions if t not in exclude_tags]
    boxes = equipment_bboxes(
        {t: {"x": positions[t][0], "y": positions[t][1]} for t in tags},
        tags,
        half_size,
        half_size,
    )
    return list(boxes.values())


def _format_dn(dn: Any) -> str:
    if dn is None or dn == "":
        return ""
    s = str(dn).strip()
    if not s:
        return ""
    if s.upper().startswith("DN"):
        return s.upper()
    return f"DN{s}"


def _symbol_scale_from_command(command: Dict[str, Any], equipment_count: int) -> float:
    opts = command.get("options") or {}
    if opts.get("symbol_scale"):
        return float(opts["symbol_scale"])
    w, h = 320.0, 180.0
    area_per = (w * h) / max(equipment_count, 1)
    return max(8.0, min(40.0, (area_per ** 0.5) * 0.62))


def _use_simple_symbols(command: Dict[str, Any]) -> bool:
    """Compact GB primitives — cleaner TechDraw projection than JSON symbol library."""
    opts = command.get("options") or {}
    if opts.get("force_symbol_json"):
        return False
    return opts.get("use_simple_symbols", True)


def _pipe_line_attributes(line: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "from_tag": line.get("from_tag", line.get("from", "")),
        "to_tag": line.get("to_tag", line.get("to", "")),
        "stream_no": line.get("stream_no", ""),
        "dn": line.get("dn", ""),
        "fluid": line.get("fluid", ""),
        "phase": line.get("phase", ""),
        "design_P_MPaG": line.get("design_P_MPaG"),
        "design_T_C": line.get("design_T_C"),
        "material": line.get("material", ""),
        "insulation": line.get("insulation", ""),
    }


def _bind_pipe_geometry(
    doc: App.Document,
    line: Dict[str, Any],
    line_obj,
    label_obj=None,
) -> None:
    object_id = line.get("object_id", "")
    line_no = line.get("line_no", "")
    if not object_id or line_obj is None:
        return
    attrs = _pipe_line_attributes(line)
    bind_geometry_to_object(line_obj, object_id, "PipeRun", line_no, attrs)
    if label_obj is not None:
        bind_geometry_to_object(label_obj, object_id, "PipeRun", line_no, attrs)


def render_pfd(doc: App.Document, command: Dict[str, Any]) -> Dict[str, Any]:
    """Render PFD from CadCommand."""
    equipment = command.get("equipment", [])
    lines = command.get("lines", [])
    streams = command.get("streams", [])
    title_block = command.get("title_block") or {}

    symbol_size = _symbol_scale_from_command(command, len(equipment))
    font_size = max(2.5, DEFAULT_TEXT_SIZE * (symbol_size / SYMBOL_SIZE))

    positions = _positions_from_command(equipment)
    eq_by_tag = {eq.get("tag", ""): eq for eq in equipment}

    drawing_no = title_block.get("drawing_number", "PFD-100-001")
    drawing_title = title_block.get("drawing_title", "工艺流程图")

    # Title block carries drawing metadata — no model-space header (avoids TechDraw bbox blow-up)
    for eq in equipment:
        tag = eq.get("tag", "")
        if tag not in positions:
            continue
        eq_type = eq.get("type", "")
        object_id = eq.get("object_id", "")
        params = eq.get("parameters") or {}
        if params.get("equipment_type"):
            eq_type = params.get("equipment_type")
        pos = positions[tag]
        symbol_id = params.get("symbol_id") or eq.get("symbol_id", "")
        if _use_simple_symbols(command):
            symbol_id = ""
        obj = draw_equipment(doc, tag, eq_type, pos[0], pos[1], size=symbol_size, symbol_id=symbol_id)
        if object_id:
            bind_geometry_to_object(
                obj,
                object_id,
                "Equipment",
                tag,
                {**params, "equipment_type": eq_type},
            )
        _, hh = get_symbol_extents(eq_type, tag, symbol_size)
        draft_make_text(
            doc,
            [tag],
            pos[0],
            pos[1] - hh - 3,
            font_size=font_size,
            line_spacing=DEFAULT_LINE_SPACING,
        )

    labeled_lines = 0
    routed_lines = 0

    # Draw piping with obstacle-aware orthogonal routing
    for i, line in enumerate(lines):
        from_tag = line.get("from_tag", line.get("from", ""))
        to_tag = line.get("to_tag", line.get("to", ""))
        if from_tag not in positions or to_tag not in positions:
            continue
        fe = eq_by_tag.get(from_tag, {"tag": from_tag, "type": ""})
        te = eq_by_tag.get(to_tag, {"tag": to_tag, "type": ""})
        x1, y1 = positions[from_tag]
        x2, y2 = positions[to_tag]
        hw1, hh1 = get_symbol_extents(fe.get("type", ""), from_tag, symbol_size)
        hw2, hh2 = get_symbol_extents(te.get("type", ""), to_tag, symbol_size)
        (sx, sy), (ex, ey) = connection_ports(x1, y1, hw1, hh1, x2, y2, hw2, hh2)

        obstacles = _obstacle_boxes(positions, eq_by_tag, exclude_tags=(from_tag, to_tag), half_size=symbol_size / 2)
        waypoints = route_pipe_orthogonal((sx, sy), (ex, ey), obstacles)
        routed_lines += 1

        line_no = line.get("line_no", f"L{i+1}")
        line_obj = _draw_path(doc, safe_object_name("LINE", line_no), waypoints)

        if len(waypoints) >= 2:
            _draw_flow_arrow(
                doc,
                safe_object_name("ARROW", line_no),
                waypoints[-2],
                waypoints[-1],
            )

        dn_label = _format_dn(line.get("dn"))
        label_parts = [line_no]
        if dn_label:
            label_parts.append(dn_label)
            labeled_lines += 1
        lx, ly = label_point_on_path(waypoints)
        label_obj = draft_make_text(
            doc,
            [" ".join(label_parts)],
            lx,
            ly + 6,
            font_size=font_size * 0.85,
            line_spacing=DEFAULT_LINE_SPACING,
        )
        _bind_pipe_geometry(doc, line, line_obj, label_obj)

    # Stream labels on pipe midpoints (legacy stream table)
    for stream in streams:
        sno = stream.get("stream_no", "")
        from_t = stream.get("from_tag", "")
        to_t = stream.get("to_tag", "")
        if from_t not in positions or to_t not in positions:
            continue
        x1, y1 = positions[from_t]
        x2, y2 = positions[to_t]
        fe = eq_by_tag.get(from_t, {"tag": from_t, "type": ""})
        te = eq_by_tag.get(to_t, {"tag": to_t, "type": ""})
        hw1, hh1 = get_symbol_extents(fe.get("type", ""), from_t, symbol_size)
        hw2, hh2 = get_symbol_extents(te.get("type", ""), to_t, symbol_size)
        (sx, sy), (ex, ey) = connection_ports(x1, y1, hw1, hh1, x2, y2, hw2, hh2)
        obstacles = _obstacle_boxes(positions, eq_by_tag, exclude_tags=(from_t, to_t), half_size=symbol_size / 2)
        waypoints = route_pipe_orthogonal((sx, sy), (ex, ey), obstacles)
        mx, my = label_point_on_path(waypoints)
        flow = stream.get("flow", "")
        label = f"{sno} {flow}".strip()
        if label:
            draft_make_text(
                doc,
                [label],
                mx,
                my - 10,
                font_size=font_size * 0.75,
                line_spacing=DEFAULT_LINE_SPACING,
            )

    doc.recompute()
    return {
        "equipment_count": len(equipment),
        "line_count": len(lines),
        "stream_count": len(streams),
        "routed_lines": routed_lines,
        "labeled_dn_count": labeled_lines,
        "layout_source": "converter",
        "symbol_scale": symbol_size,
    }
