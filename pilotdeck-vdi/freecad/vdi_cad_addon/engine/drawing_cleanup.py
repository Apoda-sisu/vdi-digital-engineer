"""Post-render cleanup — hide model-space clutter, focus TechDraw sheet."""

import FreeCAD as App


def hide_model_space_geometry(doc: App.Document, sheet_name: str = "VDI_Sheet") -> dict:
    """Hide Part/Annotation objects in 3D view; show TechDraw page only."""
    info = {"hidden": 0, "sheet": sheet_name, "view": "model_space"}
    page = doc.getObject(sheet_name)
    try:
        import FreeCADGui as Gui

        gui_doc = Gui.getDocument(doc.Name)
        if gui_doc is None:
            return info

        for obj in doc.Objects:
            if not hasattr(obj, "ViewObject") or obj.ViewObject is None:
                continue
            if obj.TypeId.startswith("TechDraw::"):
                obj.ViewObject.Visibility = True
                continue
            obj.ViewObject.Visibility = False
            info["hidden"] += 1

        if page and hasattr(page, "ViewObject") and page.ViewObject:
            try:
                gui_doc.setActiveView(page.ViewObject)
                info["view"] = "techdraw_page"
            except Exception:
                pass
    except Exception:
        pass
    return info


def clear_ephemeral_drawing_objects(doc: App.Document) -> int:
    """Remove prior drawing geometry (keep plant proxy objects with VDI_ObjectId)."""
    removed = 0
    for obj in list(doc.Objects):
        name = obj.Name
        if obj.TypeId.startswith("TechDraw::"):
            doc.removeObject(name)
            removed += 1
            continue
        if obj.TypeId in ("Part::Feature", "App::Annotation"):
            if getattr(obj, "VDI_ObjectId", ""):
                continue
            doc.removeObject(name)
            removed += 1
    if removed:
        doc.recompute()
    return removed
