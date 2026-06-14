"""Mod 层路径 — 仅使用 __file__，禁止硬编码"""

import os
import sys

MOD_ROOT = os.path.dirname(os.path.abspath(__file__))
CAD_INTEL = os.path.join(MOD_ROOT, "cad_intelligence")
ICON_PATH = os.path.join(MOD_ROOT, "Resources", "icons", "CadIntelligence.svg")


def setup_sys_path():
    if MOD_ROOT not in sys.path:
        sys.path.insert(0, MOD_ROOT)
    if os.path.isdir(CAD_INTEL) and CAD_INTEL not in sys.path:
        sys.path.insert(0, CAD_INTEL)


def get_symbols_path():
    sym = os.path.join(CAD_INTEL, "symbols")
    if os.path.isdir(sym):
        return sym
    return os.path.join(MOD_ROOT, "symbols")
