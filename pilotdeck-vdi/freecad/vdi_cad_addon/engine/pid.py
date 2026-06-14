"""P&ID renderer — instruments, valves, control loops, pipe table."""

from typing import Any, Dict, List, Tuple

import FreeCAD as App
import Part

from engine.layout import (
    INST_BUBBLE_RADIUS,
    PSV_BUBBLE_RADIUS,
    InstrumentPlacer,
    annotate_zone_below,
    annotate_zone_right,
    content_bounds,
    place_instrument,
    place_psv_bubble,
)
from engine.object_factory import bind_geometry_to_object
from engine.pfd import _positions_from_command, render_pfd
from engine.symbols import (
    DEFAULT_LINE_SPACING,
    DEFAULT_TEXT_SIZE,
    draw_instrument_bubble,
    draw_valve_by_type,
)
from engine.utils import draft_make_text, safe_object_name

try:
    from vdi_cad_core.plant_tables import build_pipe_table_from_model, pipe_table_row_text
except ImportError:
    build_pipe_table_from_model = None
    pipe_table_row_text = None


def _placement_xy(item: dict) -> Tuple[float, float] | None:
    pos = item.get("position") or {}
    if pos.get("x") is None or pos.get("y") is None:
        return None
    return float(pos["x"]), float(pos["y"])


def _draw_dashed_segment(doc, name: str, p1: Tuple[float, float], p2: Tuple[float, float], dash: float = 5.0, gap: float = 4.0):
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    length = (dx * dx + dy * dy) ** 0.5
    if length < 1e-6:
        return None
    ux, uy = dx / length, dy / length
    segments = []
    dist = 0.0
    drawing = True
    while dist < length:
        step = dash if drawing else gap
        nxt = min(dist + step, length)
        a = (p1[0] + ux * dist, p1[1] + uy * dist)
        b = (p1[0] + ux * nxt, p1[1] + uy * nxt)
        if drawing:
            va = App.Vector(a[0], a[1], 0)
            vb = App.Vector(b[0], b[1], 0)
            segments.append(Part.makeLine(va, vb))
        drawing = not drawing
        dist = nxt
    if not segments:
        return None
    obj = doc.addObject("Part::Feature", name)
    obj.Shape = segments[0] if len(segments) == 1 else Part.Compound(segments)
    return obj


def _draw_interlock_symbol(doc, name: str, x: float, y: float, cause: str, effect: str):
    s = 18.0
    pts = [
        App.Vector(x, y + s, 0),
        App.Vector(x + s, y, 0),
        App.Vector(x, y - s, 0),
        App.Vector(x - s, y, 0),
        App.Vector(x, y + s, 0),
    ]
    wire = Part.makePolygon(pts)
    obj = doc.addObject("Part::Feature", name)
    obj.Shape = wire
    obj.Label = f"{cause}→{effect}"
    draft_make_text(
        doc,
        [cause[:12], effect[:12]],
        x - s,
        y - s - 8,
        font_size=DEFAULT_TEXT_SIZE * 0.75,
        line_spacing=DEFAULT_LINE_SPACING * 0.8,
    )
    return obj


def _resolve_pipe_table(command: Dict[str, Any]) -> List[Dict[str, Any]]:
    plant_model = command.get("plant_model") or {}
    if build_pipe_table_from_model and plant_model.get("objects"):
        rows = build_pipe_table_from_model(plant_model)
        if rows:
            return rows
    tables = command.get("tables") or {}
    return tables.get("pipe_list") or command.get("lines") or []


