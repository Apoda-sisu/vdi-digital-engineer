"""CadCommand execution pipeline."""

import json
import os
from typing import Any, Dict, List

import FreeCAD as App

from engine.export import export_document
from engine.object_factory import bind_geometry_to_object, ensure_plant_objects, extract_plant_model_from_doc
from engine.object_list_export import export_object_list_if_requested
from engine.pfd import render_pfd
from engine.pid import render_pid
from engine.plant_layout import render_layout
from engine.plant_isometric import render_isometric
from engine.plant_3d import render_3d
from engine.sheet import create_drawing_sheet
from engine.view import activate_and_fit
from engine.drawing_cleanup import hide_model_space_geometry, clear_ephemeral_drawing_objects

try:
    from vdi_cad_core.plant_schema import normalize_plant_model, validate_plant_model
except ImportError:
    normalize_plant_model = None
    validate_plant_model = None


def _load_plant_model(command: Dict[str, Any]) -> Dict[str, Any]:
    if command.get("plant_model"):
        return command["plant_model"]
    ref = command.get("plant_model_ref")
    if ref and os.path.isfile(ref):
        with open(ref, encoding="utf-8") as f:
            return json.load(f)
    return {}


def _get_or_create_document(basename: str, merge_mode: bool) -> App.Document:
    doc_name = f"VDI_{basename.replace('-', '_')}"
    if merge_mode and doc_name in App.listDocuments():
        doc = App.getDocument(doc_name)
        App.setActiveDocument(doc.Name)
        return doc
    if doc_name in App.listDocuments():
        App.closeDocument(doc_name)
    doc = App.newDocument(doc_name)
    App.setActiveDocument(doc.Name)
    return doc


def execute_command(command: Dict[str, Any]) -> Dict[str, Any]:
    """Main entry: validate, render, export."""
    drawing_type = command.get("drawing_type", "pfd")

    if drawing_type == "__diagnose_pick__":
        import importlib
        import engine.pick_resolver as pick_mod

        importlib.reload(pick_mod)
        doc = App.ActiveDocument
        if not doc:
            return {"status": "error", "message": "No active document"}
        return pick_mod.diagnose_pick_coords(doc)

    title_block = command.get("title_block", {})
    output_cfg = command.get("output", {})
    options = command.get("options", {})
    merge_mode = options.get("merge_mode", True)
    fresh_document = options.get("fresh_document", not merge_mode)

    basename = output_cfg.get("basename", title_block.get("drawing_number", "vdi_drawing"))
    out_dir = output_cfg.get("directory", _default_output_dir())
    formats: List[str] = output_cfg.get("formats", ["FCStd", "DXF"])

    os.makedirs(out_dir, exist_ok=True)

    doc = _get_or_create_document(basename, merge_mode and not fresh_document)

    if fresh_document:
        clear_ephemeral_drawing_objects(doc)

    plant_model = _load_plant_model(command)
    plant_stats: Dict[str, Any] = {"status": "skipped"}

    if plant_model and plant_model.get("objects"):
        if normalize_plant_model:
            plant_model = normalize_plant_model(plant_model)
        if validate_plant_model:
            errors, warnings = validate_plant_model(plant_model)
            if errors and options.get("strict_validation"):
                return {"status": "error", "message": "PlantModel validation failed", "errors": errors}
            plant_stats = ensure_plant_objects(doc, plant_model.get("objects", []))
            plant_stats["validation_warnings"] = warnings
        else:
            plant_stats = ensure_plant_objects(doc, plant_model.get("objects", []))

    renderers = {
        "pfd": render_pfd,
        "pid": render_pid,
        "layout": render_layout,
        "isometric": render_isometric,
        "3d": render_3d,
    }
    renderer = renderers.get(drawing_type, render_pfd)
    stats = renderer(doc, command)

    if options.get("create_sheet"):
        sheet_info = create_drawing_sheet(doc, title_block)
        if options.get("hide_model_space", True):
            cleanup_info = hide_model_space_geometry(doc)
        else:
            cleanup_info = {"status": "skipped", "message": "hide_model_space=false"}
        sheet_info["cleanup"] = cleanup_info
    else:
        sheet_info = {"status": "skipped", "message": "create_sheet not requested"}
        cleanup_info = {}

    exported: List[Dict[str, str]] = []
    for fmt in formats:
        ext = fmt.lower() if fmt.lower() != "fcstd" else "FCStd"
        if ext == "fcstd":
            ext = "FCStd"
        path = os.path.join(out_dir, f"{basename}.{ext}")
        result = export_document(ext, path)
        if result.get("status") == "success":
            exported.append({"format": ext, "path": result["path"]})

    object_list_result = export_object_list_if_requested(
        plant_model, out_dir, basename, options
    )
    if object_list_result.get("status") == "success":
        exported.append({"format": "CSV", "path": object_list_result["path"]})

    doc.recompute()
    view_info = activate_and_fit(doc)

    deliverables = [
        {"role": "primary", "format": "PDF", "hint": "首选：用 PDF 阅读器打开，即正式图幅"},
        {"role": "source", "format": "FCStd", "hint": "FreeCAD 源文件：左侧选 VDI_Sheet 查看 TechDraw 页"},
    ]
    for e in exported:
        deliverables.append({"role": "export", **e})

    return {
        "status": "success",
        "drawing_type": drawing_type,
        "document": doc.Name,
        "stats": {**stats, "plant_objects": plant_stats, "object_list": object_list_result},
        "sheet": sheet_info,
        "exported": exported,
        "deliverables": deliverables,
        "title_block": title_block,
        "view": view_info,
        "merge_mode": merge_mode,
        "fresh_document": fresh_document,
    }


