"""
导出引擎
支持多种CAD格式导出
"""

import logging
from pathlib import Path
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)


class ExportEngine:
    """导出引擎"""
    
    SUPPORTED_FORMATS = ["FCStd", "STEP", "IGES", "PDF", "DXF", "STL", "CSV"]
    
    def __init__(self, config: Optional[Dict] = None):
        """
        初始化导出引擎
        
        Args:
            config: 导出配置
        """
        self.config = config or {}
        self.output_dir = Path(self.config.get("output", {}).get("output_directory", "./output"))
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # FreeCAD环境
        self.App = None
        self.Part = None
        self.Mesh = None
        self._init_freecad()
        
        logger.info("导出引擎初始化完成")
    
    def _init_freecad(self):
        """初始化FreeCAD环境"""
        try:
            import FreeCAD as App
            import Part
            self.App = App
            self.Part = Part
            
            try:
                import Mesh
                self.Mesh = Mesh
            except ImportError:
                logger.warning("Mesh模块未加载，STL导出可能不可用")
            
            logger.info("FreeCAD导出环境初始化成功")
        except ImportError as e:
            logger.warning(f"FreeCAD未安装或无法导入: {e}")
            logger.info("将使用模拟模式运行")
    
    def export(self, document: Any, output_path: str, format_type: str, 
               options: Optional[Dict] = None) -> Dict[str, Any]:
        """
        导出文档
        
        Args:
            document: FreeCAD文档对象
            output_path: 输出路径
            format_type: 导出格式
            options: 导出选项
            
        Returns:
            导出结果
        """
        if format_type not in self.SUPPORTED_FORMATS:
            raise ValueError(f"不支持的导出格式: {format_type}")
        
        logger.info(f"开始导出文档: {format_type}")
        
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        result = {
            "status": "success",
            "format": format_type,
            "output_path": str(output_path),
            "file_size": 0
        }
        
        try:
            if format_type == "FCStd":
                self._export_fcstd(document, output_path)
            elif format_type == "STEP":
                self._export_step(document, output_path, options)
            elif format_type == "IGES":
                self._export_iges(document, output_path, options)
            elif format_type == "PDF":
                self._export_pdf(document, output_path, options)
            elif format_type == "DXF":
                self._export_dxf(document, output_path, options)
            elif format_type == "STL":
                self._export_stl(document, output_path, options)
            elif format_type == "CSV":
                self._export_csv(document, output_path, options)
            
            if output_path.exists():
                result["file_size"] = output_path.stat().st_size
            
            logger.info(f"导出完成: {output_path}")
            
        except Exception as e:
            result["status"] = "error"
            result["error"] = str(e)
            logger.error(f"导出失败: {e}")
        
        return result
    
    def _export_fcstd(self, document: Any, output_path: Path):
        """导出FreeCAD原生格式"""
        if document and self.App:
            document.saveAs(str(output_path))
            logger.info(f"导出FCStd: {output_path}")
        else:
            logger.warning("FreeCAD文档未初始化，跳过FCStd导出")
    
    def _export_step(self, document: Any, output_path: Path, options: Optional[Dict] = None):
        """导出STEP格式"""
        if document and self.Part:
            # 获取所有形状
            shapes = []
            for obj in document.Objects:
                if hasattr(obj, 'Shape'):
                    shapes.append(obj.Shape)
            
            if shapes:
                # 使用Part模块导出STEP
                self.Part.export(shapes, str(output_path))
                logger.info(f"导出STEP: {output_path}")
            else:
                logger.warning("没有可导出的形状")
        else:
            logger.warning("FreeCAD环境未初始化，跳过STEP导出")
    
    def _export_iges(self, document: Any, output_path: Path, options: Optional[Dict] = None):
        """导出IGES格式"""
        if document and self.Part:
            # 获取所有形状
            shapes = []
            for obj in document.Objects:
                if hasattr(obj, 'Shape'):
                    shapes.append(obj.Shape)
            
            if shapes:
                # 使用Part模块导出IGES
                self.Part.export(shapes, str(output_path))
                logger.info(f"导出IGES: {output_path}")
            else:
                logger.warning("没有可导出的形状")
        else:
            logger.warning("FreeCAD环境未初始化，跳过IGES导出")
    
    @staticmethod
    def _find_techdraw_page(document: Any):
        """查找文档中的 TechDraw 图纸页"""
        if not document:
            return None
        for obj in document.Objects:
            if obj.TypeId == "TechDraw::DrawPage":
                return obj
        return None

    def _export_pdf(self, document: Any, output_path: Path, options: Optional[Dict] = None):
        """导出 PDF（基于 TechDraw 图纸页，需要 GUI 环境）"""
        page = self._find_techdraw_page(document)
        if page is None:
            raise ValueError("文档中没有 TechDraw 图纸页（请先用 2D PFD 模式生成）")
        try:
            import TechDrawGui
        except ImportError:
            raise NotImplementedError("PDF 导出需要 FreeCAD GUI 环境（TechDrawGui），无头模式请用 DXF")
        TechDrawGui.exportPageAsPdf(page, str(output_path))
        logger.info(f"导出PDF: {output_path}")

    def _export_dxf(self, document: Any, output_path: Path, options: Optional[Dict] = None):
        """导出 DXF（基于 TechDraw 图纸页，支持无头模式）"""
        page = self._find_techdraw_page(document)
        if page is None:
            raise ValueError("文档中没有 TechDraw 图纸页（请先用 2D PFD 模式生成）")
        import TechDraw
        TechDraw.writeDXFPage(page, str(output_path))
        logger.info(f"导出DXF: {output_path}")
    
    def _export_stl(self, document: Any, output_path: Path, options: Optional[Dict] = None):
        """导出STL格式"""
        if document and self.Mesh:
            # 获取所有网格对象
            meshes = []
            for obj in document.Objects:
                if obj.TypeId == 'Mesh::Feature':
                    meshes.append(obj)
            
            if meshes:
                # 使用Mesh模块导出STL
                self.Mesh.export(meshes, str(output_path))
                logger.info(f"导出STL: {output_path}")
            else:
                # 如果没有网格对象，尝试导出形状为STL
                shapes = []
                for obj in document.Objects:
                    if hasattr(obj, 'Shape'):
                        shapes.append(obj.Shape)
                
                if shapes:
                    # 将形状转换为网格并导出
                    for i, shape in enumerate(shapes):
                        mesh = shape.tessellate(0.1)
                        # 创建临时网格对象
                        temp_mesh = self.Mesh.Mesh(mesh[0], mesh[1])
                        temp_mesh.write(str(output_path))
                        logger.info(f"导出STL (从形状): {output_path}")
                        break  # 只导出第一个形状
        else:
            logger.warning("FreeCAD环境未初始化，跳过STL导出")
    
    def batch_export(self, document: Any, output_dir: str, 
                     formats: List[str], base_name: str) -> Dict[str, Any]:
        """
        批量导出多种格式
        
        Args:
            document: FreeCAD文档对象
            output_dir: 输出目录
            formats: 导出格式列表
            base_name: 基础文件名
            
        Returns:
            批量导出结果
        """
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        results = {}
        
        for format_type in formats:
            if format_type not in self.SUPPORTED_FORMATS:
                results[format_type] = {
                    "status": "error",
                    "error": f"不支持的格式: {format_type}"
                }
                continue
            
            ext = self._get_extension(format_type)
            output_path = output_dir / f"{base_name}.{ext}"
            
            result = self.export(document, str(output_path), format_type)
            results[format_type] = result
        
        return {
            "status": "success",
            "formats_exported": len([r for r in results.values() if r["status"] == "success"]),
            "results": results
        }
    
    def _export_csv(self, document: Any, output_path: Path, options: Optional[Dict] = None):
        """导出 CSV（从 FreeCAD Spreadsheet 导出管道表/设备表）"""
        import csv
        sheets = [obj for obj in (document.Objects or []) if obj.TypeId == "Spreadsheet::Sheet"]
        if not sheets:
            raise ValueError("文档中没有 Spreadsheet 表格")
        # 导出第一个表（通常为管道表）
        sheet = sheets[0]
        rows = []
        for r in range(1, 50):
            row_data = []
            has_data = False
            for c in range(0, 26):
                try:
                    cell = sheet.get(chr(65 + c) + str(r))
                except Exception:
                    cell = ""
                row_data.append(cell)
                if cell:
                    has_data = True
            if not has_data:
                break
            rows.append(row_data)
        with open(str(output_path), "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            for row in rows:
                writer.writerow(row)
        logger.info(f"导出CSV: {output_path} ({len(rows)} 行)")

    def _get_extension(self, format_type: str) -> str:
        """获取格式对应的文件扩展名"""
        extensions = {
            "FCStd": "FCStd",
            "STEP": "stp",
            "IGES": "igs",
            "PDF": "pdf",
            "DXF": "dxf",
            "STL": "stl",
            "CSV": "csv"
        }
        return extensions.get(format_type, format_type.lower())
    
    def get_supported_formats(self) -> List[str]:
        """获取支持的导出格式"""
        return self.SUPPORTED_FORMATS.copy()