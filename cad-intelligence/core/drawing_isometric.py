"""
简化管道单线图引擎（阶段 3）

drawing_type=isometric -> 正交管道路由 + 标高标注 + 管道表 + TechDraw 页

在 2D 平面上用 45° 等轴测风格简化表示管道走向（非真 3D 轴测投影）。
管段用三段折线表示：水平 X → 水平 Y → 垂直 Z（标高变化用虚线竖线表示）。
"""

import logging
import math
from typing import Any, Dict, List, Optional, Tuple

from core.drawing2d import (
    build_label_2d,
    create_techdraw_page,
    _add_spreadsheet_table,
    _vec,
)

logger = logging.getLogger(__name__)

ISO_PIPE_HEADERS = [
    "管段号", "起点", "终点", "DN", "标高起点", "标高终点", "介质", "材质",
]
ISO_PIPE_KEYS = [
    "line_no", "from_tag", "to_tag", "DN", "elev_from", "elev_to", "medium", "material",
]


def _iso_project(x: float, y: float, z: float = 0, scale: float = 0.5) -> Tuple[float, float]:
    """简化的等轴测投影：X→水平, Y→30°斜, Z→竖直"""
    sx = (x - y) * math.cos(math.radians(30)) * scale
    sy = (x + y) * math.sin(math.radians(30)) * scale + z * scale
    return sx, sy


def _build_iso_pipe_segment(Part, App, start_3d, end_3d, scale: float = 0.5) -> Any:
    """两段式折线：先走水平面，再走标高"""
    x1, y1, z1 = start_3d
    x2, y2, z2 = end_3d

    # 水平面中转点
    mid_3d = (x2, y2, z1)
    s1 = _iso_project(x1, y1, z1, scale)
    m1 = _iso_project(*mid_3d, scale=scale)
    e1 = _iso_project(x2, y2, z2, scale)

    edges = []
    if s1 != m1:
        edges.append(Part.makeLine(_vec(App, *s1), _vec(App, *m1)))
    if m1 != e1:
        edges.append(Part.makeLine(_vec(App, *m1), _vec(App, *e1)))

    if not edges:
        return None
    return Part.makeCompound(edges)


def _build_elevation_marker(Part, App, x_iso: float, y_iso: float, elev_mm: float) -> Any:
    """标高标记（三角 + 标高值用 label 单独加）"""
    s = 5
    pts = [
        _vec(App, x_iso - s, y_iso),
        _vec(App, x_iso + s, y_iso),
        _vec(App, x_iso, y_iso + s * 1.2),
        _vec(App, x_iso - s, y_iso),
    ]
    edges = [Part.makeLine(a, b) for a, b in zip(pts, pts[1:])]
    return Part.makeCompound(edges)


