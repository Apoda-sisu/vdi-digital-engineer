"""Load cad-intelligence JSON symbol library."""

import json
import os
from pathlib import Path
from typing import Dict, List, Optional


def _default_symbols_dir() -> Path:
    env = os.environ.get("VDI_SYMBOLS_DIR")
    if env and os.path.isdir(env):
        return Path(env)

    here = Path(__file__).resolve()
    candidates = [
        here.parent.parent / "symbols",
        here.parent.parent.parent / "vdi_cad_core" / "symbols",
        here.parent.parent.parent.parent.parent / "cad-intelligence" / "symbols",
    ]
    for path in candidates:
        if path.is_dir():
            return path
    return candidates[-1]


class SymbolManager:
    def __init__(self, symbols_dir: Optional[str] = None):
        self.symbols_dir = Path(symbols_dir) if symbols_dir else _default_symbols_dir()
        self._symbols: Dict[str, Dict] = {}
        self._load()

    def _load(self) -> None:
        if not self.symbols_dir.is_dir():
            return
        for json_file in self.symbols_dir.rglob("*.json"):
            if json_file.name == "index.json":
                continue
            try:
                with open(json_file, encoding="utf-8") as f:
                    symbol = json.load(f)
                sid = symbol.get("symbol_id")
                if sid:
                    self._symbols[sid] = symbol
            except (json.JSONDecodeError, OSError):
                continue

    def get(self, symbol_id: str) -> Optional[Dict]:
        return self._symbols.get(symbol_id)

    def count(self) -> int:
        return len(self._symbols)

    def list_ids(self) -> List[str]:
        return sorted(self._symbols.keys())


_manager: Optional[SymbolManager] = None


def get_symbol_manager() -> SymbolManager:
    global _manager
    if _manager is None:
        _manager = SymbolManager()
    return _manager