def render_pid(doc: App.Document, command: Dict[str, Any]) -> Dict[str, Any]:
    """Render P&ID — PFD base + PlantObject-bound instruments/valves/PSV/signal lines."""
    base_stats = render_pfd(doc, command)

    equipment = command.get("equipment", [])
    instruments = command.get("instruments", [])
    valves = command.get("valves", [])
    safety_valves = command.get("safety_valves") or (command.get("tables") or {}).get("safety_valves", [])
    signal_lines = command.get("signal_lines", [])
    lines = command.get("lines", [])
    tables = command.get("tables", {})
    cause_effect = tables.get("cause_effect", command.get("cause_effect", []))

    positions = _positions_from_command(equipment)
    placer = InstrumentPlacer()

    # Inline valves (PlantObject class=Valve)
    valve_count = 0
    for i, valve in enumerate(valves):
        tag = valve.get("tag", f"XV{i}")
        xy = _placement_xy(valve)
        if not xy:
            continue
        vtype = valve.get("valve_type", "gate")
        obj = draw_valve_by_type(doc, tag, xy[0], xy[1], vtype, size=14)
        oid = valve.get("object_id", "")
        if oid:
            bind_geometry_to_object(
                obj,
                oid,
                "Valve",
                tag,
                {
                    "valve_type": vtype,
                    "on_line": valve.get("on_line", ""),
                    "fail_position": valve.get("fail_position", ""),
                },
            )
        valve_count += 1

    # Instruments with VDI binding
    inst_count = 0
    for i, inst in enumerate(instruments):
        tag = inst.get("tag", f"TI{i}")
        inst_type = inst.get("type", tag[:2] if len(tag) >= 2 else "TI")
        xy = _placement_xy(inst)
        if not xy:
            xy = place_instrument(placer, inst, positions, equipment, lines, i, INST_BUBBLE_RADIUS)
        obj = draw_instrument_bubble(doc, tag, xy[0], xy[1], inst_type, size=INST_BUBBLE_RADIUS * 2)
        oid = inst.get("object_id", "")
        if oid:
            bind_geometry_to_object(
                obj,
                oid,
                "Instrument",
                tag,
                {
                    "inst_type": inst_type,
                    "loop_id": inst.get("loop", ""),
                    "range": inst.get("range", ""),
                    "signal": inst.get("signal", ""),
                    "on_line": inst.get("on_line", ""),
                },
            )
        inst_count += 1

    # Safety valves (class=SafetyValve)
    psv_count = 0
    for k, sv in enumerate(safety_valves):
        tag = sv.get("tag", f"PSV-{k}")
        xy = _placement_xy(sv)
        if not xy:
            xy = place_psv_bubble(placer, sv, positions, equipment, k, PSV_BUBBLE_RADIUS)
        obj = draw_instrument_bubble(doc, tag, xy[0], xy[1], sv.get("type", "PSV"), size=PSV_BUBBLE_RADIUS * 2)
        oid = sv.get("object_id", "")
        if oid:
            bind_geometry_to_object(
                obj,
                oid,
                "SafetyValve",
                tag,
                {
                    "set_P_MPaG": sv.get("set_P_MPaG"),
                    "discharge": sv.get("discharge", ""),
                    "protected_equipment": sv.get("protected_equipment", ""),
                },
            )
        psv_count += 1

    # Control loop signal lines (dashed)
    signal_count = 0
    for j, seg in enumerate(signal_lines):
        p1 = seg.get("from") or {}
        p2 = seg.get("to") or {}
        if p1.get("x") is None or p2.get("x") is None:
            continue
        _draw_dashed_segment(
            doc,
            safe_object_name("SIG", f"{seg.get('loop_tag', j)}_{j}"),
            (float(p1["x"]), float(p1["y"])),
            (float(p2["x"]), float(p2["y"])),
        )
        signal_count += 1

    # Cause & effect — right margin
    ix0, iy0 = annotate_zone_right(positions, equipment)
    for j, ce in enumerate(cause_effect):
        cause = ce.get("cause", ce.get("trigger", ""))
        effect = ce.get("effect", ce.get("action", ""))
        ix = ix0 + (j % 2) * 90
        iy = iy0 - (j // 2) * 70
        _draw_interlock_symbol(doc, f"IL_{j}", ix, iy, cause, effect)

    # Pipe table from PipeRun PlantObjects (all rows)
    pipe_list = _resolve_pipe_table(command)
    row_count = len(pipe_list) + 1
    tx, ty = annotate_zone_below(positions, equipment, min(row_count, 40))
    header = "管道表 | 管段号 | 起止点 | 管径 | 介质"
    draft_make_text(doc, [header], tx, ty, font_size=DEFAULT_TEXT_SIZE, line_spacing=DEFAULT_LINE_SPACING)

    max_rows = min(len(pipe_list), 32)
    for k, pl in enumerate(pipe_list[:max_rows]):
        if pipe_table_row_text:
            row = pipe_table_row_text(pl)
        else:
            dn = pl.get("dn", "")
            dn_s = f"DN{dn}" if dn and not str(dn).upper().startswith("DN") else str(dn)
            row = (
                f"{pl.get('line_no', '')} | "
                f"{pl.get('from_tag', pl.get('from', ''))}→{pl.get('to_tag', pl.get('to', ''))} | "
                f"{dn_s} | {pl.get('fluid', '')}"
            )
        draft_make_text(
            doc,
            [row],
            tx,
            ty - (k + 1) * (DEFAULT_LINE_SPACING + 1),
            font_size=DEFAULT_TEXT_SIZE * 0.85,
            line_spacing=DEFAULT_LINE_SPACING,
        )

    doc.recompute()
    return {
        **base_stats,
        "instrument_count": inst_count,
        "valve_count": valve_count,
        "interlock_count": len(cause_effect),
        "psv_count": psv_count,
        "signal_line_count": signal_count,
        "pipe_table_rows": len(pipe_list),
        "control_loop_count": len(command.get("control_loops") or []),
    }
