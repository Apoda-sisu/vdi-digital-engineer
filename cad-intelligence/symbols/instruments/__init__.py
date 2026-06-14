"""
仪表符号模块
包含各类仪表的国家标准符号
"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)


class InstrumentSymbols:
    """仪表符号管理器"""
    
    def __init__(self, symbols_path: Optional[str] = None):
        """
        初始化仪表符号管理器
        
        Args:
            symbols_path: 符号库路径
        """
        if symbols_path is None:
            symbols_path = Path(__file__).parent
        
        self.symbols_path = Path(symbols_path)
        self.symbols = {}
        
        self._load_symbols()
        
        logger.info(f"仪表符号管理器初始化完成: {len(self.symbols)} 个符号")
    
    def _load_symbols(self):
        """加载所有仪表符号"""
        for symbol_file in self.symbols_path.glob("*.json"):
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
    
    def list_symbols(self) -> List[Dict[str, Any]]:
        """
        列出所有仪表符号
        
        Returns:
            符号列表
        """
        return list(self.symbols.values())
    
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
            if query_lower in symbol.get("name", "").lower():
                results.append(symbol)
                continue
            
            tags = symbol.get("tags", [])
            if any(query_lower in tag.lower() for tag in tags):
                results.append(symbol)
        
        return results