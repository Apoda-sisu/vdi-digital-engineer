"""
2D PFD 工程图引擎（R1）

scheme JSON -> 平面符号 + 正交管线 + 位号标注 + TechDraw 图纸页（GB 图框）

所有 2D 几何画在 XY 平面（z=0），TechDraw 从 +Z 方向投影成图。
"""

import logging
import os
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/Library/Fonts/Arial.ttf",
]


def _find_font() -> Optional[str]:
    for f in FONT_CANDIDATES:
        if os.path.isfile(f):
            return f
    return None


def _vec(App, x, y, z=0.0):
    return App.Vector(float(x), float(y), float(z))


# ------------------------------------------------------------ 符号 2D 渲染 --


def _component_edges(comp: Dict, Part, App, scale: float) -> List[Any]:
    """符号组件 -> 平面边线列表"""
    ctype = comp.get("type", "")
    params = comp.get("params") or {}
    pos = comp.get("position") or {}
    ox = float(pos.get("x", 0)) * scale
    oy = float(pos.get("y", 0)) * scale

    if ctype == "circle":
        r = float(params.get("radius", 10)) * scale
        circle = Part.makeCircle(r, _vec(App, ox, oy, 0))
        return [circle]
    if ctype == "rectangle":
        w = float(params.get("width", 20)) * scale
        h = float(params.get("height", 20)) * scale
        pts = [
            _vec(App, ox, oy), _vec(App, ox + w, oy),
            _vec(App, ox + w, oy + h), _vec(App, ox, oy + h), _vec(App, ox, oy),
        ]
        return [Part.makeLine(a, b) for a, b in zip(pts, pts[1:])]
    if ctype == "line":
        start = params.get("start", [0, 0])
        end = params.get("end", [10, 0])
        p1 = _vec(App, float(start[0]) * scale + ox, float(start[1]) * scale + oy)
        p2 = _vec(App, float(end[0]) * scale + ox, float(end[1]) * scale + oy)
        return [Part.makeLine(p1, p2)]
    if ctype == "triangle":
        size = float(params.get("size", 10)) * scale
        pts = [
            _vec(App, ox, oy + size), _vec(App, ox - size * 0.87, oy - size * 0.5),
            _vec(App, ox + size * 0.87, oy - size * 0.5), _vec(App, ox, oy + size),
        ]
        return [Part.makeLine(a, b) for a, b in zip(pts, pts[1:])]
    return []


def _fallback_symbol_edges(etype: str, Part, App, scale: float) -> List[Any]:
    """无符号定义时的 GB 风格简化符号"""
    edges = []
    if etype in ("pump",):
        edges.append(Part.makeCircle(15 * scale, _vec(App, 0, 0)))
        edges.append(Part.makeLine(_vec(App, -10 * scale, 11 * scale), _vec(App, 10 * scale, 11 * scale)))
        edges.append(Part.makeLine(_vec(App, 0, 15 * scale), _vec(App, -10 * scale, 11 * scale)))
        edges.append(Part.makeLine(_vec(App, 0, 15 * scale), _vec(App, 10 * scale, 11 * scale)))
    elif etype in ("valve",):
        s = 10 * scale
        pts = [
            _vec(App, -s, s), _vec(App, s, -s), _vec(App, s, s), _vec(App, -s, -s), _vec(App, -s, s),
        ]
        edges += [Part.makeLine(a, b) for a, b in zip(pts, pts[1:])]
    elif etype in ("heat_exchanger", "exchanger"):
        edges.append(Part.makeCircle(18 * scale, _vec(App, 0, 0)))
        edges.append(Part.makeLine(_vec(App, -18 * scale, 0), _vec(App, -6 * scale, 0)))
        edges.append(Part.makeLine(_vec(App, -6 * scale, 0), _vec(App, 0, 8 * scale)))
        edges.append(Part.makeLine(_vec(App, 0, 8 * scale), _vec(App, 6 * scale, -8 * scale)))
        edges.append(Part.makeLine(_vec(App, 6 * scale, -8 * scale), _vec(App, 18 * scale, 0)))
    elif etype in ("column", "reactor"):
        w, h = 24 * scale, 60 * scale
        pts = [
            _vec(App, -w / 2, -h / 2), _vec(App, w / 2, -h / 2),
            _vec(App, w / 2, h / 2), _vec(App, -w / 2, h / 2), _vec(App, -w / 2, -h / 2),
        ]
        edges += [Part.makeLine(a, b) for a, b in zip(pts, pts[1:])]
    else:  # vessel/tank 等
        w, h = 36 * scale, 28 * scale
        pts = [
            _vec(App, -w / 2, -h / 2), _vec(App, w / 2, -h / 2),
            _vec(App, w / 2, h / 2), _vec(App, -w / 2, h / 2), _vec(App, -w / 2, -h / 2),
        ]
        edges += [Part.makeLine(a, b) for a, b in zip(pts, pts[1:])]
    return edges