def build_isometric2d(
    doc,
    scheme: Dict[str, Any],
    symbols: Dict[str, Dict],
    with_page: bool = True,
) -> Dict[str, Any]:
    """scheme JSON -> 简化管道单线图"""
    import FreeCAD as App
    import Part

    geometry = scheme.get("geometry", {})
    objects = geometry.get("objects", [])
    connections = geometry.get("connections", [])
    project_info = scheme.get("project_info", {})
    tables = scheme.get("tables") or {}
    pipe_list = tables.get("pipe_list") or []

    pos_map: Dict[str, Tuple[float, float, float]] = {}
    drawables: List[Any] = []
    iso_table_rows: List[Dict[str, Any]] = []

    scale = 0.15  # 投影比例

    # 设备定位点（简化圆 + 位号）
    for i, obj in enumerate(objects):
        pos = obj.get("position") or {}
        px = float(pos.get("x", 100 + i * 120))
        py = float(pos.get("y", 200))
        pz = float(pos.get("z", 0))
        label = obj.get("label") or obj.get("id") or f"EQ-{i+1:03d}"

        sx, sy = _iso_project(px, py, pz, scale)
        # 设备定位圆
        circle = Part.makeCircle(8, _vec(App, sx, sy))
        safe = "".join(c if c.isalnum() or c in "_-" else "_" for c in str(label)) or f"EQ{i}"
        fc = doc.addObject("Part::Feature", f"Iso_{safe}")
        fc.Label = str(label)
        fc.Shape = circle
        drawables.append(fc)

        lbl = build_label_2d(doc, App, label, sx - 10, sy + 10, height=6)
        if lbl is not None and hasattr(lbl, "Shape"):
            drawables.append(lbl)

        obj_id = obj.get("id") or label
        pos_map[obj_id] = (px, py, pz)
        pos_map[str(label)] = (px, py, pz)

    # 管道段
    pipe_count = 0
    for j, conn in enumerate(connections):
        from_key = conn.get("from", "")
        to_key = conn.get("to", "")
        p1 = pos_map.get(from_key)
        p2 = pos_map.get(to_key)
        if not p1 or not p2:
            continue

        params = conn.get("parameters") or {}
        line_no = conn.get("label") or conn.get("id") or f"L-{j+1:03d}"
        dn = params.get("diameter") or params.get("DN") or ""
        medium = params.get("medium") or ""
        material = params.get("material") or ""

        # 默认标高差
        elev_from = float(p1[2])
        elev_to = float(p2[2])

        segment = _build_iso_pipe_segment(Part, App, p1, p2, scale)
        if segment is None:
            continue

        safe = "".join(c if c.isalnum() or c in "_-" else "_" for c in str(line_no))
        pfc = doc.addObject("Part::Feature", f"Pipe_{safe}")
        pfc.Label = str(line_no)
        pfc.Shape = segment
        drawables.append(pfc)
        pipe_count += 1

        # 管段号标注
        s1 = _iso_project(*p1, scale=scale)
        e1 = _iso_project(*p2, scale=scale)
        mx = (s1[0] + e1[0]) / 2
        my = (s1[1] + e1[1]) / 2
        ll = build_label_2d(doc, App, str(line_no), mx - 10, my + 5, height=4.5)
        if ll is not None and hasattr(ll, "Shape"):
            drawables.append(ll)

        # 标高标记
        if abs(elev_from) > 0.1:
            em = _build_elevation_marker(Part, App, s1[0], s1[1], elev_from)
            em_fc = doc.addObject("Part::Feature", f"Elv_{safe}_from")
            em_fc.Shape = em
            drawables.append(em_fc)
            el = build_label_2d(doc, App, f"+{int(elev_from)}", s1[0] + 7, s1[1] - 2, height=3.5)
            if el is not None and hasattr(el, "Shape"):
                drawables.append(el)
        if abs(elev_to) > 0.1:
            em2 = _build_elevation_marker(Part, App, e1[0], e1[1], elev_to)
            em2_fc = doc.addObject("Part::Feature", f"Elv_{safe}_to")
            em2_fc.Shape = em2
            drawables.append(em2_fc)
            el2 = build_label_2d(doc, App, f"+{int(elev_to)}", e1[0] + 7, e1[1] - 2, height=3.5)
            if el2 is not None and hasattr(el2, "Shape"):
                drawables.append(el2)

        iso_table_rows.append({
            "line_no": line_no,
            "from_tag": from_key,
            "to_tag": to_key,
            "DN": str(dn),
            "elev_from": str(int(elev_from)),
            "elev_to": str(int(elev_to)),
            "medium": medium,
            "material": material,
        })

    doc.recompute()

    page = None
    if with_page and drawables:
        extra_tables = []
        if iso_table_rows:
            extra_tables.append({
                "sheet_name": "IsoPipeTable",
                "view_name": "IsoPipeTableView",
                "headers": ISO_PIPE_HEADERS,
                "keys": ISO_PIPE_KEYS,
                "rows": iso_table_rows,
                "x": 25, "y": 16, "scale": 0.52, "caption": "管道表",
                "max_rows": 15,
            })
        page = create_techdraw_page(
            doc, drawables, project_info,
            page_name="Iso_Page",
            part_view_name="Iso_View",
            drawing_title=project_info.get("drawing_title", "PIPING ISOMETRIC DRAWING"),
            spreadsheet_tables=extra_tables or None,
        )

    return {
        "status": "success",
        "output_type": "2d_drawing",
        "metadata": {
            "object_count": len(objects),
            "connection_count": pipe_count,
            "iso_table_rows": len(iso_table_rows),
            "techdraw_page": page.Name if page is not None else None,
            "mode": "isometric2d",
        },
    }
