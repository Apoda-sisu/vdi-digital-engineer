#!/bin/sh
# PilotDeck 系统门禁安装脚本
# ============================
# 配置 git 使用 .githooks 目录中的钩子。
#
# 用法: bash pilotdeck-vdi/scripts/setup-hooks.sh

echo "🔧 配置 PilotDeck pre-commit hook..."

# 设置 hooks 路径
git config core.hooksPath .githooks

echo "✅ 已配置 git hooks 路径: .githooks/"
echo "   现在每次 git commit 会自动运行系统门禁校验。"
echo ""
echo "   跳过校验: git commit --no-verify"
echo "   手动运行: node pilotdeck-vdi/scripts/validate-system.mjs"
