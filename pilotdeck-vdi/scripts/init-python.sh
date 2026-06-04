#!/usr/bin/env bash
# VDI Python 环境初始化脚本
# 用途：在容器内安装 Python 依赖（pymilvus, milvus_lite 等）
# 运行：bash /workspace/pilotdeck-vdi/scripts/init-python.sh

set -euo pipefail

VENV_DIR="/root/venv"
REQUIREMENTS_FILE="/workspace/pilotdeck-vdi/scripts/requirements.txt"

echo "========================================="
echo "VDI Python 环境初始化"
echo "========================================="

# 检查是否已安装
if [ -f "$VENV_DIR/bin/python3" ] && [ -f "$VENV_DIR/bin/pip" ]; then
    echo "[INFO] Python 虚拟环境已存在: $VENV_DIR"
    echo "[INFO] 跳过安装，如需重新安装请删除 $VENV_DIR"
    exit 0
fi

# 安装系统依赖
echo "[1/4] 安装系统依赖..."
apt-get update -qq
apt-get install -y -qq python3 python3-pip python3.11-venv > /dev/null 2>&1

# 创建虚拟环境
echo "[2/4] 创建 Python 虚拟环境..."
python3 -m venv "$VENV_DIR"

# 安装 Python 依赖
echo "[3/4] 安装 Python 依赖..."
if [ -f "$REQUIREMENTS_FILE" ]; then
    "$VENV_DIR/bin/pip" install --quiet -r "$REQUIREMENTS_FILE"
else
    "$VENV_DIR/bin/pip" install --quiet "pymilvus>=2.4.0" milvus_lite pyyaml
fi

# 验证安装
echo "[4/4] 验证安装..."
"$VENV_DIR/bin/python3" -c "
import pymilvus
import yaml
print(f'pymilvus: {pymilvus.__version__}')
print(f'PyYAML: {yaml.__version__}')
try:
    import milvus_lite
    print(f'milvus_lite: installed')
except ImportError:
    print('milvus_lite: not available (optional)')
"

echo ""
echo "========================================="
echo "✅ Python 环境初始化完成"
echo "   虚拟环境: $VENV_DIR"
echo "   Python: $($VENV_DIR/bin/python3 --version)"
echo "========================================="
