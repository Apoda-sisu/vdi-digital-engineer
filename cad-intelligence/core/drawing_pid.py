"""
P&ID 工程图引擎（阶段 2 / R3）

在 PFD 基础上增加：
- 管线上 inline 阀门符号 + 阀位号
- 仪表气泡（TI/FIC/LSH 等）+ 仪表位号
- CP-2 完整管道表（设计/操作 T/P、材质、保温）
- 仪表索引表、因果图表（可选）
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

from core.drawing2d import (
    build_connection_2d,
    build_instrument_bubble_2d,
    build_inline_valve_2d,
    build_label_2d,
    build_symbol_2d,
    connection_label_point,
    connection_waypoints,
    create_techdraw_page,
)

logger = logging.getLogger(__name__)

PID_PIPE_HEADERS = [
    "管段号", "起点", "终点", "介质", "相态", "DN",
    "材质", "保温", "设计T", "设计P", "操作T", "操作P",
]
PID_PIPE_KEYS = [
    "line_no", "from_tag", "to_tag", "medium", "phase", "DN",
    "material", "insulation", "design_T_C", "design_P_MPa",
    "oper_T_C", "oper_P_MPa",
]

INST_HEADERS = ["位号", "类型", "回路", "位置", "量程", "信号"]
INST_KEYS = ["tag", "type", "loop", "location", "range", "signal"]

CE_HEADERS = ["原因", "结果", "传感器"]
CE_KEYS = ["cause", "effect", "sensor"]


def _resolve_instrument_position(
    inst: Dict[str, Any],
    pos_map: Dict[str, Tuple[float, float]],
    line_midpoints: Dict[str, Tuple[float, float]],
) -> Tuple[float, float]:
    """仪表放置：显式坐标 > 管线 > 设备"""
    pos = inst.get("position")
    if isinstance(pos, dict) and "x" in pos and "y" in pos:
        return float(pos["x"]), float(pos["y"])

    on_line = inst.get("on_line") or inst.get("line_no") or ""
    if on_line and on_line in line_midpoints:
        lx, ly = line_midpoints[on_line]
        return lx + 18, ly + 18

    loc = inst.get("location") or inst.get("on_equipment") or ""
    if loc in pos_map:
        px, py = pos_map[loc]
        return px + 25, py + 15

    return 400.0, 100.0


def _connection_valves(conn: Dict[str, Any]) -> List[Dict[str, Any]]:
    """连接上的阀门列表（支持 valve 单对象或 valves 数组）"""
    valves = conn.get("valves") or []
    single = conn.get("valve")
    if single and isinstance(single, dict):
        valves = [single] + list(valves)
    return [v for v in valves if isinstance(v, dict)]


def build_pid2d(
    doc,
    scheme: Dict[str, Any],
    symbols: Dict[str, Dict],
    with_page: bool = True,
) -> Dict[str, Any]:
    """scheme JSON -> 2D P&ID"""
    import FreeCAD as App
    import Part

    from core.scheme_schema import enrich_scheme, validate_for_pid

    scheme = enrich_scheme(scheme)
    validation = validate_for_pid(scheme, strict=False)
    for w in validation.get("warnings", [])[:5]:
        logger.info(f"P&ID 校验: {w}")

    geometry = scheme.get("geometry", {})
    objects = geometry.get("objects", [])
    connections = geometry.get("connections", [])
    instruments = geometry.get("instruments") or scheme.get("instruments") or []
    project_info = scheme.get("project_info", {})
    tables = scheme.get("tables") or {}
    pipe_list = tables.get("pipe_list") or []
    inst_list = tables.get("instrument_list") or _instrument_table_from_geometry(instruments)
    cause_effect = tables.get("cause_effect") or []

    pos_map: Dict[str, Tuple[float, float]] = {}
    line_midpoints: Dict[str, Tuple[float, float]] = {}
    drawables: List[Any] = []

    eq_labels = valve_count = inst_count = pipe_count = 0

    # --- 设备 ---
    for i, obj in enumerate(objects):
        symbol_id = obj.get("symbol_id", "")
        etype = (obj.get("ai_type") or obj.get("type") or "vessel").lower()
        symbol = symbols.get(symbol_id)
        scale = float(obj.get("scale", 1) or 1)
        label = obj.get("label") or obj.get("id") or f"EQ-{i+1:03d}"
        pos = obj.get("position") or {}
        px = float(pos.get("x", 100 + i * 100))
        py = float(pos.get("y", 200))
        rotation = float(obj.get("rotation", 0) or 0)

        compound = build_symbol_2d(symbol, etype, Part, App, scale)
        safe = "".join(c if c.isalnum() or c in "_-" else "_" for c in str(label)) or f"EQ{i}"
        fc = doc.addObject("Part::Feature", f"Sym_{safe}")
        fc.Label = str(label)
        fc.Shape = compound
        fc.Placement = App.Placement(
            App.Vector(px, py, 0),
            App.Rotation(App.Vector(0, 0, 1), rotation),
        )
        drawables.append(fc)

        obj_id = obj.get("id") or label
        pos_map[obj_id] = (px, py)
        pos_map[str(label)] = (px, py)

        lbl = build_label_2d(doc, App, label, px - 12, py - 38, height=7.0)
        if lbl is not None and hasattr(lbl, "Shape"):
            drawables.append(lbl)
            eq_labels += 1

    # --- 管线 + 管号 + 阀门 ---
    for j, conn in enumerate(connections):
        p1 = pos_map.get(conn.get("from", ""))
        p2 = pos_map.get(conn.get("to", ""))
        if not p1 or not p2:
            continue

        waypoints = connection_waypoints(p1, p2)
        line_no = conn.get("label") or conn.get("id") or f"L-{j+1:03d}"
        lx, ly = connection_label_point(waypoints)
        line_midpoints[line_no] = (lx, ly)
        if conn.get("id"):
            line_midpoints[conn["id"]] = (lx, ly)

        compound = build_connection_2d(Part, App, p1, p2)
        safe = "".join(c if c.isalnum() or c in "_-" else "_" for c in str(line_no))
        fc = doc.addObject("Part::Feature", f"Line_{safe}")
        fc.Label = str(line_no)
        fc.Shape = compound
        drawables.append(fc)
        pipe_count += 1

        # 管段号（P&ID 主标注，物流号次要）
        ll = build_label_2d(doc, App, str(line_no), lx - 12, ly - 10, height=5.0)
        if ll is not None and hasattr(ll, "Shape"):
            drawables.append(ll)
        sn = conn.get("stream_no") or ""
        if sn:
            sl = build_label_2d(doc, App, str(sn), lx - 8, ly + 6, height=4.0)
            if sl is not None and hasattr(sl, "Shape"):
                drawables.append(sl)

        # inline 阀门
        for vi, valve in enumerate(_connection_valves(conn)):
            vx = lx + vi * 14 - 7
            vy = ly - 2
            vshape = build_inline_valve_2d(Part, App, scale=0.4)
            vtag = valve.get("tag") or valve.get("label") or f"XV-{j+1}"
            vsafe = "".join(c if c.isalnum() or c in "_-" else "_" for c in str(vtag))
            vf = doc.addObject("Part::Feature", f"Valve_{vsafe}")
            vf.Label = str(vtag)
            vf.Shape = vshape
            vf.Placement = App.Placement(App.Vector(vx, vy, 0), App.Rotation(0, 0, 0))
            drawables.append(vf)
            vt = build_label_2d(doc, App, str(vtag), vx - 6, vy - 14, height=4.0)
            if vt is not None and hasattr(vt, "Shape"):
                drawables.append(vt)
            valve_count += 1

    # --- 仪表 ---
    for k, inst in enumerate(instruments):
        tag = inst.get("tag") or inst.get("label") or f"I-{k+1:03d}"
        itype = inst.get("type") or inst.get("function") or "TI"
        ix, iy = _resolve_instrument_position(inst, pos_map, line_midpoints)

        bubble = build_instrument_bubble_2d(Part, App, scale=0.9)
        isafe = "".join(c if c.isalnum() or c in "_-" else "_" for c in str(tag))
        inf = doc.addObject("Part::Feature", f"Inst_{isafe}")
        inf.Label = str(tag)
        inf.Shape = bubble
        inf.Placement = App.Placement(App.Vector(ix, iy, 0), App.Rotation(0, 0, 0))
        drawables.append(inf)

        # 气泡内功能字母 + 下方位号
        tl = build_label_2d(doc, App, str(itype), ix - 5, iy - 2, height=4.5)
        if tl is not None and hasattr(tl, "Shape"):
            drawables.append(tl)
        tag_l = build_label_2d(doc, App, str(tag), ix - 10, iy - 22, height=4.0)
        if tag_l is not None and hasattr(tag_l, "Shape"):
            drawables.append(tag_l)
        inst_count += 1

    doc.recompute()

    page = None
    if with_page and drawables:
        spreadsheet_tables = [
            {
                "sheet_name": "PipeTablePID",
                "view_name": "PipeTablePIDView",
                "headers": PID_PIPE_HEADERS,
                "keys": PID_PIPE_KEYS,
                "rows": pipe_list,
                "x": 25, "y": 16, "scale": 0.52, "caption": "管道表",
                "max_rows": 10,
            },
        ]
        if inst_list:
            spreadsheet_tables.append({
                "sheet_name": "InstTable",
                "view_name": "InstTableView",
                "headers": INST_HEADERS,
                "keys": INST_KEYS,
                "rows": inst_list,
                "x": 25, "y": 95, "scale": 0.52, "caption": "仪表表",
                "max_rows": 8,
            })
        if cause_effect:
            spreadsheet_tables.append({
                "sheet_name": "CauseEffectTable",
                "view_name": "CauseEffectView",
                "headers": CE_HEADERS,
                "keys": CE_KEYS,
                "rows": cause_effect,
                "x": 145, "y": 16, "scale": 0.52, "caption": "因果图",
                "max_rows": 8,
            })

        page = create_techdraw_page(
            doc,
            drawables,
            project_info,
            page_name="PID_Page",
            part_view_name="PID_View",
            drawing_title=project_info.get("drawing_title", "Piping and Instrumentation Diagram"),
            spreadsheet_tables=spreadsheet_tables,
        )

    return {
        "status": "success",
        "output_type": "2d_drawing",
        "validation": validation,
        "metadata": {
            "object_count": len(objects),
            "connection_count": pipe_count,
            "instrument_count": inst_count,
            "valve_count": valve_count,
            "equipment_label_count": eq_labels,
            "pipe_table_rows": len(pipe_list),
            "instrument_table_rows": len(inst_list),
            "cause_effect_rows": len(cause_effect),
            "techdraw_page": page.Name if page is not None else None,
            "mode": "pid2d",
        },
    }


def _instrument_table_from_geometry(instruments: List[Dict]) -> List[Dict[str, Any]]:
    rows = []
    for inst in instruments:
        rows.append({
            "tag": inst.get("tag") or "",
            "type": inst.get("type") or inst.get("function") or "",
            "loop": inst.get("loop") or "",
            "location": inst.get("location") or inst.get("on_line") or inst.get("on_equipment") or "",
            "range": inst.get("range") or "",
            "signal": inst.get("signal") or "",
        })
    return rows
