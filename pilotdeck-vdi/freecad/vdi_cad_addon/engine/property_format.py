"""Format PlantObject properties for VDI TaskPanel display."""

import json
import os
from typing import Any, Dict, List, Optional

_TEMPLATE_CACHE: Optional[Dict[str, Any]] = None


def _templates_path() -> str:
    return os.path.normpath(
        os.path.join(os.path.dirname(__file__), "..", "vdi_cad_core", "object_field_templates.json")
    )


def load_field_templates() -> Dict[str, Any]:
    global _TEMPLATE_CACHE
    if _TEMPLATE_CACHE is not None:
        return _TEMPLATE_CACHE
    path = _templates_path()
    with open(path, encoding="utf-8") as f:
        _TEMPLATE_CACHE = json.load(f)
    return _TEMPLATE_CACHE


def format_plant_object(plant_obj: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert raw PlantObject dict to display structure.
    Returns: { tag, class, class_label, object_id, fields: [{key, label, value, unit}] }
    """
    templates = load_field_templates()
    class_name = plant_obj.get("class") or "Equipment"
    class_meta = (templates.get("classes") or {}).get(class_name, {})
    class_label = class_meta.get("label", class_name)
    attrs = plant_obj.get("attributes") or {}
    field_defs = sorted(class_meta.get("fields") or [], key=lambda f: f.get("order", 99))

    fields: List[Dict[str, Any]] = []
    seen_keys = set()
    for fd in field_defs:
        key = fd.get("key", "")
        if not key:
            continue
        val = attrs.get(key)
        if val is None or val == "":
            continue
        unit = fd.get("unit", "")
        display_val = f"{val} {unit}".strip() if unit else str(val)
        fields.append({
            "key": key,
            "label": fd.get("label", key),
            "value": val,
            "display": display_val,
            "unit": unit,
        })
        seen_keys.add(key)

    for key, val in attrs.items():
        if key in seen_keys or val is None or val == "":
            continue
        if key.startswith("_"):
            continue
        fields.append({
            "key": key,
            "label": key,
            "value": val,
            "display": str(val),
            "unit": "",
        })

    return {
        "object_id": plant_obj.get("object_id", ""),
        "tag": plant_obj.get("tag", ""),
        "class": class_name,
        "class_label": class_label,
        "fields": fields,
        "relationships": plant_obj.get("relationships") or [],
    }


def format_from_fc_object(obj) -> Optional[Dict[str, Any]]:
    """Format from FreeCAD DocumentObject with VDI_* props."""
    from engine.object_factory import get_plant_object_props

    props = get_plant_object_props(obj)
    if not props:
        return None
    return format_plant_object(props)
