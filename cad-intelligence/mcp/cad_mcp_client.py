#!/usr/bin/env python3
"""
CadIntelligence MCP 客户端桩 — 与 FreeCAD-MCP 互补

在 FreeCAD GUI 已运行时，通过 TCP/stdio 转发 scheme JSON 到 DrawingPipeline。
完整 MCP server 可后续对接 mcp-server 包；当前提供 CLI 子命令供 Cursor 配置。

用法:
  python cad_mcp_client.py --apply-scheme /path/to/scheme.json
  python cad_mcp_client.py --get-report
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def cmd_apply_scheme(path: str) -> dict:
    from core.drawing_pipeline import DrawingPipeline

    pipeline = DrawingPipeline(use_active_document=True)
    return pipeline.apply_json_file(path)


def cmd_get_report() -> dict:
    log = Path(__file__).parent / "cad_mcp_log.txt"
    if log.is_file():
        return {"status": "success", "log": log.read_text(encoding="utf-8")[-4000:]}
    return {"status": "success", "log": "CadIntelligence MCP: 无日志"}


def main():
    parser = argparse.ArgumentParser(description="CadIntelligence MCP Client")
    parser.add_argument("--apply-scheme", dest="scheme", help="应用 scheme JSON 文件")
    parser.add_argument("--get-report", action="store_true", help="获取日志")
    args = parser.parse_args()

    try:
        if args.scheme:
            result = cmd_apply_scheme(args.scheme)
        elif args.get_report:
            result = cmd_get_report()
        else:
            result = {"status": "error", "message": "请指定 --apply-scheme 或 --get-report"}
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
