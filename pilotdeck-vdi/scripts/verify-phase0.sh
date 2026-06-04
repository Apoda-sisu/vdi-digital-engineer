#!/usr/bin/env bash
# 阶段 0 验收：索引、容器、Skills、MCP 脚本
set -euo pipefail

VDI_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
INDEX="$VDI_ROOT/pilotdeck-vdi/data/knowledge-clauses.json"
PILOT_REPO="${PILOT_REPO:-/Users/apoda/GitHub/PilotDeck}"

fail() { echo "FAIL: $1"; exit 1; }
ok() { echo "OK: $1"; }

test -f "$INDEX" || fail "知识索引不存在，请先运行 build_knowledge_index.py"
python3 -c "
import json,sys
d=json.load(open('$INDEX'))
assert d['stats']['total_clauses']>100, d['stats']
assert d['stats']['water_clauses']>50, d['stats']
print('clauses', d['stats'])
" || fail "索引内容异常"
ok "知识索引 $(basename "$INDEX")"

curl -sf -o /dev/null http://localhost:3001/ || fail "PilotDeck UI 未响应"
ok "PilotDeck UI http://localhost:3001"

cd "$PILOT_REPO"
docker compose exec -T pilotdeck test -f /root/.pilotdeck/vdi/knowledge-clauses.json \
  || fail "容器内知识索引未挂载"
ok "容器内知识索引"

docker compose exec -T pilotdeck test -f /root/.pilotdeck/skills/给排水专业负责人/SKILL.md \
  || fail "给排水专业负责人 未迁移"
ok "给排水专业负责人 Skill"

docker compose exec -T pilotdeck test -f /root/.pilotdeck/plugins/vdi-knowledge/plugin.json \
  || fail "vdi-knowledge 插件未挂载"
ok "vdi-knowledge 插件"

docker compose exec -T pilotdeck test -f /workspace/pilotdeck-vdi/mcp/vdi-knowledge/server.mjs \
  || fail "MCP server.mjs 不可达"
ok "MCP server 脚本"

echo ""
echo "阶段 0 基础设施验收通过。请在 UI 创建 WorkSpace 并测试 vdi_search_knowledge。"
