#!/usr/bin/env bash
# 阶段 0 一键准备：知识索引 + MCP 依赖 + PilotDeck 重启提示
set -euo pipefail

VDI_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PILOT_REPO="${PILOT_REPO:-/Users/apoda/GitHub/PilotDeck}"

echo "==> VDI 根目录: $VDI_ROOT"

echo "==> 构建知识索引"
python3 "$VDI_ROOT/pilotdeck-vdi/scripts/build_knowledge_index.py"

echo "==> 安装 vdi-knowledge MCP 依赖"
cd "$VDI_ROOT/pilotdeck-vdi/mcp/vdi-knowledge"
npm install --omit=dev

echo "==> 重启 PilotDeck Docker"
cd "$PILOT_REPO"
docker compose up -d

echo "==> 迁移 Skills 到容器内 ~/.pilotdeck/skills"
docker compose exec -T pilotdeck sh -c '
  cd /app && npm run skills:migrate -- --source /workspace/skills --rename --execute 2>&1 | tail -20
' || echo "（若 migrate 失败，请在 UI 中手动确认 skills 目录）"

echo ""
echo "完成。访问 http://localhost:3001"
echo "WorkSpace: /workspace/workspaces/VDI-给水排水-试点A"