def build_symbol_2d(symbol: Optional[Dict], etype: str, Part, App, scale: float = 1.0) -> Any:
    """符号 JSON / 类型 -> 平面线框 compound"""
    edges: List[Any] = []
    if symbol:
        for comp in (symbol.get("geometry") or {}).get("components") or []:
            edges.extend(_component_edges(comp, Part, App, scale))
    if not edges:
        edges = _fallback_symbol_edges(etype, Part, App, scale)
    return Part.makeCompound(edges)


# ------------------------------------------------------------ 管线与标注 --


def connection_waypoints(p1: Tuple, p2: Tuple) -> List[Tuple[float, float]]:
    """正交折线路径点（不含箭头）"""
    x1, y1 = float(p1[0]), float(p1[1])
    x2, y2 = float(p2[0]), float(p2[1])
    midx = (x1 + x2) / 2

    pts = [(x1, y1)]
    if abs(y1 - y2) > 0.5 and abs(x1 - x2) > 0.5:
        pts += [(midx, y1), (midx, y2)]
    elif abs(y1 - y2) > 0.5:
        pts += [(x1, y2)]
    pts.append((x2, y2))

    dedup = [pts[0]]
    for pt in pts[1:]:
        if pt != dedup[-1]:
            dedup.append(pt)
    return dedup


def connection_label_point(waypoints: List[Tuple[float, float]]) -> Tuple[float, float]:
    """管线上标注位置（最长线段中点）"""
    if len(waypoints) < 2:
        return waypoints[0] if waypoints else (0.0, 0.0)
    best_seg = (waypoints[0], waypoints[1])
    best_len = 0.0
    for a, b in zip(waypoints, waypoints[1:]):
        length = ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5
        if length >= best_len:
            best_len = length
            best_seg = (a, b)
    a, b = best_seg
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)


def build_connection_2d(Part, App, p1: Tuple, p2: Tuple, clearance: float = 25.0) -> Any:
    """正交折线 + 末端流向箭头"""
    dedup = connection_waypoints(p1, p2)

    edges = [
        Part.makeLine(_vec(App, *a), _vec(App, *b))
        for a, b in zip(dedup, dedup[1:])
    ]

    # 箭头（指向终点）
    ax, ay = dedup[-1]
    px, py = dedup[-2]
    dx, dy = ax - px, ay - py
    norm = max((dx * dx + dy * dy) ** 0.5, 0.001)
    ux, uy = dx / norm, dy / norm
    size = 6.0
    base_x, base_y = ax - ux * size, ay - uy * size
    perp_x, perp_y = -uy * size * 0.4, ux * size * 0.4
    edges.append(Part.makeLine(_vec(App, ax, ay), _vec(App, base_x + perp_x, base_y + perp_y)))
    edges.append(Part.makeLine(_vec(App, ax, ay), _vec(App, base_x - perp_x, base_y - perp_y)))

    return Part.makeCompound(edges)


def build_label_2d(doc, App, text: str, x: float, y: float, height: float = 8.0) -> Optional[Any]:
    """位号标注: 优先 Draft ShapeString（可进 TechDraw），否则 App::Annotation"""
    font = _find_font()
    if font:
        try:
            import Draft
            ss = Draft.make_shapestring(String=str(text), FontFile=font, Size=height)
            ss.Placement = App.Placement(
                App.Vector(float(x), float(y), 0), App.Rotation(0, 0, 0)
            )
            return ss
        except Exception as e:
            logger.debug(f"ShapeString 失败: {e}")
    try:
        ann = doc.addObject("App::Annotation", f"Label_{text}".replace("-", "_"))
        ann.LabelText = [str(text)]
        ann.Position = App.Vector(float(x), float(y), 0)
        return ann
    except Exception:
        return None


# ------------------------------------------------------------ TechDraw 页 --


def _find_template() -> Optional[str]:
    """优先自带 GB 模板，回退 FreeCAD 自带 A3"""
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(here, "..", "templates", "GB_A3_Landscape.svg"),
        "/Applications/FreeCAD.app/Contents/Resources/share/Mod/TechDraw/Templates/Default_Template_A4_Landscape.svg",
    ]
    for c in candidates:
        path = os.path.abspath(c)
        if os.path.isfile(path):
            return path
    return None


