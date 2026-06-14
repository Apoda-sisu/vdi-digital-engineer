"""PlantModel merge by object_id."""

from typing import Any, Dict, List, Optional

from vdi_cad_core.revision import append_change_log, next_revision, sync_view_revisions


def merge_objects(existing: List[Dict[str, Any]], incoming: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Upsert plant objects by object_id."""
    by_id: Dict[str, Dict[str, Any]] = {}
    for obj in existing:
        oid = obj.get("object_id")
        if oid:
            by_id[oid] = dict(obj)

    for obj in incoming:
        oid = obj.get("object_id")
        if not oid:
            continue
        if oid in by_id:
            merged = {**by_id[oid], **obj}
            merged["attributes"] = {
                **(by_id[oid].get("attributes") or {}),
                **(obj.get("attributes") or {}),
            }
            if obj.get("relationships") is not None:
                merged["relationships"] = obj.get("relationships")
            by_id[oid] = merged
        else:
            by_id[oid] = dict(obj)

    return list(by_id.values())


def merge_views(existing: List[Dict[str, Any]], incoming: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_id: Dict[str, Dict[str, Any]] = {v.get("view_id"): dict(v) for v in existing if v.get("view_id")}

    for view in incoming:
        vid = view.get("view_id")
        if not vid:
            continue
        if vid in by_id:
            merged = {**by_id[vid], **view}
            merged["placements"] = {
                **(by_id[vid].get("placements") or {}),
                **(view.get("placements") or {}),
            }
            if view.get("title_block"):
                merged["title_block"] = {
                    **(by_id[vid].get("title_block") or {}),
                    **view.get("title_block"),
                }
            by_id[vid] = merged
        else:
            by_id[vid] = dict(view)

    return list(by_id.values())


def merge_plant_model(base: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    """Merge patch into base PlantModel."""
    result = {
        "version": patch.get("version") or base.get("version") or "1.0",
        "project_id": patch.get("project_id") or base.get("project_id", ""),
        "revision": patch.get("revision") or base.get("revision", "A"),
        "objects": merge_objects(base.get("objects") or [], patch.get("objects") or []),
        "views": merge_views(base.get("views") or [], patch.get("views") or []),
        "change_log": list(base.get("change_log") or []) + list(patch.get("change_log") or []),
    }

    meta = {}
    if base.get("_meta"):
        meta.update(base["_meta"])
    if patch.get("_meta"):
        meta.update(patch["_meta"])
    if meta:
        result["_meta"] = meta

    return result


def merge_plant_model_with_revision(
    base: Dict[str, Any],
    patch: Dict[str, Any],
    *,
    bump_revision: bool = True,
    author: Optional[str] = None,
    summary: Optional[str] = None,
) -> Dict[str, Any]:
    """Merge patch and record change_log; optionally bump revision and sync views."""
    changed = [o.get("object_id") for o in patch.get("objects") or [] if o.get("object_id")]
    result = merge_plant_model(base, patch)
    if not changed:
        return result

    if bump_revision:
        result["revision"] = next_revision(base.get("revision"))
        result = sync_view_revisions(result)

    result = append_change_log(result, {
        "revision": result.get("revision"),
        "author": author or "system",
        "action": "merge",
        "object_ids": changed,
        "summary": summary or f"Merged {len(changed)} object(s)",
    })
    return result
