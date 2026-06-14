#!/usr/bin/env bash
# 从 FreeCAD 卸载已弃用的 CadIntelligence（AI 智能绘图）工作台

set -euo pipefail

REMOVED=0

remove_mod() {
  local path="$1"
  if [[ -d "${path}" ]] || [[ -L "${path}" ]]; then
    rm -rf "${path}"
    echo "✓ 已删除: ${path}"
    REMOVED=1
  fi
}

echo "=== 卸载 CadIntelligence（已弃用）==="

remove_mod "${HOME}/Library/Application Support/FreeCAD/v1-1/Mod/CadIntelligence"
remove_mod "${HOME}/Library/Application Support/FreeCAD/Mod/CadIntelligence"
remove_mod "${HOME}/.FreeCAD/Mod/CadIntelligence"

if [[ "${REMOVED}" -eq 0 ]]; then
  echo "（未发现已安装的 CadIntelligence 模块）"
else
  echo ""
  echo "请 Cmd+Q 完全退出 FreeCAD 后重新打开。"
  echo "工作台列表中「AI 智能绘图」应已消失，仅保留「VDI CAD」。"
fi
