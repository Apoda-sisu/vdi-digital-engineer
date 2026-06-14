"""PlantModel revision traceability."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

REVISION_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def next_revision(current: Optional[str]) -> str:
    rev = (current or "A").strip().upper()
    if not rev:
        return "A"
    last = rev[-1]
    prefix = rev[:-1]
    idx = REVISION_LETTERS.find(last)
    if 0 <= idx < len(REVISION_LETTERS) - 1:
        return prefix + REVISION_LETTERS[idx + 1]
    return f"{rev}1"


def append_change_log(model: Dict[str, Any], entry: Dict[str, Any]) -> Dict[str, Any]:
    log = list(model.get("change_log") or [])
    log.append({
        "timestamp": entry.get("timestamp") or datetime.now(timezone.utc).isoformat(),
        "revision": entry.get("revision") or model.get("revision"),
        "author": entry.get("author") or "system",
        "action": entry.get("action") or "update",
        "object_ids": entry.get("object_ids") or [],
        "summary": entry.get("summary") or "",
    })
    return {**model, "change_log": log}


def sync_view_revisions(model: Dict[str, Any]) -> Dict[str, Any]:
    revision = model.get("revision") or "A"
    views = []
    for v in model.get("views") or []:
        tb = dict(v.get("title_block") or {})
        tb["revision"] = revision
        views.append({**v, "title_block": tb})
    return {**model, "views": views}


def apply_plant_delta(model: Dict[str, Any], delta: Dict[str, Any]) -> Dict[str, Any]:
    by_id = {o["object_id"]: dict(o) for o in model.get("objects") or [] if o.get("object_id")}
    changed_ids: List[str] = []

    for patch in delta.get("objects") or []:
        oid = patch.get("object_id")
        if not oid:
            continue
        changed_ids.append(oid)
        if oid in by_id:
            existing = by_id[oid]
            merged = {**existing, **patch}
            merged["attributes"] = {**(existing.get("attributes") or {}), **(patch.get("attributes") or {})}
            if patch.get("relationships") is not None:
                merged["relationships"] = patch.get("relationships")
            by_id[oid] = merged
        else:
            by_id[oid] = dict(patch)

    result = {**model, "objects": list(by_id.values())}
    if not changed_ids:
        return result

    bump = delta.get("bump_revision", True)
    new_rev = next_revision(model.get("revision")) if bump else model.get("revision", "A")
    result["revision"] = new_rev
    result = append_change_log(result, {
        "revision": new_rev,
        "author": delta.get("author"),
        "action": "delta_apply",
        "object_ids": changed_ids,
        "summary": delta.get("summary") or f"Updated {len(changed_ids)} object(s)",
    })
    if bump:
        result = sync_view_revisions(result)
    return result


def validate_revision_consistency(model: Dict[str, Any]) -> Tuple[bool, List[Dict[str, str]]]:
    issues: List[Dict[str, str]] = []
    model_rev = model.get("revision") or "A"
    for view in model.get("views") or []:
        tb_rev = (view.get("title_block") or {}).get("revision")
        if tb_rev and tb_rev != model_rev:
            issues.append({
                "severity": "warning",
                "code": "REVISION_MISMATCH",
                "message": f"View {view.get('view_id')} revision={tb_rev} != model.revision={model_rev}",
            })
    if not model.get("change_log"):
        issues.append({
            "severity": "info",
            "code": "NO_CHANGE_LOG",
            "message": "PlantModel has no change_log entries",
        })
    ok = all(i["severity"] != "error" for i in issues)
    return ok, issues
