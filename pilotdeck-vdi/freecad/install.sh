#!/usr/bin/env bash
# 安装 VDI CAD 并卸载已弃用的 CadIntelligence

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== VDI CAD 安装 ==="
echo ""

bash "${SCRIPT_DIR}/deploy.sh"
echo ""
bash "${SCRIPT_DIR}/uninstall-cadintelligence.sh"

echo ""
echo "下一步:"
echo "  1. Cmd+Q 完全退出 FreeCAD"
echo "  2. 重新打开 — 仅应看到「VDI CAD」工作台，不再有「AI 智能绘图」"
echo "  3. Report view: [VDI-CAD] RPC server started on localhost:9876"
echo "  4. bash pilotdeck-vdi/freecad/verify-rpc.sh"
