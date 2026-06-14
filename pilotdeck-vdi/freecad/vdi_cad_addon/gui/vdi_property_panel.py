"""VDI property TaskPanel — formatted read-only plant object display."""

from typing import Any, Dict, Optional

try:
    from PySide2 import QtCore, QtGui, QtWidgets
except ImportError:
    from PySide6 import QtCore, QtGui, QtWidgets


class VDIPropertyPanel(QtWidgets.QWidget):
    """Dock widget showing formatted PlantObject fields."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("VDI 对象属性")
        self._build_ui()
        self.clear()

    def _build_ui(self):
        layout = QtWidgets.QVBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)

        self._header = QtWidgets.QLabel("未选中对象")
        font = self._header.font()
        font.setBold(True)
        font.setPointSize(11)
        self._header.setFont(font)
        layout.addWidget(self._header)

        self._meta = QtWidgets.QLabel("")
        self._meta.setWordWrap(True)
        self._meta.setStyleSheet("color: #666; font-size: 10pt;")
        layout.addWidget(self._meta)

        self._table = QtWidgets.QTableWidget(0, 2)
        self._table.setHorizontalHeaderLabels(["属性", "值"])
        self._table.horizontalHeader().setStretchLastSection(True)
        self._table.verticalHeader().setVisible(False)
        self._table.setEditTriggers(QtWidgets.QAbstractItemView.NoEditTriggers)
        self._table.setSelectionMode(QtWidgets.QAbstractItemView.NoSelection)
        layout.addWidget(self._table)

        self._hint = QtWidgets.QLabel("")
        self._hint.setWordWrap(True)
        self._hint.setStyleSheet("color: #888; font-style: italic;")
        layout.addWidget(self._hint)

    def clear(self, hint: str = "在组合视图或 TechDraw 页选择带 VDI 属性的对象"):
        self._header.setText("未选中对象")
        self._meta.setText("")
        self._table.setRowCount(0)
        self._hint.setText(hint)

    def show_formatted(self, formatted: Dict[str, Any]) -> None:
        tag = formatted.get("tag") or "—"
        class_label = formatted.get("class_label") or formatted.get("class") or ""
        self._header.setText(f"{tag}  ({class_label})")
        oid = formatted.get("object_id", "")
        self._meta.setText(f"object_id: {oid[:8]}…{oid[-4:]}" if len(oid) > 16 else f"object_id: {oid}")

        fields = formatted.get("fields") or []
        self._table.setRowCount(len(fields))
        for row, field in enumerate(fields):
            self._table.setItem(row, 0, QtWidgets.QTableWidgetItem(field.get("label", "")))
            self._table.setItem(row, 1, QtWidgets.QTableWidgetItem(field.get("display", "")))
        self._table.resizeColumnsToContents()
        self._hint.setText("只读展示 · 修改属性请通过 PlantModel / MCP apply_delta")

    def show_hint(self, message: str) -> None:
        self.clear(hint=message)


_panel_instance: Optional[VDIPropertyPanel] = None
_dock_instance: Optional[QtWidgets.QDockWidget] = None


def get_or_create_panel() -> VDIPropertyPanel:
    global _panel_instance, _dock_instance
    if _panel_instance is not None:
        return _panel_instance

    import FreeCADGui as Gui

    _panel_instance = VDIPropertyPanel()
    mw = Gui.getMainWindow()
    _dock_instance = QtWidgets.QDockWidget("VDI 对象属性", mw)
    _dock_instance.setObjectName("VDIPropertyPanelDock")
    _dock_instance.setWidget(_panel_instance)
    mw.addDockWidget(QtCore.Qt.RightDockWidgetArea, _dock_instance)
    _dock_instance.show()
    return _panel_instance
