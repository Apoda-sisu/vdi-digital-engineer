"""Build drawing-manifest.json from PlantModel view placements."""

from typing import Any, Dict, List, Optional


def _sheet_dims(sheet_size: str) -> Dict[str, float]:
    sizes = {
        "A1": {"width": 720.0, "height": 450.0, "symbolHalfW": 28.0, "symbolHalfH": 32.0},
        "A3": {"width": 360.0, "height": 220.0, "symbolHalfW": 24.0, "symbolHalfH": 28.0},
    }
    return sizes.get(str(sheet_size).upper(), sizes["A1"])


def build_drawing_manifest(
    plant_model: Dict[str, Any],
    drawing_number: str = "PFD-UNKNOWN",
    view_id: Optional[str] = None,
    sheet_size: str = "A1",
    symbol_scale: float = 1.0,
    fit_scale: float = 1.0,
    files: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    views = plant_model.get("views") or []
    view = None
    if view_id:
        view = next((v for v in views if v.get("view_id") == view_id), None)
    if not view:
        view = next((v for v in views if v.get("view_type") == "pfd"), None) or (views[0] if views else {})
    vid = view.get("view_id") or view_id or "pfd-default"

    sheet = _sheet_dims(sheet_size)
    half_w = sheet["symbolHalfW"] * symbol_scale
    half_h = sheet["symbolHalfH"] * symbol_scale
    placements = view.get("placements") or {}
    index = {o.get("object_id"): o for o in plant_model.get("objects") or [] if o.get("object_id")}

    objects: List[Dict[str, Any]] = []
    for oid, pl in placements.items():
        plant_obj = index.get(oid)
        if not plant_obj:
            continue
        x = float(pl.get("x", 0))
        y = float(pl.get("y", 0))
        w = half_w * 2
        h = half_h * 2
        bx = x - half_w
        by = y - half_h
        sw = sheet["width"]
        sh = sheet["height"]
        objects.append({
            "object_id": oid,
            "tag": plant_obj.get("tag", ""),
            "class": plant_obj.get("class", ""),
            "bbox_mm": {"x": bx, "y": by, "w": w, "h": h},
            "bbox_view": {"x": bx / sw, "y": by / sh, "w": w / sw, "h": h / sh},
        })

    return {
        "version": "1.0",
        "drawing_number": drawing_number,
        "view_id": vid,
        "sheet_size": sheet_size,
        "scale": fit_scale,
        "symbol_scale": symbol_scale,
        "sheet_mm": {"width": sheet["width"], "height": sheet["height"]},
        "objects": objects,
        "files": files or {},
    }
