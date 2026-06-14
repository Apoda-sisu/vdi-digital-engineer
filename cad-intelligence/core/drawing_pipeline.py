"""统一绘图管线 — Mod / CLI / AI 共用

按 output_config.drawing_type 分发:
  pfd / pid / 2d  -> drawing2d (平面符号 + TechDraw 页)
  3d / model      -> equipment3d (参数化三维设备)
  其他            -> 兼容旧 geometry_engine 路径
"""

import logging
from typing import Any, Dict, Optional

from core.geometry_engine import GeometryEngine
from core.paths import ensure_package_on_syspath, load_merged_config

logger = logging.getLogger(__name__)

MODE_2D = ("pfd", "pid", "2d", "pfd2d", "drawing")
MODE_3D = ("3d", "model", "model3d", "plant3d")
MODE_LAYOUT = ("layout", "layout2d")
MODE_ISO = ("isometric", "iso", "isometric2d")


class DrawingPipeline:
    """scheme JSON -> FreeCAD 文档（不关闭活动文档）"""

    def __init__(self, use_active_document: bool = True):
        ensure_package_on_syspath()
        self.config = load_merged_config()
        self.engine = GeometryEngine(use_active_document=use_active_document)
        self._owns_doc = not use_active_document

    @property
    def doc(self):
        return self.engine.doc

    def apply_scheme(self, scheme: Dict[str, Any], bump_revision: bool = False) -> Dict[str, Any]:
        from core.scheme_schema import enrich_scheme

        scheme = enrich_scheme(scheme, bump_revision=bump_revision)
        drawing_type = (
            (scheme.get("output_config") or {}).get("drawing_type", "")
        ).lower()

        if drawing_type in MODE_3D:
            from core.equipment3d import build_plant3d
            result = build_plant3d(self.doc, scheme)
        elif drawing_type == "pid":
            from core.drawing_pid import build_pid2d
            result = build_pid2d(self.doc, scheme, self.engine.symbols)
        elif drawing_type in MODE_LAYOUT:
            from core.drawing_layout import build_layout2d
            result = build_layout2d(self.doc, scheme, self.engine.symbols)
        elif drawing_type in MODE_ISO:
            from core.drawing_isometric import build_isometric2d
            result = build_isometric2d(self.doc, scheme, self.engine.symbols)
        elif drawing_type in MODE_2D:
            from core.drawing2d import build_pfd2d
            result = build_pfd2d(self.doc, scheme, self.engine.symbols)
        else:
            result = self.engine.generate(scheme)
        self._fit_view()
        return result

    def apply_json_file(self, json_path: str) -> Dict[str, Any]:
        from parsers.json_parser import JSONParser

        parser = JSONParser()
        data = parser.parse(json_path)
        result = self.apply_scheme(data)
        result["input_path"] = json_path
        return result

    def save_active(self, output_path: str) -> Dict[str, Any]:
        return self.engine.save_document(output_path)

    def _fit_view(self):
        try:
            import FreeCADGui as Gui

            if Gui.activeDocument():
                Gui.activeDocument().activeView().viewAxonometric()
                Gui.SendMsgToActiveView("ViewFit")
        except Exception:
            pass

    def close(self):
        if self._owns_doc:
            self.engine.close()
