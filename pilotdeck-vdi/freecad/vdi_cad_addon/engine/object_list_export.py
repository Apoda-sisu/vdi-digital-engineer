"""Export object list CSV from pipeline."""

from typing import Any, Dict

try:
    from vdi_cad_core.object_export import write_object_list_csv
except ImportError:
    write_object_list_csv = None


def export_object_list_if_requested(
    plant_model: Dict[str, Any],
    out_dir: str,
    basename: str,
    options: Dict[str, Any],
) -> Dict[str, Any]:
    if options.get("export_object_list") is False:
        return {"status": "skipped"}
    if not plant_model or not write_object_list_csv:
        return {"status": "skipped", "message": "no plant model or export module"}
    import os

    path = os.path.join(out_dir, f"{basename}_object_list.csv")
    return write_object_list_csv(plant_model, path)
