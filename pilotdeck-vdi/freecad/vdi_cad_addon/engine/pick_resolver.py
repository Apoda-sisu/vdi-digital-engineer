"""Resolve FreeCAD selection to PlantObject — model / TechDraw / tag text."""

from typing import Any, Dict, List, Optional, Sequence, Tuple

from engine.object_factory import get_plant_object_props
from engine.property_format import format_plant_object

Point2 = Tuple[float, float]
BBox2 = Tuple[float, float, float, float]


def _hit_result(plant_obj: Dict[str, Any], method: str) -> Dict[str, Any]:
    formatted = format_plant_object(plant_obj)
    return {
        "status": "hit",
        "method": method,
        "object_id": plant_obj.get("object_id"),
        "tag": plant_obj.get("tag"),
        "class": plant_obj.get("class"),
        "formatted": formatted,
        "plant_object": plant_obj,
    }


def _find_vdi_in_object(obj) -> Optional[Dict[str, Any]]:
    if obj is None:
        return None
    props = get_plant_object_props(obj)
    if props:
        return props
    return None


def _resolve_direct_selection(selection_ex) -> Optional[Dict[str, Any]]:
    for sel in selection_ex or []:
        obj = sel.Object
        props = _find_vdi_in_object(obj)
        if props:
            return _hit_result(props, "direct")
        for sub_obj in getattr(sel, "SubObjects", []) or []:
            props = _find_vdi_in_object(sub_obj)
            if props:
                return _hit_result(props, "subobject")
    return None


def _resolve_by_tag_label(doc, label: str) -> Optional[Dict[str, Any]]:
    if not label:
        return None
    label = label.strip()
    for obj in doc.Objects:
        props = get_plant_object_props(obj)
        if props and props.get("tag") == label:
            return _hit_result(props, "tag_label")
    return None


def normalize_pick_point(pnt) -> Optional[Point2]:
    if pnt is None:
        return None
    if hasattr(pnt, "x"):
        return (float(pnt.x), float(pnt.y))
    if isinstance(pnt, (list, tuple)) and len(pnt) >= 2:
        return (float(pnt[0]), float(pnt[1]))
    return None


def extract_pick_point(selection_ex, fallback_pnt=None) -> Optional[Point2]:
    """Prefer SelectionEx.PickedPoints (TechDraw page coords), else observer pnt."""
    for sel in selection_ex or []:
        for p in getattr(sel, "PickedPoints", None) or []:
            pt = normalize_pick_point(p)
            if pt:
                return pt
    return normalize_pick_point(fallback_pnt)


def _bbox_2d(obj) -> Optional[BBox2]:
    try:
        if hasattr(obj, "Shape") and obj.Shape:
            bb = obj.Shape.BoundBox
            return (bb.XMin, bb.YMin, bb.XMax, bb.YMax)
    except Exception:
        pass
    return None