def create_techdraw_page(
    doc,
    source_objects: List[Any],
    project_info: Dict,
    scale: float = 0.5,
    pipe_list: Optional[List[Dict[str, Any]]] = None,
    page_name: str = "PFD_Page",
    part_view_name: str = "PFD_View",
    drawing_title: Optional[str] = None,
    spreadsheet_tables: Optional[List[Dict[str, Any]]] = None,
) -> Optional[Any]:
    """创建 TechDraw 图纸页（GB A3 图框 + 俯视投影 + 可选多表）"""
    try:
        import FreeCAD as App

        page = doc.addObject("TechDraw::DrawPage", page_name)
        template_path = _find_template()
        if template_path:
            tpl = doc.addObject("TechDraw::DrawSVGTemplate", "Template")
            tpl.Template = template_path
            page.Template = tpl
            title = drawing_title or project_info.get("drawing_title", "PROCESS FLOW DIAGRAM")
            fields = {
                "DrawingNumber": project_info.get("drawing_number", ""),
                "ProjectName": project_info.get("project_name", ""),
                "DrawingTitle": title,
                "Scale": f"1:{int(1/scale)}" if scale < 1 else f"{int(scale)}:1",
                "Revision": project_info.get("revision", "A"),
            }
            try:
                texts = dict(tpl.EditableTexts)
                for k, v in fields.items():
                    if k in texts and v:
                        texts[k] = str(v)
                tpl.EditableTexts = texts
            except Exception:
                pass

        view = doc.addObject("TechDraw::DrawViewPart", part_view_name)
        page.addView(view)
        view.Source = source_objects
        view.Direction = App.Vector(0, 0, 1)
        view.XDirection = App.Vector(1, 0, 0)
        view.Scale = scale
        view.X = 200
        view.Y = 150

        if pipe_list and not spreadsheet_tables:
            _add_spreadsheet_table(
                doc, page,
                sheet_name="PipeTable",
                view_name="PipeTableView",
                headers=["管段号", "物流号", "起点", "终点", "DN", "介质", "流量"],
                keys=["line_no", "stream_no", "from_tag", "to_tag", "DN", "medium", "flow"],
                rows=pipe_list,
                x=28, y=18, scale=0.65, caption="管道表",
            )
        elif spreadsheet_tables:
            for tbl in spreadsheet_tables:
                _add_spreadsheet_table(doc, page, **tbl)

        doc.recompute()
        return page
    except Exception as e:
        logger.warning(f"TechDraw 页面创建失败（几何仍然可用）: {e}")
        return None


def _col_letter(n: int) -> str:
    """0 -> A, 1 -> B ..."""
    result = ""
    n += 1
    while n:
        n, rem = divmod(n - 1, 26)
        result = chr(65 + rem) + result
    return result


def _add_spreadsheet_table(
    doc,
    page,
    sheet_name: str,
    view_name: str,
    headers: List[str],
    keys: List[str],
    rows: List[Dict[str, Any]],
    x: float = 28,
    y: float = 18,
    scale: float = 0.65,
    caption: str = "",
    max_rows: int = 15,
):
    """TechDraw 页上添加 Spreadsheet 表格视图"""
    data_rows = rows[:max_rows]
    sheet = doc.addObject("Spreadsheet::Sheet", sheet_name)
    for c, h in enumerate(headers):
        sheet.set(f"{_col_letter(c)}1", h)
    for r, row in enumerate(data_rows, start=2):
        for c, key in enumerate(keys):
            val = row.get(key, "")
            sheet.set(f"{_col_letter(c)}{r}", str(val) if val is not None else "")

    last_row = len(data_rows) + 1
    last_col = _col_letter(len(headers) - 1)
    cell_end = f"{last_col}{last_row}"

    sv = doc.addObject("TechDraw::DrawViewSpreadsheet", view_name)
    page.addView(sv)
    sv.Source = sheet
    sv.CellStart = "A1"
    sv.CellEnd = cell_end
    sv.X = x
    sv.Y = y
    if hasattr(sv, "Scale"):
        sv.Scale = scale
    if caption and hasattr(sv, "Caption"):
        sv.Caption = caption


def _add_pipe_table_view(doc, page, pipe_list: List[Dict[str, Any]]):
    """PFD 管道表（兼容旧调用）"""
    _add_spreadsheet_table(
        doc, page,
        sheet_name="PipeTable",
        view_name="PipeTableView",
        headers=["管段号", "物流号", "起点", "终点", "DN", "介质", "流量"],
        keys=["line_no", "stream_no", "from_tag", "to_tag", "DN", "medium", "flow"],
        rows=pipe_list,
        x=28, y=18, scale=0.65, caption="管道表",
    )


