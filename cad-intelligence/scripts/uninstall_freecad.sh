#!/bin/bash
# 从 FreeCAD 卸载 CadIntelligence（转发到 pilotdeck-vdi）

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TARGET="${REPO_ROOT}/pilotdeck-vdi/freecad/uninstall-cadintelligence.sh"

if [[ ! -f "${TARGET}" ]]; then
  echo "找不到 ${TARGET}"
  exit 1
fi

bash "${TARGET}"
