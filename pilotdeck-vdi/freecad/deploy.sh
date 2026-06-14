#!/usr/bin/env bash
# Deploy vdi_cad_addon to FreeCAD Mod directory (macOS / Linux)
#
# Usage:
#   ./deploy.sh          # copy（推荐）
#   ./deploy.sh --link   # symlink（开发热更新）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADDON_SRC="${SCRIPT_DIR}/vdi_cad_addon"
MODE="copy"

if [[ "${1:-}" == "--link" ]]; then
  MODE="link"
fi

# FreeCAD 1.x 使用版本化用户目录（如 v1-1/Mod），与 cad-intelligence 部署逻辑一致
if [[ -n "${FREECAD_USER_MOD:-}" ]]; then
  FC_MOD="$(dirname "${FREECAD_USER_MOD}")"
elif [[ "$(uname)" == "Darwin" ]] && [[ -d "${HOME}/Library/Application Support/FreeCAD/v1-1/Mod" ]]; then
  FC_MOD="${HOME}/Library/Application Support/FreeCAD/v1-1/Mod"
elif [[ "$(uname)" == "Darwin" ]] && [[ -d "${HOME}/Library/Application Support/FreeCAD/Mod" ]]; then
  FC_MOD="${HOME}/Library/Application Support/FreeCAD/Mod"
elif [[ -n "${FREECAD_USER_HOME:-}" ]]; then
  FC_MOD="${FREECAD_USER_HOME}/Mod"
else
  FC_MOD="${HOME}/.FreeCAD/Mod"
fi

TARGET="${FC_MOD}/VDI_CAD"

echo "Deploying VDI CAD addon (${MODE})..."
echo "  Source: ${ADDON_SRC}"
echo "  Target: ${TARGET}"
echo "  (FreeCAD Mod root: ${FC_MOD})"

mkdir -p "${FC_MOD}"

if [[ -L "${TARGET}" ]]; then
  rm "${TARGET}"
elif [[ -d "${TARGET}" ]]; then
  rm -rf "${TARGET}"
fi

if [[ "${MODE}" == "link" ]]; then
  ln -sf "${ADDON_SRC}" "${TARGET}"
  if [[ -d "${SCRIPT_DIR}/vdi_cad_core" ]]; then
    ln -sf "${SCRIPT_DIR}/vdi_cad_core" "${TARGET}/vdi_cad_core"
  fi
  echo "✓ Symlink created"
else
  cp -R "${ADDON_SRC}" "${TARGET}"
  if [[ -d "${SCRIPT_DIR}/vdi_cad_core" ]]; then
    cp -R "${SCRIPT_DIR}/vdi_cad_core" "${TARGET}/vdi_cad_core"
  fi
  echo "✓ Copied to Mod directory"
fi

# 清理误部署到旧路径的副本（FreeCAD 1.x 不会读取）
# 清理旧目录名（vdi_cad_addon / 非版本化 Mod）
for LEGACY in \
  "${HOME}/Library/Application Support/FreeCAD/Mod/vdi_cad_addon" \
  "${HOME}/Library/Application Support/FreeCAD/Mod/VDI_CAD" \
  "${FC_MOD}/vdi_cad_addon"; do
  if [[ "${TARGET}" != "${LEGACY}" ]] && [[ -e "${LEGACY}" ]]; then
    rm -rf "${LEGACY}"
    echo "✓ Removed old path: ${LEGACY}"
  fi
done

echo ""
echo "Next steps:"
echo "  1. 完全退出 FreeCAD (Cmd+Q) 后重新打开"
echo "  2. View → Panels → Report view，应看到 [VDI-CAD] RPC server started"
echo "  3. 日志: ${TARGET}/initgui_log.txt"
echo "  4. 验证: bash pilotdeck-vdi/freecad/verify-rpc.sh"
