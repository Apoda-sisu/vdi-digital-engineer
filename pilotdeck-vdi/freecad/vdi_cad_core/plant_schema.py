"""PlantModel v1 validation and normalization."""

import re
from typing import Any, Dict, List, Tuple

PLANT_OBJECT_CLASSES = frozenset({
    "Equipment",
    "PipeRun",
    "Instrument",
    "Valve",
    "SafetyValve",
    "Stream",
    "ControlLoop",
})

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)


def validate_plant_model(model: Dict[str, Any]) -> Tuple[List[str], List[str]]:
    """Return (errors, warnings)."""
    errors: List[str] = []
    warnings: List[str] = []

    if not isinstance(model, dict):
        return ["model must be a dict"], warnings

    if model.get("version") != "1.0":
        warnings.append(f"unexpected version: {model.get('version')}")

    if not model.get("project_id"):
        errors.append("project_id is required")

    objects = model.get("objects")
    if not isinstance(objects, list):
        errors.append("objects must be an array")
        return errors, warnings

    seen_ids: set = set()
    seen_tags: Dict[str, str] = {}

    for i, obj in enumerate(objects):
        if not isinstance(obj, dict):
            errors.append(f"objects[{i}] must be an object")
            continue

        oid = obj.get("object_id", "")
        if not UUID_RE.match(str(oid)):
            errors.append(f"objects[{i}] invalid object_id: {oid}")
        elif oid in seen_ids:
            errors.append(f"duplicate object_id: {oid}")
        else:
            seen_ids.add(oid)

        cls = obj.get("class", "")
        if cls not in PLANT_OBJECT_CLASSES:
            errors.append(f"objects[{i}] unknown class: {cls}")

        tag = obj.get("tag", "")
        if not tag:
            errors.append(f"objects[{i}] tag is required")
        elif tag in seen_tags and seen_tags[tag] != oid:
            warnings.append(f"duplicate tag {tag}")
        else:
            seen_tags[tag] = oid

    views = model.get("views")
    if not isinstance(views, list):
        errors.append("views must be an array")
    else:
        view_ids = set()
        for j, view in enumerate(views):
            vid = view.get("view_id", "")
            if not vid:
                errors.append(f"views[{j}] view_id is required")
            elif vid in view_ids:
                errors.append(f"duplicate view_id: {vid}")
            else:
                view_ids.add(vid)

    return errors, warnings


def normalize_plant_model(model: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy with defaults filled."""
    result = {
        "version": model.get("version", "1.0"),
        "project_id": model.get("project_id", ""),
        "revision": model.get("revision", "A"),
        "objects": [],
        "views": [],
        "change_log": list(model.get("change_log") or []),
    }

    for obj in model.get("objects") or []:
        if not isinstance(obj, dict):
            continue
        result["objects"].append({
            "object_id": obj.get("object_id", ""),
            "class": obj.get("class", "Equipment"),
            "tag": obj.get("tag", ""),
            "attributes": dict(obj.get("attributes") or {}),
            "relationships": list(obj.get("relationships") or []),
        })

    for view in model.get("views") or []:
        if not isinstance(view, dict):
            continue
        result["views"].append({
            "view_id": view.get("view_id", ""),
            "view_type": view.get("view_type", "pfd"),
            "title_block": dict(view.get("title_block") or {}),
            "placements": dict(view.get("placements") or {}),
        })

    if model.get("_meta"):
        result["_meta"] = dict(model["_meta"])

    return result
