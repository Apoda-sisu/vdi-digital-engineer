"""Document export — FCStd, DXF, PDF, STEP, CSV."""

import os
from typing import Any, Dict

import FreeCAD as App


def export_document(format_type: str, output_path: str) -> Dict[str, Any]:
    """Export active document to specified format."""
    doc = App.ActiveDocument
    if not doc:
        return {"status": "error", "message": "No active document"}

    fmt = format_type.upper()
    os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)

    try:
        if fmt == "FCSTD":
            doc.saveAs(output_path)
        elif fmt == "DXF":
            _export_dxf(doc, output_path)
        elif fmt == "PDF":
            _export_pdf(doc, output_path)
        elif fmt == "STEP":
            _export_step(doc, output_path)
        elif fmt == "CSV":
            return {"status": "error", "message": "Use export_object_list_csv for CSV export"}
        else:
            return {"status": "error", "message": f"Unsupported format: {format_type}"}

        if os.path.isfile(output_path):
            return {"status": "success", "path": output_path, "format": fmt}
        return {"status": "error", "message": f"Export file not created: {output_path}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def _techdraw_page(doc):
    for obj in doc.Objects:
        if obj.TypeId == "TechDraw::DrawPage":
            return obj
    return None


def _export_dxf(doc, output_path: str):
    """Export DXF — TechDraw page preferred, then importDXF fallback."""
    page = _techdraw_page(doc)
    if page:
        try:
            page.exportPageAsDxf(output_path)
            if os.path.isfile(output_path):
                return
        except Exception:
            pass

    try:
        import importDXF

        objects = [obj for obj in doc.Objects if hasattr(obj, "Shape")]
        importDXF.export(objects, output_path)
        return
    except ImportError:
        pass

    doc.saveAs(output_path.replace(".dxf", ".FCStd"))


def _export_pdf(doc, output_path: str):
    """Export PDF — TechDraw page preferred, GUI screenshot fallback."""
    page = _techdraw_page(doc)
    if page:
        try:
            page.saveGraphicAsPdf(output_path)
            if os.path.isfile(output_path):
                return
        except Exception:
            pass

    try:
        import FreeCADGui as Gui

        view = Gui.ActiveDocument.ActiveView if Gui.activeDocument() else None
        if view:
            view.saveImage(output_path, 1920, 1080, "Current")
            return
    except Exception:
        pass

    raise RuntimeError("No TechDraw page or GUI view available for PDF export")


def _export_step(doc, output_path: str):
    objects = [obj for obj in doc.Objects if hasattr(obj, "Shape") and obj.Shape]
    if objects:
        import Import

        Import.export(objects, output_path)
    else:
        raise RuntimeError("No shapes to export as STEP")
