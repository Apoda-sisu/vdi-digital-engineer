"""
符号管理器 - 负责加载、缓存和查询符号库

支持的功能：
- 递归加载符号库
- 符号缓存
- 按类别/ID查询符号
- 符号验证
"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)


class SymbolManager:
    """符号管理器"""
    
    def __init__(self, symbols_dir: Optional[str] = None):
        """
        初始化符号管理器
        
        Args:
            symbols_dir: 符号库目录路径，默认为 ./symbols
        """
        if symbols_dir is None:
            symbols_dir = str(Path(__file__).parent.parent / "symbols")
        
        self.symbols_dir = Path(symbols_dir)
        self._symbols: Dict[str, Dict] = {}
        self._categories: Dict[str, List[str]] = {}
        self._loaded = False
        
        # 自动加载
        self._load_symbols()
    
    def _load_symbols(self):
        """递归加载所有符号文件"""
        if not self.symbols_dir.exists():
            logger.warning(f"符号库目录不存在: {self.symbols_dir}")
            return
        
        count = 0
        for json_file in self.symbols_dir.rglob("*.json"):
            # 跳过 index.json 和 __init__.py
            if json_file.name in ("index.json", "__init__.py"):
                continue
            
            try:
                with open(json_file, 'r', encoding='utf-8') as f:
                    symbol = json.load(f)
                
                # 验证符号格式
                if self._validate_symbol(symbol):
                    symbol_id = symbol["symbol_id"]
                    category = symbol.get("category", "unknown")
                    
                    # 存储符号
                    self._symbols[symbol_id] = symbol
                    
                    # 更新类别索引
                    if category not in self._categories:
                        self._categories[category] = []
                    self._categories[category].append(symbol_id)
                    
                    count += 1
                else:
                    logger.warning(f"符号格式无效: {json_file}")
                    
            except Exception as e:
                logger.error(f"加载符号文件失败 {json_file}: {e}")
        
        self._loaded = True
        logger.info(f"已加载 {count} 个符号")
    
    def _validate_symbol(self, symbol: Dict) -> bool:
        """验证符号格式"""
        required_fields = ["symbol_id", "name", "category", "geometry"]
        return all(field in symbol for field in required_fields)
    
    def get_symbol(self, symbol_id: str) -> Optional[Dict]:
        """
        根据ID获取符号
        
        Args:
            symbol_id: 符号ID
            
        Returns:
            符号字典或None
        """
        return self._symbols.get(symbol_id)
    
    def get_symbols_by_category(self, category: str) -> List[Dict]:
        """
        获取指定类别的所有符号
        
        Args:
            category: 类别名称
            
        Returns:
            符号列表
        """
        symbol_ids = self._categories.get(category, [])
        return [self._symbols[sid] for sid in symbol_ids if sid in self._symbols]
    
    def get_all_symbols(self) -> Dict[str, Dict]:
        """获取所有符号"""
        return self._symbols.copy()
    
    def get_categories(self) -> List[str]:
        """获取所有类别"""
        return list(self._categories.keys())
    
    def search_symbols(self, keyword: str) -> List[Dict]:
        """
        搜索符号
        
        Args:
            keyword: 搜索关键词
            
        Returns:
            匹配的符号列表
        """
        results = []
        keyword_lower = keyword.lower()
        
        for symbol in self._symbols.values():
            # 搜索名称
            if keyword_lower in symbol.get("name", "").lower():
                results.append(symbol)
                continue
            
            # 搜索英文名称
            if keyword_lower in symbol.get("name_en", "").lower():
                results.append(symbol)
                continue
            
            # 搜索描述
            if keyword_lower in symbol.get("description", "").lower():
                results.append(symbol)
                continue
            
            # 搜索标准
            if keyword_lower in symbol.get("standard", "").lower():
                results.append(symbol)
                continue
        
        return results
    
    def get_equipment_types(self) -> List[str]:
        """获取所有设备类型"""
        return self.get_categories()
    
    def get_symbol_count(self) -> int:
        """获取符号总数"""
        return len(self._symbols)
    
    def get_category_count(self) -> Dict[str, int]:
        """获取各类别符号数量"""
        return {cat: len(ids) for cat, ids in self._categories.items()}
    
    def reload(self):
        """重新加载符号库"""
        self._symbols.clear()
        self._categories.clear()
        self._loaded = False
        self._load_symbols()
    
    def __repr__(self) -> str:
        return f"SymbolManager(symbols={len(self._symbols)}, categories={len(self._categories)})"


# 全局符号管理器实例
_symbol_manager: Optional[SymbolManager] = None


def get_symbol_manager() -> SymbolManager:
    """获取全局符号管理器实例"""
    global _symbol_manager
    if _symbol_manager is None:
        _symbol_manager = SymbolManager()
    return _symbol_manager


def get_symbol(symbol_id: str) -> Optional[Dict]:
    """获取符号的便捷函数"""
    return get_symbol_manager().get_symbol(symbol_id)


def search_symbols(keyword: str) -> List[Dict]:
    """搜索符号的便捷函数"""
    return get_symbol_manager().search_symbols(keyword)
