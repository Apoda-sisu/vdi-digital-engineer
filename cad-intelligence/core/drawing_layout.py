"""
设备布置平面图引擎（阶段 3）

drawing_type=layout -> 平面设备轮廓 + 定位尺寸 + 设备表 + TechDraw 页

所有几何画在 XY 平面（z=0），从 +Z 投影成图。
设备用简化矩形轮廓表示占用面积，标注设备位号和主要外形尺寸。
"""

import logging
import math
from typing import Any, Dict, List, Optional, Tuple

from core.drawing2d import (
    build_label_2d,
    create_techdraw_page,
    _add_spreadsheet_table,
    _vec,
    _find_font,
)

logger = logging.getLogger(__name__)

# 设备类型 -> 平面轮廓尺寸 (length_x, width_y) 单位 mm
FOOTPRINT_MAP: Dict[str, Tuple[float, float]] = {
    "pump": (60, 35),
    "valve": (20, 15),
    "vessel": (45, 45),
    "tank": (60, 60),
    "heat_exchanger": (120, 40),
    "exchanger": (120, 40),
    "reactor": (55, 55),
    "column": (40, 40),
    "compressor": (90, 50),
    "fan": (70, 50),
}

EQ_TABLE_HEADERS = ["位号", "类型", "X", "Y", "外形(长x宽)", "标高"]
EQ_TABLE_KEYS = ["tag", "type", "x_mm", "y_mm", "footprint", "elevation"]


def _get_footprint(obj: Dict) -> Tuple[float, float]:
    params = obj.get("parameters") or {}
    lx = params.get("length") or params.get("footprint_x")
    ly = params.get("width") or params.get("footprint_y")
    if lx and ly:
        return float(lx), float(ly)
    etype = (obj.get("ai_type") or obj.get("type") or "vessel").lower()
    return FOOTPRINT_MAP.get(etype, (50, 50))


def _build_footprint_rect(Part, App, lx: float, ly: float) -> Any:
    """矩形设备平面轮廓 + 对角线"""
    x0, y0 = -lx / 2, -ly / 2
    pts = [
        _vec(App, x0, y0),
        _vec(App, x0 + lx, y0),
        _vec(App, x0 + lx, y0 + ly),
        _vec(App, x0, y0 + ly),
        _vec(App, x0, y0),
    ]
    edges = [Part.makeLine(a, b) for a, b in zip(pts, pts[1:])]
    # 中心标记（十字）
    cx, cy = lx * 0.08, ly * 0.08
    edges.append(Part.makeLine(_vec(App, -cx, 0), _vec(App, cx, 0)))
    edges.append(Part.makeLine(_vec(App, 0, -cy), _vec(App, 0, cy)))
    return Part.makeCompound(edges)


def _build_dimension_line(Part, App, p1: Tuple, p2: Tuple, offset: float = 8) -> Any:
    """尺寸标注线（两端短竖线 + 中间连线 + 尺寸文字用 label 单独加）"""
    x1, y1 = float(p1[0]), float(p1[1])
    x2, y2 = float(p2[0]), float(p2[1])

    dx, dy = x2 - x1, y2 - y1
    length = math.sqrt(dx * dx + dy * dy)
    if length < 0.5:
        return None
    # 法向量
    nx, ny = -dy / length, dx / length

    # 偏移后的尺寸线
    ox1, oy1 = x1 + nx * offset, y1 + ny * offset
    ox2, oy2 = x2 + nx * offset, y2 + ny * offset

    tick = 4
    edges = [
        # 两端引出线
        Part.makeLine(_vec(App, x1, y1), _vec(App, ox1, oy1)),
        Part.makeLine(_vec(App, x2, y2), _vec(App, ox2, oy2)),
        # 尺寸线
        Part.makeLine(_vec(App, ox1, oy1), _vec(App, ox2, oy2)),
        # 两端短竖线（尺寸界线）
        Part.makeLine(
            _vec(App, ox1 + nx * tick, oy1 + ny * tick),
            _vec(App, ox1 - nx * tick, oy1 - ny * tick),
        ),
        Part.makeLine(
            _vec(App, ox2 + nx * tick, oy2 + ny * tick),
            _vec(App, ox2 - nx * tick, oy2 - ny * tick),
        ),
    ]
    return Part.makeCompound(edges)


def _build_grid(Part, App, x_min: float, y_min: float,
                x_max: float, y_max: float, spacing: float = 500) -> Any:
    """轴网线（点划线风格用虚线代替）"""
    edges = []
    x = x_min - (x_min % spacing)
    while x <= x_max + spacing:
        edges.append(Part.makeLine(_vec(App, x, y_min - 30), _vec(App, x, y_max + 30)))
        x += spacing
    y = y_min - (y_min % spacing)
    while y <= y_max + spacing:
        edges.append(Part.makeLine(_vec(App, x_min - 30, y), _vec(App, x_max + 30, y)))
        y += spacing
    if not edges:
        return None
    return Part.makeCompound(edges)


