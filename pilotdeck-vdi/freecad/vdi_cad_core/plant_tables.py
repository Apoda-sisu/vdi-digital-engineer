"""Build standard tables from PlantModel objects."""

from __future__ import annotations

from typing import Any, Dict, List


def _format_dn(dn: Any) -> str:
    if dn is None or dn == "":
        return ""
    s = str(dn).strip()
    if not s:
        return ""
    if s.upper().startswith("DN"):
        return s.upper()
    return f"DN{s}"


def build_pipe_table_from_model(model: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Pipe list rows sourced from PipeRun PlantObjects (not hardcoded)."""
    rows: List[Dict[str, Any]] = []
    for obj in model.get("objects") or []:
        if obj.get("class") != "PipeRun":
            continue
        attrs = obj.get("attributes") or {}
        rows.append({
            "object_id": obj.get("object_id", ""),
            "line_no": obj.get("tag", ""),
            "from_tag": attrs.get("from_tag", ""),
            "to_tag": attrs.get("to_tag", ""),
            "dn": attrs.get("dn", ""),
            "dn_label": _format_dn(attrs.get("dn")),
            "fluid": attrs.get("fluid", ""),
            "phase": attrs.get("phase", ""),
            "design_P_MPaG": attrs.get("design_P_MPaG"),
            "design_T_C": attrs.get("design_T_C"),
            "material": attrs.get("material", ""),
            "insulation": attrs.get("insulation", ""),
            "stream_no": attrs.get("stream_no", ""),
        })
    rows.sort(key=lambda r: r.get("line_no", ""))
    return rows


def pipe_table_row_text(row: Dict[str, Any]) -> str:
    return (
        f"{row.get('line_no', '')} | "
        f"{row.get('from_tag', '')}→{row.get('to_tag', '')} | "
        f"{row.get('dn_label') or _format_dn(row.get('dn'))} | "
        f"{row.get('fluid', '')}"
    )
