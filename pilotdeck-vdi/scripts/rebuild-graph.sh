#!/bin/bash
# ============================================================
# PilotDeck 模块更新后自动重建关联关系图
# ============================================================
# 用法：
#   ./rebuild-graph.sh          # 完整重建
#   ./rebuild-graph.sh --check  # 仅检查是否需要更新
#
# 集成方式：
#   1. 手动运行：在任意模块更新后执行此脚本
#   2. Git hook：可添加为 post-commit hook
#   3. 定时任务：可添加为 cron job
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GRAPH_JSON="$PROJECT_ROOT/pilotdeck-vdi/data/module-graph.json"

if [ "$1" = "--check" ]; then
  if [ ! -f "$GRAPH_JSON" ]; then
    echo "关联关系图不存在，需要重建"
    exit 1
  fi
  # Check if any source file is newer than the graph
  GRAPH_TIME=$(stat -f %m "$GRAPH_JSON" 2>/dev/null || echo 0)
  
  NEED_UPDATE=false
  for dir in \
    "$PROJECT_ROOT/skills" \
    "$PROJECT_ROOT/pilotdeck-vdi/data/formulas" \
    "$PROJECT_ROOT/pilotdeck-vdi/data/formulas-indices" \
    "$PROJECT_ROOT/pilotdeck-vdi/mcp"; do
    if [ -d "$dir" ]; then
      NEWEST=$(find "$dir" -name "*.json" -o -name "*.mjs" -o -name "*.md" 2>/dev/null | xargs stat -f %m 2>/dev/null | sort -rn | head -1)
      if [ "${NEWEST:-0}" -gt "$GRAPH_TIME" ]; then
        NEED_UPDATE=true
        break
      fi
    fi
  done
  
  if [ "$NEED_UPDATE" = true ]; then
    echo "检测到模块更新，需要重建关联关系图"
    exit 1
  else
    echo "关联关系图是最新的"
    exit 0
  fi
fi

echo "正在重建 PilotDeck 模块关联关系图..."
node "$SCRIPT_DIR/build-module-graph.mjs"

# 将 JSON 内嵌到 HTML 中（解决 file:// 协议的 CORS 限制）
echo ""
echo "正在更新可视化页面..."
node -e "
const fs = require('fs');
const json = fs.readFileSync('$PROJECT_ROOT/pilotdeck-vdi/data/module-graph.json', 'utf8');
const html = fs.readFileSync('$PROJECT_ROOT/pilotdeck-vdi/data/module-graph-viewer.html', 'utf8');
const newHtml = html.replace('GRAPH_DATA_PLACEHOLDER', json);
fs.writeFileSync('$PROJECT_ROOT/pilotdeck-vdi/data/module-graph-viewer.html', newHtml, 'utf8');
console.log('可视化页面已更新（' + Math.round(json.length/1024) + 'KB 数据已内嵌）');
"
echo ""
echo "重建完成。查看方式："
echo "  报告: $PROJECT_ROOT/pilotdeck-vdi/data/module-graph-report.md"
echo "  图表: $PROJECT_ROOT/pilotdeck-vdi/data/module-graph.mmd"
echo "  可视化: 在浏览器中打开 module-graph-viewer.html"

# 可选：同步到 ArchGuard（如果已部署）
if command -v java &>/dev/null && [ -f "$HOME/.archguard/scanner_cli.jar" ]; then
  java -jar "$HOME/.archguard/scanner_cli.jar" \
    --path="$PROJECT_ROOT/pilotdeck-vdi" \
    --language=TypeScript \
    --output=http \
    --server-url=http://localhost:8080 \
    --system-id=pilotdeck-vdi
  echo "已同步到 ArchGuard"
fi
