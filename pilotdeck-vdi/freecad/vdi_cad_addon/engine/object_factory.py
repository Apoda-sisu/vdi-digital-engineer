"""FreeCAD plant object factory — VDI CustomProperty binding."""

import json
from typing import Any, Dict, List, Optional

import FreeCAD as App
import Part

from engine.utils import safe_object_name

VDI_PROP_GROUP = "VDI"


def _ensure_vdi_properties(obj: App.DocumentObject) -> None:
    """Add VDI namespace properties if missing."""
    props = {
        "VDI_ObjectId": ("App::PropertyString", "Object UUID"),
        "VDI_Class": ("App::PropertyString", "PlantObject class"),
        "VDI_Tag": ("App::PropertyString", "Tag"),
        "VDI_Attributes": ("App::PropertyString", "JSON attributes"),
    }
    for name, (ptype, doc) in props.items():
        if not hasattr(obj, name):
            obj.addProperty(ptype, name, VDI_PROP_GROUP, doc)


def set_plant_object_props(
    obj: App.DocumentObject,
    object_id: str,
    class_name: str,
    tag: str,
    attributes: Optional[Dict[str, Any]] = None,
) -> None:
    _ensure_vdi_properties(obj)
    obj.VDI_ObjectId = object_id or ""
    obj.VDI_Class = class_name or ""
    obj.VDI_Tag = tag or ""
    obj.VDI_Attributes = json.dumps(attributes or {}, ensure_ascii=False)
    if tag:
        obj.Label = tag


def get_plant_object_props(obj: App.DocumentObject) -> Optional[Dict[str, Any]]:
    if not hasattr(obj, "VDI_ObjectId") or not obj.VDI_ObjectId:
        return None
    attrs = {}
    if hasattr(obj, "VDI_Attributes") and obj.VDI_Attributes:
        try:
            attrs = json.loads(obj.VDI_Attributes)
        except json.JSONDecodeError:
            attrs = {"_raw": obj.VDI_Attributes}
    return {
        "object_id": obj.VDI_ObjectId,
        "class": obj.VDI_Class if hasattr(obj, "VDI_Class") else "",
        "tag": obj.VDI_Tag if hasattr(obj, "VDI_Tag") else obj.Label,
        "attributes": attrs,
        "relationships": [],
    }


def build_object_index(doc: App.Document) -> Dict[str, App.DocumentObject]:
    index: Dict[str, App.DocumentObject] = {}
    for obj in doc.Objects:
        if hasattr(obj, "VDI_ObjectId") and obj.VDI_ObjectId:
            index[obj.VDI_ObjectId] = obj
    return index


def find_by_object_id(doc: App.Document, object_id: str) -> Optional[App.DocumentObject]:
    return build_object_index(doc).get(object_id)


def ensure_plant_objects(
    doc: App.Document,
    objects: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Upsert proxy objects for plant objects without geometry.
    Returns stats: created, updated, total.
    """
    index = build_object_index(doc)
    created = 0
    updated = 0

    for plant_obj in objects:
        oid = plant_obj.get("object_id", "")
        if not oid:
            continue

        tag = plant_obj.get("tag", "")
        class_name = plant_obj.get("class", "Equipment")
        attributes = plant_obj.get("attributes") or {}

        existing = index.get(oid)
        if existing:
            set_plant_object_props(existing, oid, class_name, tag, attributes)
            updated += 1
        else:
            name = safe_object_name("PO", tag or oid[:8])
            fc = doc.addObject("Part::Feature", name)
            fc.Shape = Part.makeLine(App.Vector(0, 0, 0), App.Vector(0.01, 0, 0))
            try:
                if fc.ViewObject:
                    fc.ViewObject.Visibility = False
            except Exception:
                pass
            set_plant_object_props(fc, oid, class_name, tag, attributes)
            index[oid] = fc
            created += 1

    doc.recompute()
    return {
        "created": created,
        "updated": updated,
        "total": len(index),
    }


def bind_geometry_to_object(
    geom_obj: App.DocumentObject,
    object_id: str,
    class_name: str,
    tag: str,
    attributes: Optional[Dict[str, Any]] = None,
) -> App.DocumentObject:
    """Attach VDI properties to an existing geometry object."""
    set_plant_object_props(geom_obj, object_id, class_name, tag, attributes)
    return geom_obj


def extract_plant_model_from_doc(doc: App.Document, project_id: str = "", revision: str = "A") -> Dict[str, Any]:
    """Extract PlantModel from document VDI properties."""
    objects: List[Dict[str, Any]] = []
    for obj in doc.Objects:
        props = get_plant_object_props(obj)
        if props:
            objects.append(props)

    return {
        "version": "1.0",
        "project_id": project_id,
        "revision": revision,
        "objects": objects,
        "views": [],
        "change_log": [],
    }


def apply_delta_to_doc(doc: App.Document, delta: Dict[str, Any]) -> Dict[str, Any]:
    """
    Apply delta updates to document objects.
    delta: { updates: [{ object_id, attributes }] }
    """
    index = build_object_index(doc)
    applied: List[str] = []

    for upd in delta.get("updates") or []:
        oid = upd.get("object_id", "")
        if not oid or oid not in index:
            continue
        obj = index[oid]
        current = get_plant_object_props(obj) or {}
        new_attrs = {**(current.get("attributes") or {}), **(upd.get("attributes") or {})}
        set_plant_object_props(
            obj,
            oid,
            upd.get("class") or current.get("class", ""),
            upd.get("tag") or current.get("tag", ""),
            new_attrs,
        )
        applied.append(oid)

    doc.recompute()
    return {"applied": applied, "count": len(applied)}
