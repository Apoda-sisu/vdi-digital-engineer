"""CadIntelligence 路径解析 — 禁止硬编码本机路径"""

import os
from pathlib import Path
from typing import Optional


def get_package_root() -> Path:
    """cad_intelligence / 开发目录 cad-intelligence 根路径"""
    return Path(__file__).resolve().parent.parent


def get_mod_root() -> Path:
    """FreeCAD Mod/CadIntelligence 根路径（部署时 package 的父目录）"""
    pkg = get_package_root()
    if pkg.name == "cad_intelligence":
        return pkg.parent
    return pkg


def get_symbols_dir() -> Path:
    return get_package_root() / "symbols"


def get_default_config_path() -> Path:
    return get_package_root() / "config.json"


def get_user_config_path() -> Path:
    """用户配置写在 Mod 根目录，部署 rsync 不覆盖"""
    return get_mod_root() / "user_config.json"


def ensure_package_on_syspath() -> Path:
    root = str(get_package_root())
    if root not in __import__("sys").path:
        __import__("sys").path.insert(0, root)
    return get_package_root()


def deep_merge(base: dict, override: dict) -> dict:
    out = dict(base)
    for k, v in override.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def load_merged_config() -> dict:
    import json

    config: dict = {}
    default_path = get_default_config_path()
    if default_path.is_file():
        with open(default_path, "r", encoding="utf-8") as f:
            config = json.load(f)

    user_path = get_user_config_path()
    if user_path.is_file():
        with open(user_path, "r", encoding="utf-8") as f:
            user_cfg = json.load(f)
        config = deep_merge(config, user_cfg)

    # 环境变量覆盖密钥
    ai = config.setdefault("ai", {})
    if os.getenv("OPENAI_API_KEY"):
        ai["api_key"] = os.getenv("OPENAI_API_KEY")
    if os.getenv("OPENAI_API_BASE"):
        ai["api_base"] = os.getenv("OPENAI_API_BASE")
    if os.getenv("AI_MODEL"):
        ai["model"] = os.getenv("AI_MODEL")
    if os.getenv("OLLAMA_BASE"):
        ai["ollama_base"] = os.getenv("OLLAMA_BASE")
    if os.getenv("OLLAMA_MODEL"):
        ai["ollama_model"] = os.getenv("OLLAMA_MODEL")

    return config


def save_user_config(patch: dict) -> str:
    import json

    current = {}
    user_path = get_user_config_path()
    if user_path.is_file():
        with open(user_path, "r", encoding="utf-8") as f:
            current = json.load(f)
    merged = deep_merge(current, patch)
    user_path.parent.mkdir(parents=True, exist_ok=True)
    with open(user_path, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)
    return str(user_path)
