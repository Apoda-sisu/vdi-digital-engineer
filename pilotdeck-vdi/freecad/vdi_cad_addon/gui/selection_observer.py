"""FreeCAD selection observer — updates VDI property panel on pick."""

from typing import Any, Dict, Optional

_observer_instance = None
_pick_mode = "techdraw"
_enabled = True
_last_pick_point = None


class VDISelectionObserver:
    """Gui.Selection observer callback."""

    def addSelection(self, doc, obj, sub, pnt):
        global _last_pick_point
        _last_pick_point = pnt
        self._on_selection_changed()

    def removeSelection(self, doc, obj, sub):
        self._on_selection_changed()

    def setSelection(self, doc):
        self._on_selection_changed()

    def clearSelection(self, doc):
        self._on_selection_changed()

    def _on_selection_changed(self):
        if not _enabled:
            return
        try:
            from gui.vdi_property_panel import get_or_create_panel
            from engine.pick_resolver import resolve_selection, extract_pick_point

            import FreeCAD as App
            import FreeCADGui as Gui

            doc = App.ActiveDocument
            if not doc:
                get_or_create_panel().clear()
                return

            selection_ex = Gui.Selection.getSelectionEx()
            pick_pt = extract_pick_point(selection_ex, _last_pick_point)
            result = resolve_selection(
                doc,
                selection_ex,
                pick_mode=_pick_mode,
                pick_point=pick_pt,
            )

            panel = get_or_create_panel()
            if result.get("status") == "hit" and result.get("formatted"):
                panel.show_formatted(result["formatted"])
            elif result.get("hint"):
                panel.show_hint(result["hint"])
            else:
                panel.clear()
        except Exception as exc:
            try:
                from gui.vdi_property_panel import get_or_create_panel
                get_or_create_panel().show_hint(f"选择解析错误: {exc}")
            except Exception:
                pass


def register_vdi_selection(pick_mode: str = "techdraw", enabled: bool = True) -> Dict[str, Any]:
    """Register selection observer; call from InitGui."""
    global _observer_instance, _pick_mode, _enabled

    import FreeCADGui as Gui

    _pick_mode = pick_mode
    _enabled = enabled

    if not enabled:
        return {"status": "skipped", "message": "VDI selection observer disabled"}

    if _observer_instance is None:
        _observer_instance = VDISelectionObserver()
        Gui.Selection.addObserver(_observer_instance)

    from gui.vdi_property_panel import get_or_create_panel
    get_or_create_panel()

    return {"status": "success", "pick_mode": pick_mode}


def unregister_vdi_selection() -> None:
    global _observer_instance
    if _observer_instance is None:
        return
    try:
        import FreeCADGui as Gui
        Gui.Selection.removeObserver(_observer_instance)
    except Exception:
        pass
    _observer_instance = None


def set_pick_mode(mode: str) -> None:
    global _pick_mode
    _pick_mode = mode