def build_layout2d(
    doc,
    scheme: Dict[str, Any],
    symbols: Dict[str, Dict],
    with_page: bool = True,
) -> Dict[str, Any]:
    """scheme JSON -> 设备布置平面图"""
    import FreeCAD as App
    import Part

    geometry = scheme.get("geometry", {})
    objects = geometry.get("objects", [])
    connections = geometry.get("connections", [])
    project_info = scheme.get("project_info", {})
    tables = scheme.get("tables") or {}

    pos_map: Dict[str, Tuple[float, float]] = {}
    drawables: List[Any] = []
    eq_table_rows: List[Dict[str, Any]] = []

    xs, ys = [], []

    for i, obj in enumerate(objects):
        pos = obj.get("position") or {}
        px = float(pos.get("x", 100 + i * 120))
        py = float(pos.get("y", 200))
        label = obj.get("label") or obj.get("id") or f"EQ-{i+1:03d}"
        etype = (obj.get("ai_type") or obj.get("type") or "vessel").lower()
        lx, ly = _get_footprint(obj)

        # 轮廓
        rect = _build_footprint_rect(Part, App, lx, ly)
        safe = "".join(c if c.isalnum() or c in "_-" else "_" for c in str(label)) or f"EQ{i}"
        fc = doc.addObject("Part::Feature", f"Lay_{safe}")
        fc.Label = str(label)
        fc.Shape = rect
        fc.Placement = App.Placement(App.Vector(px, py, 0), App.Rotation(0, 0, 0))
        drawables.append(fc)

        # 位号标注
        lbl = build_label_2d(doc, App, label, px - lx / 2, py + ly / 2 + 4, height=7)
        if lbl is not None and hasattr(lbl, "Shape"):
            drawables.append(lbl)

        # 外形尺寸标注
        dim_x = _build_dimension_line(Part, App, (px - lx / 2, py - ly / 2), (px + lx / 2, py - ly / 2), offset=-12)
        if dim_x:
            dx_fc = doc.addObject("Part::Feature", f"DimX_{safe}")
            dx_fc.Label = f"Dim_{label}_X"
            dx_fc.Shape = dim_x
            drawables.append(dx_fc)
            dl = build_label_2d(doc, App, f"{int(lx)}", px - 8, py - ly / 2 - 22, height=5)
            if dl is not None and hasattr(dl, "Shape"):
                drawables.append(dl)

        dim_y = _build_dimension_line(Part, App, (px - lx / 2, py - ly / 2), (px - lx / 2, py + ly / 2), offset=-12)
        if dim_y:
            dy_fc = doc.addObject("Part::Feature", f"DimY_{safe}")
            dy_fc.Label = f"Dim_{label}_Y"
            dy_fc.Shape = dim_y
            drawables.append(dy_fc)
            dl2 = build_label_2d(doc, App, f"{int(ly)}", px - lx / 2 - 22, py - 4, height=5)
            if dl2 is not None and hasattr(dl2, "Shape"):
                drawables.append(dl2)

        obj_id = obj.get("id") or label
        pos_map[obj_id] = (px, py)
        pos_map[str(label)] = (px, py)
        xs.append(px)
        ys.append(py)

        elevation = (obj.get("parameters") or {}).get("elevation") or (obj.get("parameters") or {}).get("elevation_mm") or "0"
        eq_table_rows.append({
            "tag": label,
            "type": etype,
            "x_mm": str(int(px)),
            "y_mm": str(int(py)),
            "footprint": f"{int(lx)}x{int(ly)}",
            "elevation": str(elevation),
        })

    # 管道连接（简化单线）
    pipe_count = 0
    for j, conn in enumerate(connections):
        p1 = pos_map.get(conn.get("from", ""))
        p2 = pos_map.get(conn.get("to", ""))
        if not p1 or not p2:
            continue
        from core.drawing2d import connection_waypoints
        waypoints = connection_waypoints(p1, p2)
        edges = [
            Part.makeLine(_vec(App, *a), _vec(App, *b))
            for a, b in zip(waypoints, waypoints[1:])
        ]
        if edges:
            line_no = conn.get("label") or conn.get("id") or f"L-{j+1:03d}"
            safe = "".join(c if c.isalnum() or c in "_-" else "_" for c in str(line_no))
            lfc = doc.addObject("Part::Feature", f"Pip_{safe}")
            lfc.Label = str(line_no)
            lfc.Shape = Part.makeCompound(edges)
            drawables.append(lfc)
            pipe_count += 1

    # 轴网
    if xs and ys:
        grid = _build_grid(Part, App, min(xs) - 100, min(ys) - 100, max(xs) + 200, max(ys) + 200, spacing=500)
        if grid:
            gfc = doc.addObject("Part::Feature", "Grid")
            gfc.Label = "轴网"
            gfc.Shape = grid
            drawables.append(gfc)

    doc.recompute()

    page = None
    if with_page and drawables:
        extra_tables = []
        if eq_table_rows:
            extra_tables.append({
                "sheet_name": "EqTable",
                "view_name": "EqTableView",
                "headers": EQ_TABLE_HEADERS,
                "keys": EQ_TABLE_KEYS,
                "rows": eq_table_rows,
                "x": 25, "y": 16, "scale": 0.55, "caption": "设备表",
                "max_rows": 20,
            })
        page = create_techdraw_page(
            doc, drawables, project_info,
            page_name="Layout_Page",
            part_view_name="Layout_View",
            drawing_title=project_info.get("drawing_title", "EQUIPMENT LAYOUT PLAN"),
            spreadsheet_tables=extra_tables or None,
        )

    return {
        "status": "success",
        "output_type": "2d_drawing",
        "metadata": {
            "object_count": len(objects),
            "connection_count": pipe_count,
            "equipment_table_rows": len(eq_table_rows),
            "techdraw_page": page.Name if page is not None else None,
            "mode": "layout2d",
        },
    }