def load_plant_model_command(model: Dict[str, Any], render_command: Dict[str, Any] = None) -> Dict[str, Any]:
    """Load/merge PlantModel and optionally render a view."""
    cmd = render_command or {"drawing_type": "pfd", "title_block": {}, "output": {}}
    cmd["plant_model"] = model
    cmd.setdefault("options", {})["merge_mode"] = True
    return execute_command(cmd)


def extract_plant_model_command(project_id: str = "", revision: str = "A") -> Dict[str, Any]:
    doc = App.ActiveDocument
    if not doc:
        return {"status": "error", "message": "No active document"}
    model = extract_plant_model_from_doc(doc, project_id=project_id, revision=revision)
    return {"status": "success", "plant_model": model}


def apply_delta_command(delta: Dict[str, Any]) -> Dict[str, Any]:
    from engine.object_factory import apply_delta_to_doc

    doc = App.ActiveDocument
    if not doc:
        return {"status": "error", "message": "No active document"}
    result = apply_delta_to_doc(doc, delta)
    return {"status": "success", **result}


def get_object_command(object_id: str) -> Dict[str, Any]:
    from engine.object_factory import find_by_object_id, get_plant_object_props
    from engine.property_format import format_plant_object

    doc = App.ActiveDocument
    if not doc:
        return {"status": "error", "message": "No active document"}
    obj = find_by_object_id(doc, object_id)
    if not obj:
        return {"status": "error", "message": f"object_id not found in document: {object_id}"}
    props = get_plant_object_props(obj)
    if not props:
        return {"status": "error", "message": "Object has no VDI properties"}
    return {
        "status": "success",
        "object": props,
        "formatted": format_plant_object(props),
    }


def resolve_pick_command(doc_name: str, selection_json: str, pick_mode: str = "techdraw") -> Dict[str, Any]:
    import json as _json

    from engine.pick_resolver import resolve_selection

    doc = App.getDocument(doc_name) if doc_name else App.ActiveDocument
    if not doc:
        return {"status": "error", "message": "Document not found"}

    try:
        names = _json.loads(selection_json)
    except _json.JSONDecodeError as e:
        return {"status": "error", "message": f"Invalid selection JSON: {e}"}

    class _Sel:
        pass

    selection_ex = []
    for name in names if isinstance(names, list) else []:
        obj = doc.getObject(name)
        if obj:
            s = _Sel()
            s.Object = obj
            s.SubObjects = []
            selection_ex.append(s)

    result = resolve_selection(doc, selection_ex, pick_mode=pick_mode)
    return {"status": "success", **result}


def resolve_pick_at_command(
    doc_name: str,
    pick_json: str,
    pick_mode: str = "techdraw",
) -> Dict[str, Any]:
    import json as _json

    from engine.pick_resolver import resolve_selection

    doc = App.getDocument(doc_name) if doc_name else App.ActiveDocument
    if not doc:
        return {"status": "error", "message": "Document not found"}

    try:
        payload = _json.loads(pick_json)
    except _json.JSONDecodeError as e:
        return {"status": "error", "message": f"Invalid JSON: {e}"}

    names = payload.get("objects") if isinstance(payload, dict) else payload
    pick_point = None
    if isinstance(payload, dict) and payload.get("pick_point"):
        pt = payload["pick_point"]
        if isinstance(pt, (list, tuple)) and len(pt) >= 2:
            pick_point = (float(pt[0]), float(pt[1]))

    class _Sel:
        pass

    selection_ex = []
    for name in names if isinstance(names, list) else []:
        obj = doc.getObject(name)
        if obj:
            s = _Sel()
            s.Object = obj
            s.SubObjects = []
            if pick_point:
                s.PickedPoints = [pick_point]
            selection_ex.append(s)

    result = resolve_selection(doc, selection_ex, pick_mode=pick_mode, pick_point=pick_point)
    return {"status": "success", **result}


def diagnose_pick_command(doc_name: str = "") -> Dict[str, Any]:
    from engine.pick_resolver import diagnose_pick_coords

    doc = App.getDocument(doc_name) if doc_name else App.ActiveDocument
    if not doc:
        return {"status": "error", "message": "Document not found"}
    return diagnose_pick_coords(doc)


def _default_output_dir() -> str:
    home = os.path.expanduser("~")
    vdi_out = os.path.join(home, "VDI-CAD", "output")
    os.makedirs(vdi_out, exist_ok=True)
    return vdi_out
