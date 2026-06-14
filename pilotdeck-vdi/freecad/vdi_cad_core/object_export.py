"""Export PlantModel object list to CSV."""

from __future__ import annotations

import csv
import io
from typing import Any, Dict, List


CSV_COLUMNS = [
    "object_id",
    "class",
    "tag",
    "equipment_type",
    "design_P_MPaG",
    "design_T_C",
    "oper_P_MPaG",
    "oper_T_C",
    "material",
    "dn",
    "fluid",
    "inst_type",
    "loop_id",
    "valve_type",
    "set_P_MPaG",
]


def plant_model_to_object_list_csv(model: Dict[str, Any]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(CSV_COLUMNS)
    for obj in model.get("objects") or []:
        attrs = obj.get("attributes") or {}
        writer.writerow([
            obj.get("object_id", ""),
            obj.get("class", ""),
            obj.get("tag", ""),
            attrs.get("equipment_type", ""),
            attrs.get("design_P_MPaG", ""),
            attrs.get("design_T_C", ""),
            attrs.get("oper_P_MPaG", ""),
            attrs.get("oper_T_C", ""),
            attrs.get("material", ""),
            attrs.get("dn", ""),
            attrs.get("fluid", ""),
            attrs.get("inst_type", ""),
            attrs.get("loop_id", ""),
            attrs.get("valve_type", ""),
            attrs.get("set_P_MPaG", ""),
        ])
    return buf.getvalue()


def write_object_list_csv(model: Dict[str, Any], output_path: str) -> Dict[str, Any]:
    content = plant_model_to_object_list_csv(model)
    with open(output_path, "w", encoding="utf-8", newline="") as f:
        f.write(content)
    return {"status": "success", "path": output_path, "rows": len(model.get("objects") or [])}


def equipment_design_summary(model: Dict[str, Any]) -> Dict[str, Any]:
    equipment = [o for o in model.get("objects") or [] if o.get("class") == "Equipment"]
    with_p = [e for e in equipment if (e.get("attributes") or {}).get("design_P_MPaG") is not None]
    with_t = [e for e in equipment if (e.get("attributes") or {}).get("design_T_C") is not None]
    return {
        "total": len(equipment),
        "with_design_P": len(with_p),
        "with_design_T": len(with_t),
        "complete": len(with_p) == len(equipment) and len(with_t) == len(equipment),
    }
