"""
设备符号模块
包含各类设备的国家标准符号
"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)


class EquipmentSymbols:
    """设备符号管理器"""
    
    def __init__(self, symbols_path: Optional[str] = None):
        """
        初始化设备符号管理器
        
        Args:
            symbols_path: 符号库路径
        """
        if symbols_path is None:
            symbols_path = Path(__file__).parent
        
        self.symbols_path = Path(symbols_path)
        self.symbols = {}
        
        self._load_symbols()
        
        logger.info(f"设备符号管理器初始化完成: {len(self.symbols)} 个符号")
    
    def _load_symbols(self):
        """加载所有设备符号"""
        # 加载泵类符号
        self._load_category("pumps")
        
        # 加载阀门符号
        self._load_category("valves")
        
        # 加载换热器符号
        self._load_category("heat_exchangers")
        
        # 加载容器符号
        self._load_category("vessels")
        
        # 加载压缩机符号
        self._load_category("compressors")
    
    def _load_category(self, category: str):
        """加载指定类别的符号"""
        category_path = self.symbols_path / category
        
        if not category_path.exists():
            logger.warning(f"符号类别目录不存在: {category_path}")
            return
        
        for symbol_file in category_path.glob("*.json"):
            try:
                with open(symbol_file, 'r', encoding='utf-8') as f:
                    symbol_data = json.load(f)
                    symbol_id = symbol_data.get("symbol_id")
                    if symbol_id:
                        self.symbols[symbol_id] = symbol_data
                        logger.debug(f"加载符号: {symbol_id}")
            except Exception as e:
                logger.error(f"加载符号文件失败: {symbol_file}, 错误: {e}")
    
    def get_symbol(self, symbol_id: str) -> Optional[Dict[str, Any]]:
        """
        获取符号
        
        Args:
            symbol_id: 符号ID
            
        Returns:
            符号数据，如果不存在则返回None
        """
        return self.symbols.get(symbol_id)
    
    def list_symbols(self, category: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        列出符号
        
        Args:
            category: 类别筛选
            
        Returns:
            符号列表
        """
        symbols_list = list(self.symbols.values())
        
        if category:
            symbols_list = [s for s in symbols_list if s.get("category") == category]
        
        return symbols_list
    
    def search_symbols(self, query: str) -> List[Dict[str, Any]]:
        """
        搜索符号
        
        Args:
            query: 搜索关键词
            
        Returns:
            匹配的符号列表
        """
        query_lower = query.lower()
        results = []
        
        for symbol in self.symbols.values():
            # 搜索名称
            if query_lower in symbol.get("name", "").lower():
                results.append(symbol)
                continue
            
            # 搜索标签
            tags = symbol.get("tags", [])
            if any(query_lower in tag.lower() for tag in tags):
                results.append(symbol)
        
        return results
    
    def create_symbol(self, symbol_data: Dict[str, Any]) -> str:
        """
        创建新符号
        
        Args:
            symbol_data: 符号数据
            
        Returns:
            符号ID
        """
        symbol_id = symbol_data.get("symbol_id")
        if not symbol_id:
            raise ValueError("符号数据缺少symbol_id")
        
        # 验证符号ID唯一性
        if symbol_id in self.symbols:
            raise ValueError(f"符号ID已存在: {symbol_id}")
        
        # 保存符号
        self.symbols[symbol_id] = symbol_data
        
        # 保存到文件
        category = symbol_data.get("category", "other")
        category_path = self.symbols_path / category
        category_path.mkdir(exist_ok=True)
        
        symbol_file = category_path / f"{symbol_id}.json"
        with open(symbol_file, 'w', encoding='utf-8') as f:
            json.dump(symbol_data, f, ensure_ascii=False, indent=2)
        
        logger.info(f"创建符号: {symbol_id}")
        
        return symbol_id
    
    def update_symbol(self, symbol_id: str, updates: Dict[str, Any]) -> bool:
        """
        更新符号
        
        Args:
            symbol_id: 符号ID
            updates: 更新内容
            
        Returns:
            是否更新成功
        """
        if symbol_id not in self.symbols:
            logger.warning(f"符号不存在: {symbol_id}")
            return False
        
        # 更新符号
        self.symbols[symbol_id].update(updates)
        
        # 保存到文件
        category = self.symbols[symbol_id].get("category", "other")
        category_path = self.symbols_path / category
        symbol_file = category_path / f"{symbol_id}.json"
        
        with open(symbol_file, 'w', encoding='utf-8') as f:
            json.dump(self.symbols[symbol_id], f, ensure_ascii=False, indent=2)
        
        logger.info(f"更新符号: {symbol_id}")
        
        return True
    
    def delete_symbol(self, symbol_id: str) -> bool:
        """
        删除符号
        
        Args:
            symbol_id: 符号ID
            
        Returns:
            是否删除成功
        """
        if symbol_id not in self.symbols:
            logger.warning(f"符号不存在: {symbol_id}")
            return False
        
        # 获取符号信息
        symbol = self.symbols[symbol_id]
        category = symbol.get("category", "other")
        
        # 删除符号
        del self.symbols[symbol_id]
        
        # 删除文件
        category_path = self.symbols_path / category
        symbol_file = category_path / f"{symbol_id}.json"
        
        if symbol_file.exists():
            symbol_file.unlink()
        
        logger.info(f"删除符号: {symbol_id}")
        
        return True