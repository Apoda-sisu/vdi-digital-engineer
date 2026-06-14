"""macOS Qt font warnings when TechDraw workbench loads (missing generic 'Sans' family)."""

import sys

_TECHDRAW_FONT = "osifont"
_MACOS_UI_FONTS = ("PingFang SC", "Helvetica Neue", "Helvetica", "Arial")


def configure_techdraw_preferences() -> None:
    """Ensure TechDraw label fonts are set to an installed family."""
    try:
        import FreeCAD as App

        p = App.ParamGet("User parameter:BaseApp/Preferences/Mod/TechDraw")
        for key in ("LabelFont", "BalloonFont", "FormatFont"):
            try:
                current = p.GetString(key, "")
                if not current or current.lower() in ("sans", "sans-serif"):
                    p.SetString(key, _TECHDRAW_FONT)
            except Exception:
                pass
    except Exception:
        pass


def configure_qt_application_font() -> None:
    """Prefer a macOS system font for the Qt UI to reduce 'Sans' alias lookups."""
    if sys.platform != "darwin":
        return
    try:
        from PySide2.QtGui import QFont, QApplication
    except ImportError:
        try:
            from PySide6.QtGui import QFont, QApplication
        except ImportError:
            return

    app = QApplication.instance()
    if not app:
        return
    for family in _MACOS_UI_FONTS:
        font = QFont(family)
        if font.family():
            app.setFont(font)
            break


def install_sans_warning_filter() -> None:
    """Filter benign qt.qpa.fonts 'missing Sans' warnings (FreeCAD TechDraw on macOS)."""
    if sys.platform != "darwin":
        return
    try:
        from PySide2.QtCore import qInstallMessageHandler
    except ImportError:
        try:
            from PySide6.QtCore import qInstallMessageHandler
        except ImportError:
            return

    state = {"previous": None}

    def _handler(mode, context, message):
        msg = message if isinstance(message, str) else str(message)
        if "qt.qpa.fonts" in msg and "Sans" in msg:
            return
        prev = state["previous"]
        if prev:
            prev(mode, context, message)

    state["previous"] = qInstallMessageHandler(_handler)


def apply_macos_font_compat() -> None:
    configure_techdraw_preferences()
    configure_qt_application_font()
    install_sans_warning_filter()
