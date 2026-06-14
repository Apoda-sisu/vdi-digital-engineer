"""TechDraw sheet — GB A1/A3 landscape title block + single composite VDI_View."""

from typing import Any, Dict, List, Optional, Tuple

import FreeCAD as App

# Must match pilotdeck-vdi/mcp/vdi-cad/sheet-sizes.mjs
SHEET_FORMATS: Dict[str, Dict[str, Any]] = {
    "A3": {
        "print_w": 360.0,
        "print_h": 220.0,
        "margin": 20.0,
        "view_x": 148.5,
        "view_y": 105.0,
        "template": "GB_A3_Landscape.svg",
        "fallbacks": [
            "A3_Landscape_ISO7200_TD.svg",
            "ISO/A3_Landscape_ISO5457_minimal.svg",
        ],
    },
    "A1": {
        "print_w": 720.0,
        "print_h": 450.0,
        "margin": 35.0,
        "view_x": 420.0,
        "view_y": 280.0,
        # FreeCAD built-in ISO template parses reliably (custom GB A1 may get Width=0)
        "template": "ISO/A1_Landscape_ISO5457_minimal.svg",
        "fallbacks": [
            "ISO/localized/zh-CN/landscape/A1_Landscape_CN_CLIP.svg",
            "GB_A1_Landscape.svg",
        ],
    },
}

FREECAD_TEMPLATE_ROOTS = [
    "/Applications/FreeCAD.app/Contents/Resources/share/Mod/TechDraw/Templates",
    "/Applications/FreeCAD.app/Contents/Resources/Mod/TechDraw/Templates",
    "/usr/share/freecad/Mod/TechDraw/Templates",
]


def _sheet_format(title_block: Dict[str, Any]) -> Dict[str, Any]:
    size = str(title_block.get("sheet_size", "A1")).upper()
    return SHEET_FORMATS.get(size, SHEET_FORMATS["A1"])


def _template_candidate_paths(sheet: Dict[str, Any]) -> List[str]:
    import os

    names: List[str] = []
    primary = sheet.get("template")
    if primary:
        names.append(primary)
    for fb in sheet.get("fallbacks") or []:
        if fb not in names:
            names.append(fb)

    candidates: List[str] = []
    seen = set()
    for name in names:
        paths = [os.path.join(os.path.dirname(__file__), "..", "templates", name)]
        for root in FREECAD_TEMPLATE_ROOTS:
            paths.append(os.path.join(root, name))
        for path in paths:
            abspath = os.path.abspath(path)
            if abspath in seen:
                continue
            seen.add(abspath)
            if os.path.isfile(abspath):
                candidates.append(abspath)
    return candidates


def _template_dimensions(template) -> Tuple[float, float]:
    try:
        w = float(getattr(template, "Width", 0) or 0)
        h = float(getattr(template, "Height", 0) or 0)
        return w, h
    except Exception:
        return 0.0, 0.0


def _load_template(doc: App.Document, template, sheet: Dict[str, Any]) -> Dict[str, Any]:
    """Assign first SVG template that TechDraw parses (Width/Height > 0)."""
    for path in _template_candidate_paths(sheet):
        try:
            template.Template = path
            doc.recompute()
            w, h = _template_dimensions(template)
            if w > 10.0 and h > 10.0:
                return {"path": path, "status": "loaded", "width": w, "height": h}
        except Exception:
            continue
    return {"path": "", "status": "failed", "width": 0.0, "height": 0.0}


def _apply_template_texts(template, title_block: Dict[str, Any], scale_label: str = "") -> None:
    """Support GB custom keys and FreeCAD ISO template keys."""
    mapping = {
        "drawing_number": title_block.get("drawing_number", "VDI-001"),
        "DrawingNumber": title_block.get("drawing_number", "VDI-001"),
        "title": title_block.get("drawing_title", "工艺流程图"),
        "DrawingTitle": title_block.get("drawing_title", "工艺流程图"),
        "ProjectName": title_block.get("project_name", ""),
        "legal_owner_1": title_block.get("project_name", ""),
        "creator": title_block.get("project_name", ""),
        "revision_index": title_block.get("revision", "A"),
        "Revision": title_block.get("revision", "A"),
        "scale": scale_label or title_block.get("scale", "1:100"),
        "Scale": scale_label or title_block.get("scale", "1:100"),
    }
    try:
        if not hasattr(template, "EditableTexts"):
            return
        editable = dict(template.EditableTexts)
        for key, val in mapping.items():
            if key in editable and val:
                editable[key] = str(val)
        template.EditableTexts = editable
    except Exception:
        pass


