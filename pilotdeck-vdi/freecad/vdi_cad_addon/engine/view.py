"""GUI view helpers — activate document and show TechDraw page or fit 2D content."""

import FreeCAD as App


def _open_techdraw_page(gui_doc, page) -> bool:
    """Switch GUI to TechDraw page view when available."""
    try:
        import FreeCADGui as Gui

        if hasattr(Gui, "activateView") and hasattr(page, "PageResult"):
            Gui.activateView("TechDrawGui::ViewPage", page.PageResult)
            return True
    except Exception:
        pass

    try:
        import FreeCADGui as Gui

        view_obj = page.ViewObject
        if view_obj and gui_doc:
            gui_doc.setActiveView(view_obj)
            return True
    except Exception:
        pass
    return False


def activate_and_fit(doc: App.Document, sheet_name: str = "VDI_Sheet") -> dict:
    """Activate document; prefer TechDraw sheet view over raw model space."""
    App.setActiveDocument(doc.Name)
    info = {"document": doc.Name, "object_count": len(doc.Objects), "view": "skipped"}

    page = doc.getObject(sheet_name)
    if page:
        info["sheet"] = sheet_name

    try:
        import FreeCADGui as Gui

        gui_doc = Gui.getDocument(doc.Name)
        if gui_doc is None:
            gui_doc = Gui.newDocument(doc.Name, doc)
        Gui.ActiveDocument = gui_doc

        if page and _open_techdraw_page(gui_doc, page):
            info["view"] = "techdraw_page"
            return info

        for obj in doc.Objects:
            if not hasattr(obj, "ViewObject") or obj.ViewObject is None:
                continue
            if obj.TypeId.startswith("TechDraw::"):
                continue
            obj.ViewObject.Visibility = True
            if hasattr(obj.ViewObject, "LineWidth"):
                obj.ViewObject.LineWidth = 2.0
            if obj.TypeId == "App::Annotation" and hasattr(obj.ViewObject, "FontSize"):
                if obj.ViewObject.FontSize < 3.0:
                    obj.ViewObject.FontSize = 4.0

        if gui_doc.ActiveView:
            gui_doc.ActiveView.viewTop()
            Gui.SendMsgToActiveView("ViewFit")
            info["view"] = "top+fit"
    except Exception as e:
        info["view_error"] = str(e)

    return info