def build_instrument_bubble_2d(Part, App, scale: float = 1.0) -> Any:
    """ISA 风格仪表气泡（圆 + 十字参考线）"""
    r = 10.0 * scale
    edges = [
        Part.makeCircle(r, _vec(App, 0, 0)),
        Part.makeLine(_vec(App, -r, 0), _vec(App, r, 0)),
        Part.makeLine(_vec(App, 0, -r), _vec(App, 0, r)),
    ]
    return Part.makeCompound(edges)


def build_inline_valve_2d(Part, App, scale: float = 0.35) -> Any:
    """管线上闸阀符号（蝶形）"""
    return build_symbol_2d(None, "valve", Part, App, scale)


# ------------------------------------------------------------ 场景级构建 --


def build_pfd2d(doc, scheme: Dict[str, Any], symbols: Dict[str, Dict],
                with_page: bool = True) -> Dict[str, Any]:
    """scheme JSON -> 2D PFD（符号 + 管线 + 物流/管号 + 管道表 + 图纸页）"""
    import FreeCAD as App
    import Part

    from core.scheme_schema import enrich_scheme, validate_for_pfd

    scheme = enrich_scheme(scheme)
    validation = validate_for_pfd(scheme, strict=False)
    if validation["warnings"]:
        for w in validation["warnings"][:5]:
            logger.info(f"PFD 校验: {w}")

    geometry = scheme.get("geometry", {})
    objects = geometry.get("objects", [])
    connections = geometry.get("connections", [])
    project_info = scheme.get("project_info", {})
    pipe_list = (scheme.get("tables") or {}).get("pipe_list") or []
    stream_map = {}
    for s in scheme.get("streams") or []:
        cid = s.get("connection_id") or s.get("conn_id")
        if cid:
            stream_map[cid] = s

    id_to_tag: Dict[str, str] = {}
    pos_map: Dict[str, Tuple[float, float]] = {}
    drawables: List[Any] = []
    label_count = 0
    stream_label_count = 0

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
        id_to_tag[obj_id] = str(label)
        id_to_tag[str(label)] = str(label)
        pos_map[obj_id] = (px, py)
        pos_map[label] = (px, py)

        lbl = build_label_2d(doc, App, label, px - 12, py - 35, height=7.0)
        if lbl is not None and hasattr(lbl, "Shape"):
            drawables.append(lbl)
            label_count += 1

    pipe_count = 0
    for j, conn in enumerate(connections):
        p1 = pos_map.get(conn.get("from", ""))
        p2 = pos_map.get(conn.get("to", ""))
        if not p1 or not p2:
            continue
        waypoints = connection_waypoints(p1, p2)
        compound = build_connection_2d(Part, App, p1, p2)
        line_no = conn.get("label") or conn.get("id") or f"L-{j+1:03d}"
        safe = "".join(c if c.isalnum() or c in "_-" else "_" for c in str(line_no))
        fc = doc.addObject("Part::Feature", f"Line_{safe}")
        fc.Label = str(line_no)
        fc.Shape = compound
        drawables.append(fc)
        pipe_count += 1

        cid = conn.get("id") or ""
        stream = stream_map.get(cid) or {}
        stream_no = conn.get("stream_no") or stream.get("stream_no") or ""
        flow = stream.get("flow") or (conn.get("parameters") or {}).get("flow") or ""
        lx, ly = connection_label_point(waypoints)

        if stream_no:
            sl = build_label_2d(doc, App, str(stream_no), lx - 8, ly + 4, height=5.5)
            if sl is not None and hasattr(sl, "Shape"):
                drawables.append(sl)
                stream_label_count += 1
        if line_no:
            ll = build_label_2d(doc, App, str(line_no), lx - 10, ly - 8, height=4.5)
            if ll is not None and hasattr(ll, "Shape"):
                drawables.append(ll)
        if flow and not stream_no:
            fl = build_label_2d(doc, App, str(flow), lx - 8, ly + 2, height=4.5)
            if fl is not None and hasattr(fl, "Shape"):
                drawables.append(fl)

    doc.recompute()

    page = None
    if with_page and drawables:
        page = create_techdraw_page(
            doc, drawables, project_info, pipe_list=pipe_list
        )

    return {
        "status": "success",
        "output_type": "2d_drawing",
        "validation": validation,
        "metadata": {
            "object_count": len(objects),
            "connection_count": pipe_count,
            "equipment_label_count": label_count,
            "stream_label_count": stream_label_count,
            "pipe_table_rows": len(pipe_list),
            "techdraw_page": page.Name if page is not None else None,
            "mode": "pfd2d",
        },
    }