def _bounds_center(bounds: Tuple[float, float, float, float]) -> Tuple[float, float]:
    min_x, min_y, max_x, max_y = bounds
    return (min_x + max_x) / 2.0, (min_y + max_y) / 2.0


def _subset_page_anchor(
    full_bounds: Tuple[float, float, float, float],
    subset: List[App.DocumentObject],
    view_x: float,
    view_y: float,
    fit_scale: float,
) -> Tuple[float, float]:
    """
    Place a multi-object TechDraw view so it aligns with a full-composite view.

    Full composite maps model (mx,my) → page view_x + (mx-fcx)*s.
    Subset view maps model (mx,my) → page sx + (mx-scx)*s.
    Solve sx = view_x + (fcx-scx)*s.
    """
    fcx, fcy = _bounds_center(full_bounds)
    sub_bounds = _content_bounds(subset)
    scx, scy = _bounds_center(sub_bounds)
    return view_x + (fcx - scx) * fit_scale, view_y + (fcy - scy) * fit_scale


def _configure_part_view(view, sources: List[App.DocumentObject], px: float, py: float, scale: float) -> None:
    view.Source = sources
    view.Direction = (0, 0, 1)
    view.XDirection = (1, 0, 0)
    view.Rotation = 0
    view.Scale = scale
    view.X = px
    view.Y = py


def _create_composite_view(
    doc: App.Document,
    page,
    drawable: List[App.DocumentObject],
    view_x: float,
    view_y: float,
    fit_scale: float,
) -> str:
    """One view for all geometry — guarantees pipes/symbols stay aligned."""
    view = doc.addObject("TechDraw::DrawViewPart", "VDI_View")
    page.addView(view)
    _configure_part_view(view, drawable, view_x, view_y, fit_scale)
    return view.Name


def _add_all_label_views(
    doc: App.Document,
    page,
    view_x: float,
    view_y: float,
    fit_scale: float,
    full_bounds: Tuple[float, float, float, float],
) -> Dict[str, Any]:
    """All Draft labels (equipment tags + pipe numbers) aligned with composite view."""
    labels = _collect_label_objects(doc, exclude_equipment_tags=False)
    if not labels:
        return {"status": "skipped", "label_count": 0, "method": "none"}
    try:
        ax, ay = _subset_page_anchor(full_bounds, labels, view_x, view_y, fit_scale)
        draft_view = doc.addObject("TechDraw::DrawViewDraft", "VDI_Labels")
        page.addView(draft_view)
        draft_view.Source = labels
        draft_view.Direction = (0, 0, 1)
        draft_view.XDirection = (1, 0, 0)
        draft_view.Rotation = 0
        draft_view.Scale = fit_scale
        draft_view.X = ax
        draft_view.Y = ay
        return {
            "status": "success",
            "method": "draw_view_draft",
            "label_count": len(labels),
            "view": draft_view.Name,
        }
    except Exception as exc:
        return {"status": "skipped", "label_count": 0, "error": str(exc)}


def _collect_label_objects(
    doc: App.Document,
    exclude_equipment_tags: bool = False,
) -> List[App.DocumentObject]:
    """Draft / Annotation text in model space."""
    equipment_tags = {
        getattr(o, "VDI_Tag", "")
        for o in doc.Objects
        if getattr(o, "VDI_ObjectId", "")
    }
    objects: List[App.DocumentObject] = []
    for obj in doc.Objects:
        if obj.TypeId.startswith("TechDraw::"):
            continue
        tid = obj.TypeId
        if tid not in ("App::Annotation",) and not tid.startswith("Draft::"):
            continue
        text = ""
        try:
            raw = getattr(obj, "Text", None) or getattr(obj, "Label", "")
            if isinstance(raw, (list, tuple)):
                text = " ".join(str(x) for x in raw).strip()
            else:
                text = str(raw or "").strip()
        except Exception:
            text = ""
        if exclude_equipment_tags and text and text in equipment_tags:
            continue
        objects.append(obj)
    return objects


def _model_to_page(
    mx: float,
    my: float,
    view_x: float,
    view_y: float,
    fit_scale: float,
    min_x: float,
    min_y: float,
    max_x: float,
    max_y: float,
) -> Tuple[float, float]:
    cx = (min_x + max_x) / 2.0
    cy = (min_y + max_y) / 2.0
    return view_x + (mx - cx) * fit_scale, view_y + (my - cy) * fit_scale