def _bbox_center(obj) -> Optional[Point2]:
    bbox = _bbox_2d(obj)
    if not bbox:
        return None
    return ((bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0)


def _content_bounds_xy(objects: Sequence) -> BBox2:
    xs: List[float] = []
    ys: List[float] = []
    for obj in objects:
        bbox = _bbox_2d(obj)
        if bbox:
            xs.extend([bbox[0], bbox[2]])
            ys.extend([bbox[1], bbox[3]])
    if not xs:
        return 0.0, 0.0, 400.0, 300.0
    return min(xs), min(ys), max(xs), max(ys)


def _page_to_model(
    page_x: float,
    page_y: float,
    view_x: float,
    view_y: float,
    scale: float,
    bounds: BBox2,
) -> Point2:
    """Inverse of sheet._model_to_page — page mm → model XY."""
    min_x, min_y, max_x, max_y = bounds
    cx = (min_x + max_x) / 2.0
    cy = (min_y + max_y) / 2.0
    mx = cx + (page_x - view_x) / scale
    my = cy + (page_y - view_y) / scale
    return mx, my


def _view_scale_and_origin(view_obj) -> Tuple[float, float, float]:
    scale = float(getattr(view_obj, "Scale", 1.0) or 1.0)
    if scale < 1e-9:
        scale = 1.0
    vx = float(getattr(view_obj, "X", 0.0) or 0.0)
    vy = float(getattr(view_obj, "Y", 0.0) or 0.0)
    return scale, vx, vy


def _model_to_page_pt(view_obj, mx: float, my: float) -> Optional[Point2]:
    """Model XY → TechDraw page mm — align with rendered view bbox."""
    if view_obj is None:
        return None

    scale, vx, vy = _view_scale_and_origin(view_obj)
    sources = list(getattr(view_obj, "Source", None) or [])
    model_bounds = _content_bounds_xy(sources)

    try:
        view_bb = view_obj.getBoundingBox()
        min_mx, min_my, max_mx, max_my = model_bounds
        mw = max_mx - min_mx
        mh = max_my - min_my
        if mw > 1e-6 and mh > 1e-6 and view_bb.XLength > 1e-6 and view_bb.YLength > 1e-6:
            u = (mx - min_mx) / mw
            v = (my - min_my) / mh
            lx = view_bb.XMin + u * view_bb.XLength
            ly = view_bb.YMin + v * view_bb.YLength
            return vx + lx, vy + ly
    except Exception:
        pass

    try:
        import FreeCAD as App

        for invert in (True, False):
            proj = view_obj.projectPoint(App.Vector(mx, my, 0.0), invert)
            px = vx + float(proj.x) * scale
            py = vy + float(proj.y) * scale
            if px == px and py == py:
                return px, py
    except Exception:
        pass

    min_mx, min_my, max_mx, max_my = model_bounds
    cx = (min_mx + max_mx) / 2.0
    cy = (min_my + max_my) / 2.0
    return vx + (mx - cx) * scale, vy + (my - cy) * scale


def _object_page_bbox(view_obj, src) -> Optional[BBox2]:
    bbox = _bbox_2d(src)
    if not bbox or view_obj is None:
        return None
    corners = (
        (bbox[0], bbox[1]),
        (bbox[2], bbox[1]),
        (bbox[2], bbox[3]),
        (bbox[0], bbox[3]),
    )
    page_pts: List[Point2] = []
    for mx, my in corners:
        pt = _model_to_page_pt(view_obj, mx, my)
        if pt:
            page_pts.append(pt)
    if len(page_pts) < 2:
        return None
    xs = [p[0] for p in page_pts]
    ys = [p[1] for p in page_pts]
    return min(xs), min(ys), max(xs), max(ys)


def _normalize_techdraw_pick(
    pick_point: Point2,
    view_obj,
    source_objects: Sequence,
) -> Point2:
    """Observer may pass model XY instead of page mm — detect and convert."""
    px, py = pick_point
    bounds = _content_bounds_xy(source_objects)
    min_x, min_y, max_x, max_y = bounds
    mw, mh = max_x - min_x, max_y - min_y

    in_model = (
        mw > 1e-6
        and mh > 1e-6
        and (min_x - mw * 0.05) <= px <= (max_x + mw * 0.05)
        and (min_y - mh * 0.05) <= py <= (max_y + mh * 0.05)
    )
    if in_model and view_obj is not None:
        page_pt = _model_to_page_pt(view_obj, px, py)
        if page_pt:
            return page_pt

    scale, vx, vy = _view_scale_and_origin(view_obj)
    if view_obj is not None and not in_model:
        # Page mm expected — also try inverse if click landed in manual page range
        mx, my = _page_to_model(px, py, vx, vy, scale, bounds)
        if (min_x - mw * 0.05) <= mx <= (max_x + mw * 0.05) and (min_y - mh * 0.05) <= my <= (
            max_y + mh * 0.05
        ):
            return pick_point

    return pick_point


def _page_pick_candidates(
    pick_point: Point2,
    view_obj,
    source_objects: Sequence,
) -> List[Point2]:
    """Page mm candidates — prefer raw click; fallback manual inverse transform."""
    px, py = pick_point
    candidates: List[Point2] = [(px, py)]

    if view_obj is None:
        return candidates

    scale, vx, vy = _view_scale_and_origin(view_obj)
    bounds = _content_bounds_xy(source_objects)
    mx, my = _page_to_model(px, py, vx, vy, scale, bounds)
    candidates.append((mx, my))

    _, min_y, _, max_y = bounds
    cy = (min_y + max_y) / 2.0
    candidates.append((mx, cy - (my - cy)))
    return candidates


def _bbox_hit_margin_page(bbox: BBox2) -> float:
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    return max(2.0, min(w, h) * 0.15)


def _hit_test_vdi_sources_page(
    vdi_sources: List[Tuple[Any, Dict[str, Any]]],
    pick_point: Point2,
    view_obj,
) -> Optional[Dict[str, Any]]:
    """Hit test in TechDraw page mm using projectPoint-mapped bboxes."""
    sources = [src for src, _ in vdi_sources]
    pick_point = _normalize_techdraw_pick(pick_point, view_obj, sources)
    px, py = pick_point

    best_inside: Optional[Tuple[float, Dict[str, Any]]] = None
    for src, props in vdi_sources:
        page_bbox = _object_page_bbox(view_obj, src)
        if not page_bbox:
            continue
        margin = _bbox_hit_margin_page(page_bbox)
        if _point_in_bbox(px, py, page_bbox, margin):
            area = (page_bbox[2] - page_bbox[0]) * (page_bbox[3] - page_bbox[1])
            if best_inside is None or area < best_inside[0]:
                best_inside = (area, props)

    if best_inside:
        return _hit_result(best_inside[1], "techdraw_symbol_bbox")

    scale, _, _ = _view_scale_and_origin(view_obj)
    limit = max(6.0, 12.0 / scale)
    limit_sq = limit * limit

    best_props = None
    best_dist = float("inf")
    for src, props in vdi_sources:
        page_bbox = _object_page_bbox(view_obj, src)
        if page_bbox:
            dist = _dist_to_bbox(px, py, page_bbox)
        else:
            center = _bbox_center(src)
            if not center:
                continue
            page_center = _model_to_page_pt(view_obj, center[0], center[1])
            if not page_center:
                continue
            dist = (page_center[0] - px) ** 2 + (page_center[1] - py) ** 2
        if dist < best_dist:
            best_dist = dist
            best_props = props

    if best_props is not None and best_dist <= limit_sq:
        return _hit_result(best_props, "techdraw_symbol_nearest")
    return None


def _dist_point_to_shape_page(px: float, py: float, view_obj, shape) -> float:
    """Min distance in page mm from click to projected polyline edges."""
    best = float("inf")
    try:
        for edge in shape.Edges:
            p1 = edge.firstVertex().Point
            p2 = edge.lastVertex().Point
            a = _model_to_page_pt(view_obj, p1.x, p1.y)
            b = _model_to_page_pt(view_obj, p2.x, p2.y)
            if not a or not b:
                continue
            d = _dist_point_segment_2d(px, py, a[0], a[1], b[0], b[1])
            if d < best:
                best = d
    except Exception:
        pass
    return best


def _point_in_bbox(px: float, py: float, bbox: BBox2, margin: float = 0.0) -> bool:
    x0, y0, x1, y1 = bbox
    return (x0 - margin) <= px <= (x1 + margin) and (y0 - margin) <= py <= (y1 + margin)


def _dist_to_bbox(px: float, py: float, bbox: BBox2) -> float:
    x0, y0, x1, y1 = bbox
    dx = max(x0 - px, 0.0, px - x1)
    dy = max(y0 - py, 0.0, py - y1)
    return dx * dx + dy * dy


def _dist_point_segment_2d(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    abx, aby = bx - ax, by - ay
    apx, apy = px - ax, py - ay
    ab2 = abx * abx + aby * aby
    if ab2 < 1e-12:
        return ((apx * apx + apy * apy) ** 0.5)
    t = max(0.0, min(1.0, (apx * abx + apy * aby) / ab2))
    cx, cy = ax + t * abx, ay + t * aby
    return ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5


def _dist_point_to_shape_xy(px: float, py: float, shape) -> float:
    try:
        import FreeCAD as App
        import Part

        vert = Part.Vertex(App.Vector(px, py, 0))
        dist, _, _ = shape.distToShape(vert)
        return float(dist)
    except Exception:
        best = float("inf")
        try:
            for edge in shape.Edges:
                c = edge.Curve
                p1 = edge.firstVertex().Point
                p2 = edge.lastVertex().Point
                d = _dist_point_segment_2d(px, py, p1.x, p1.y, p2.x, p2.y)
                if d < best:
                    best = d
        except Exception:
            pass
        return best


def _composite_view(doc):
    return doc.getObject("VDI_View") if doc else None


def _symbol_nearest_threshold_sq(view_obj) -> float:
    scale = float(getattr(view_obj, "Scale", 1.0) or 1.0)
    if scale < 1e-9:
        scale = 1.0
    limit = max(8.0, 15.0 / scale)
    return limit * limit


def _techdraw_geometry_view(doc, view_obj):
    """Symbol/pipe hit always uses composite VDI_View when present."""
    if doc is None or view_obj is None:
        return view_obj
    if getattr(view_obj, "Name", "") == "VDI_View":
        return view_obj
    composite = _composite_view(doc)
    return composite or view_obj


def _resolve_pipe_near_point(doc, pick_point: Point2, view_obj=None) -> Optional[Dict[str, Any]]:
    """Hit-test pipe polylines on VDI_View — page mm when projectPoint available."""
    if not pick_point or doc is None:
        return None

    view = view_obj if view_obj is not None else _composite_view(doc)
    if view is None:
        return None

    scale, _, _ = _view_scale_and_origin(view)
    threshold = max(4.0, 6.0 / scale)
    sources = list(getattr(view, "Source", None) or [])
    pick_point = _normalize_techdraw_pick(pick_point, view, sources)
    px, py = pick_point

    pipes: List[Tuple[Any, Dict[str, Any]]] = []
    for obj in doc.Objects:
        props = get_plant_object_props(obj)
        if props and props.get("class") == "PipeRun" and hasattr(obj, "Shape") and obj.Shape:
            pipes.append((obj, props))

    best_props = None
    best_dist = float("inf")

    if hasattr(view, "getBoundingBox"):
        for obj, props in pipes:
            d = _dist_point_to_shape_page(px, py, view, obj.Shape)
            if d < best_dist and d <= threshold:
                best_dist = d
                best_props = props
    else:
        sources = list(getattr(view, "Source", None) or [])
        candidates = _page_pick_candidates(pick_point, view, sources)
        for mx, my in candidates:
            for obj, props in pipes:
                d = _dist_point_to_shape_xy(mx, my, obj.Shape)
                if d < best_dist and d <= threshold:
                    best_dist = d
                    best_props = props

    if best_props is not None:
        return _hit_result(best_props, "techdraw_pipe_line")
    return None


def _bbox_hit_margin(bbox: BBox2) -> float:
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    return max(3.0, min(w, h) * 0.35)


def _hit_test_vdi_sources(
    vdi_sources: List[Tuple[Any, Dict[str, Any]]],
    pick_point: Optional[Point2],
    view_obj=None,
) -> Optional[Dict[str, Any]]:
    if not pick_point:
        return None

    if view_obj is not None and hasattr(view_obj, "getBoundingBox"):
        hit = _hit_test_vdi_sources_page(vdi_sources, pick_point, view_obj)
        if hit:
            return hit

    sources = [src for src, _ in vdi_sources]
    candidates = _page_pick_candidates(pick_point, view_obj, sources)

    best_inside: Optional[Tuple[float, Dict[str, Any]]] = None
    for mx, my in candidates:
        for _src, props in vdi_sources:
            bbox = _bbox_2d(_src)
            if not bbox:
                continue
            margin = _bbox_hit_margin(bbox)
            if _point_in_bbox(mx, my, bbox, margin):
                area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
                if best_inside is None or area < best_inside[0]:
                    best_inside = (area, props)

    if best_inside:
        return _hit_result(best_inside[1], "techdraw_symbol_bbox")

    best_props = None
    best_dist = float("inf")
    for mx, my in candidates:
        for _src, props in vdi_sources:
            bbox = _bbox_2d(_src)
            if bbox:
                dist = _dist_to_bbox(mx, my, bbox)
            else:
                center = _bbox_center(_src)
                if not center:
                    continue
                dist = (center[0] - mx) ** 2 + (center[1] - my) ** 2
            if dist < best_dist:
                best_dist = dist
                best_props = props

    if best_props is not None and best_dist <= _symbol_nearest_threshold_sq(view_obj):
        return _hit_result(best_props, "techdraw_symbol_nearest")
    return None


def _resolve_symbol_near_point(doc, view_obj, pick_point=None) -> Optional[Dict[str, Any]]:
    """Equipment / instrument / valve bbox hit on VDI_View (PipeRun excluded — use pipe line hit)."""
    sources = []
    if hasattr(view_obj, "Source"):
        sources = list(view_obj.Source or [])
    if not sources and hasattr(view_obj, "Source2"):
        sources = list(view_obj.Source2 or [])

    vdi_sources: List[Tuple[Any, Dict[str, Any]]] = []
    for src in sources:
        props = get_plant_object_props(src)
        if props and props.get("class") != "PipeRun":
            vdi_sources.append((src, props))

    if len(vdi_sources) == 1:
        if pick_point:
            hit = _hit_test_vdi_sources(vdi_sources, pick_point, view_obj)
            if hit:
                return hit
            return None
        return _hit_result(vdi_sources[0][1], "techdraw_source")

    if len(vdi_sources) > 1:
        hit = _hit_test_vdi_sources(vdi_sources, pick_point, view_obj)
        if hit:
            return hit
        return None

    return None


def _resolve_techdraw_selection(
    doc, selection_ex, pick_point=None
) -> Optional[Dict[str, Any]]:
    for sel in selection_ex or []:
        obj = sel.Object
        if obj is None:
            continue
        type_id = getattr(obj, "TypeId", "")
        if not type_id.startswith("TechDraw::"):
            continue

        props = _find_vdi_in_object(obj)
        if props and not pick_point:
            return _hit_result(props, "techdraw_view_vdi")

        target = _techdraw_geometry_view(doc, obj)
        if pick_point:
            symbol = _resolve_symbol_near_point(doc, target, pick_point=pick_point)
            if symbol and symbol.get("method") in (
                "techdraw_symbol_bbox",
                "techdraw_source",
            ):
                return symbol
            pipe = _resolve_pipe_near_point(doc, pick_point, target)
            if pipe:
                return pipe
            if symbol:
                return symbol
        else:
            result = _resolve_symbol_near_point(doc, target, pick_point=None)
            if result:
                return result

    for sel in selection_ex or []:
        obj = sel.Object
        props = _find_vdi_in_object(obj)
        if props:
            return _hit_result(props, "techdraw_direct")
    return None


def resolve_selection(
    doc,
    selection_ex,
    pick_mode: str = "techdraw",
    pick_point=None,
) -> Dict[str, Any]:
    """
    Resolve Gui selection to PlantObject.
    pick_mode: techdraw | model | tree
    """
    if not doc:
        return {"status": "miss", "hint": "无活动文档"}

    pick_pt = extract_pick_point(selection_ex, pick_point)

    has_techdraw = any(
        getattr(sel.Object, "TypeId", "").startswith("TechDraw::")
        for sel in (selection_ex or [])
        if sel.Object
    )

    # 图页点选：先几何命中，避免树选/旧选中对象抢占属性栏
    if pick_mode in ("techdraw", "model") and pick_pt and has_techdraw:
        td = _resolve_techdraw_selection(doc, selection_ex, pick_point=pick_pt)
        if td:
            return td

    direct = _resolve_direct_selection(selection_ex)
    if direct:
        return direct

    if pick_mode in ("techdraw", "model"):
        td = _resolve_techdraw_selection(doc, selection_ex, pick_point=pick_pt)
        if td:
            return td

        if pick_pt and any(
            getattr(sel.Object, "TypeId", "").startswith("TechDraw::")
            for sel in (selection_ex or [])
            if sel.Object
        ):
            return {
                "status": "miss",
                "hint": "图页点选未命中 · 请点击设备符号或管线，或从左侧树选择",
            }

    for sel in selection_ex or []:
        obj = sel.Object
        if obj and hasattr(obj, "Text"):
            text = str(getattr(obj, "Text", "") or getattr(obj, "Label", ""))
            by_tag = _resolve_by_tag_label(doc, text)
            if by_tag:
                return by_tag
        label = getattr(obj, "Label", "") if obj else ""
        by_tag = _resolve_by_tag_label(doc, label)
        if by_tag:
            return by_tag

    if pick_mode == "tree":
        return {
            "status": "miss",
            "hint": "请在组合视图选择 SYM_* 或带 VDI 属性的对象",
        }

    return {
        "status": "miss",
        "hint": "点选未命中 · 请在组合视图选择 SYM_* 对象，或设置 pick_mode=model",
    }


def resolve_pick_from_object_names(doc, object_names: List[str]) -> Dict[str, Any]:
    """For RPC/tests: resolve by document object Name list."""
    selection_ex = []
    for name in object_names:
        obj = doc.getObject(name)
        if obj:
            class _Sel:
                pass

            s = _Sel()
            s.Object = obj
            s.SubObjects = []
            selection_ex.append(s)
    return resolve_selection(doc, selection_ex, pick_mode="model")


def diagnose_pick_coords(doc) -> Dict[str, Any]:
    """Debug: project equipment centers to page and round-trip pick test."""
    from engine.object_factory import get_plant_object_props

    view = _composite_view(doc)
    if view is None:
        return {"status": "error", "message": "VDI_View not found"}

    scale, vx, vy = _view_scale_and_origin(view)
    items: List[Dict[str, Any]] = []
    for obj in doc.Objects:
        props = get_plant_object_props(obj)
        if not props or props.get("class") == "PipeRun":
            continue
        center = _bbox_center(obj)
        if not center:
            continue
        page_pt = _model_to_page_pt(view, center[0], center[1])
        if not page_pt:
            continue
        hit = resolve_selection(
            doc,
            [_FakeSelForDiag(view)],
            pick_mode="techdraw",
            pick_point=page_pt,
        )
        items.append({
            "tag": props.get("tag"),
            "model_center": [center[0], center[1]],
            "page_center": [page_pt[0], page_pt[1]],
            "pick_tag": hit.get("tag"),
            "pick_method": hit.get("method"),
            "pick_ok": hit.get("tag") == props.get("tag"),
        })

    ok = sum(1 for i in items if i["pick_ok"])
    return {
        "status": "success",
        "view": {"scale": scale, "x": vx, "y": vy},
        "tested": len(items),
        "passed": ok,
        "items": items,
    }


class _FakeSelForDiag:
    def __init__(self, obj):
        self.Object = obj
        self.SubObjects = []
        self.PickedPoints = []
