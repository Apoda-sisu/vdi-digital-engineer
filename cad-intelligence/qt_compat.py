"""FreeCAD 1.1 / PySide6 兼容层 — 与 Mod/CadIntelligence/qt_compat.py 同步"""


def _ensure_signals(QtCore):
    if not hasattr(QtCore, "Signal"):
        QtCore.Signal = QtCore.pyqtSignal


def import_qt():
    try:
        from PySide import QtGui, QtCore
        if hasattr(QtGui, "QDialog"):
            _ensure_signals(QtCore)
            return QtGui, QtCore
    except ImportError:
        pass

    try:
        from PySide2 import QtGui, QtCore
        _ensure_signals(QtCore)
        return QtGui, QtCore
    except ImportError:
        pass

    from PySide6 import QtWidgets, QtCore, QtGui as QtGuiModule
    _ensure_signals(QtCore)

    class _QtGuiShim:
        pass

    shim = _QtGuiShim()
    for name in dir(QtWidgets):
        if name.startswith("_"):
            continue
        setattr(shim, name, getattr(QtWidgets, name))
    for name in dir(QtGuiModule):
        if name.startswith("_"):
            continue
        if not hasattr(shim, name):
            setattr(shim, name, getattr(QtGuiModule, name))

    return shim, QtCore
