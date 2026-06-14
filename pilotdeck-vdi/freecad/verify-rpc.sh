#!/usr/bin/env bash
# 检查 VDI CAD RPC 是否在线 + 读取 FreeCAD 插件日志

set -euo pipefail

PORT="${VDI_CAD_RPC_PORT:-9876}"

# FreeCAD 1.x 优先 v1-1/Mod
LOG_CANDIDATES=(
  "${HOME}/Library/Application Support/FreeCAD/v1-1/Mod/VDI_CAD/initgui_log.txt"
  "${HOME}/Library/Application Support/FreeCAD/v1-1/Mod/vdi_cad_addon/initgui_log.txt"
  "${HOME}/Library/Application Support/FreeCAD/Mod/VDI_CAD/initgui_log.txt"
  "${HOME}/.FreeCAD/Mod/VDI_CAD/initgui_log.txt"
)

echo "=== VDI CAD RPC 诊断 ==="
echo ""

LOG=""
for f in "${LOG_CANDIDATES[@]}"; do
  if [[ -f "${f}" ]]; then
    LOG="${f}"
    break
  fi
done

if [[ -n "${LOG}" ]]; then
  echo "📄 ${LOG}:"
  cat "${LOG}"
  echo ""
else
  echo "⚠  未找到 initgui_log.txt"
  echo "   已检查:"
  for f in "${LOG_CANDIDATES[@]}"; do echo "     - ${f}"; done
  echo ""
  echo "   → 插件未加载。请运行:"
  echo "     bash pilotdeck-vdi/freecad/deploy.sh"
  echo "   FreeCAD 1.x 插件目录应为:"
  echo "     ~/Library/Application Support/FreeCAD/v1-1/Mod/VDI_CAD"
  echo ""
fi

echo "🔌 检测 localhost:${PORT} ..."
BODY='<?xml version="1.0"?><methodCall><methodName>ping</methodName><params></params></methodCall>'
RESP=$(curl -s --max-time 3 -X POST "http://127.0.0.1:${PORT}/RPC2" \
  -H "Content-Type: text/xml" -d "${BODY}" 2>&1) || true

if echo "${RESP}" | grep -q "pong"; then
  echo "✓ RPC 在线 (ping → pong)"
  exit 0
fi

echo "✗ RPC 未响应"
echo "  curl 返回: ${RESP:-（空/连接拒绝）}"
exit 1