def _collect_drawable_objects(doc: App.Document) -> List[App.DocumentObject]:
    objects: List[App.DocumentObject] = []
    for obj in doc.Objects:
        if obj.TypeId.startswith("TechDraw::"):
            continue
        if not hasattr(obj, "Shape") or not obj.Shape or obj.Shape.isNull():
            continue
        try:
            if hasattr(obj, "ViewObject") and obj.ViewObject and not obj.ViewObject.Visibility:
                if hasattr(obj, "VDI_ObjectId") and getattr(obj, "VDI_ObjectId", ""):
                    continue
        except Exception:
            pass
        try:
            bb = obj.Shape.BoundBox
            if bb.XLength < 0.05 and bb.YLength < 0.05:
                continue
        except Exception:
            pass
        objects.append(obj)
    return objects


def _content_bounds(objects: List[App.DocumentObject]) -> Tuple[float, float, float, float]:
    if not objects:
        return 0.0, 0.0, 400.0, 300.0
    bb = App.BoundBox()
    for obj in objects:
        try:
            bb.add(obj.Shape.BoundBox)
        except Exception:
            continue
    if bb.XLength < 1e-6 and bb.YLength < 1e-6:
        return 0.0, 0.0, 400.0, 300.0
    return bb.XMin, bb.YMin, bb.XMax, bb.YMax


def _fit_scale(min_x: float, min_y: float, max_x: float, max_y: float, sheet: Dict[str, Any]) -> float:
    w = max_x - min_x
    h = max_y - min_y
    if w < 1.0 or h < 1.0:
        return 1.0
    pw = float(sheet["print_w"])
    ph = float(sheet["print_h"])
    raw = min(pw / w, ph / h) * 0.88
    return min(raw, 1.0)


def create_drawing_sheet(doc: App.Document, title_block: Dict[str, Any]) -> Dict[str, Any]:
    """Create TechDraw page — single VDI_View composite; picking via pick_resolver."""
    try:
        import TechDraw  # noqa: F401
    except ImportError:
        return {"status": "skipped", "message": "TechDraw module not available"}

    sheet = _sheet_format(title_block)

    page = doc.addObject("TechDraw::DrawPage", "VDI_Sheet")
    template = doc.addObject("TechDraw::DrawSVGTemplate", "VDI_Template")

    template_info = _load_template(doc, template, sheet)
    page.Template = template
    _apply_template_texts(template, title_block)
    doc.recompute()

    if template_info.get("status") != "loaded":
        return {
            "status": "error",
            "message": "No TechDraw template could be parsed (Width/Height remained 0)",
            "template": template_info,
        }

    drawable = _collect_drawable_objects(doc)
    bounds = _content_bounds(drawable)
    min_x, min_y, max_x, max_y = bounds
    fit_scale = _fit_scale(min_x, min_y, max_x, max_y, sheet)
    view_x = float(sheet["view_x"])
    view_y = float(sheet["view_y"])
    scale_label = f"1:{int(round(1 / fit_scale))}" if fit_scale < 1 else title_block.get("scale", "1:1")

    view_info: Dict[str, Any] = {"status": "skipped", "drawable_count": len(drawable)}
    if drawable:
        try:
            composite_name = _create_composite_view(
                doc, page, drawable, view_x, view_y, fit_scale
            )
            label_info = _add_all_label_views(
                doc, page, view_x, view_y, fit_scale, bounds
            )
            _apply_template_texts(template, title_block, scale_label)
            view_info = {
                "status": "success",
                "mode": "composite_only",
                "composite_view": composite_name,
                "scale": fit_scale,
                "scale_label": scale_label,
                "drawable_count": len(drawable),
                "content_bounds": [min_x, min_y, max_x, max_y],
                "sheet_size": title_block.get("sheet_size", "A1"),
                "labels": label_info,
            }
        except Exception as e:
            view_info = {"status": "error", "message": str(e), "drawable_count": len(drawable)}

    doc.recompute()
    return {
        "status": "success",
        "page": page.Name,
        "drawing_number": title_block.get("drawing_number", "VDI-001"),
        "sheet_size": title_block.get("sheet_size", "A1"),
        "template": template_info,
        "view": view_info,
    }
