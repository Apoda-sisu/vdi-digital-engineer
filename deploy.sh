#!/bin/bash

# VDI 数字工程师部署脚本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_message() {
    echo -e "${2}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

# 检查依赖
check_dependencies() {
    print_message "检查依赖..." "$BLUE"
    
    # 检查 Docker
    if ! command -v docker &> /dev/null; then
        print_message "错误: Docker 未安装" "$RED"
        exit 1
    fi
    
    # 检查 Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        print_message "错误: Docker Compose 未安装" "$RED"
        exit 1
    fi
    
    print_message "依赖检查完成" "$GREEN"
}

# 创建环境变量文件
create_env_file() {
    print_message "创建环境变量文件..." "$BLUE"
    
    if [ ! -f .env ]; then
        cp .env.example .env
        print_message "已创建 .env 文件，请根据需要修改配置" "$YELLOW"
    else
        print_message ".env 文件已存在" "$GREEN"
    fi
}

# 创建必要的目录
create_directories() {
    print_message "创建必要的目录..." "$BLUE"
    
    mkdir -p logs
    mkdir -p uploads
    mkdir -p nginx/ssl
    mkdir -p monitoring
    
    print_message "目录创建完成" "$GREEN"
}

# 构建 Docker 镜像
build_images() {
    print_message "构建 Docker 镜像..." "$BLUE"
    
    docker-compose build --no-cache
    
    print_message "镜像构建完成" "$GREEN"
}

# 启动服务
start_services() {
    print_message "启动服务..." "$BLUE"
    
    docker-compose up -d
    
    print_message "服务启动完成" "$GREEN"
}

# 停止服务
stop_services() {
    print_message "停止服务..." "$BLUE"
    
    docker-compose down
    
    print_message "服务停止完成" "$GREEN"
}

# 重启服务
restart_services() {
    print_message "重启服务..." "$BLUE"
    
    docker-compose restart
    
    print_message "服务重启完成" "$GREEN"
}

# 查看日志
view_logs() {
    print_message "查看日志..." "$BLUE"
    
    docker-compose logs -f
}

# 查看服务状态
view_status() {
    print_message "查看服务状态..." "$BLUE"
    
    docker-compose ps
}

# 健康检查
health_check() {
    print_message "执行健康检查..." "$BLUE"
    
    # 检查知识库服务
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        print_message "✓ 知识库服务运行正常" "$GREEN"
    else
        print_message "✗ 知识库服务异常" "$RED"
    fi
    
    # 检查事件总线服务
    if curl -f http://localhost:3001/health > /dev/null 2>&1; then
        print_message "✓ 事件总线服务运行正常" "$GREEN"
    else
        print_message "✗ 事件总线服务异常" "$RED"
    fi
    
    # 检查规则引擎服务
    if curl -f http://localhost:3002/health > /dev/null 2>&1; then
        print_message "✓ 规则引擎服务运行正常" "$GREEN"
    else
        print_message "✗ 规则引擎服务异常" "$RED"
    fi
    
    # 检查文档服务
    if curl -f http://localhost:3003/health > /dev/null 2>&1; then
        print_message "✓ 文档服务运行正常" "$GREEN"
    else
        print_message "✗ 文档服务异常" "$RED"
    fi
    
    # 检查图片解读服务
    if curl -f http://localhost:3004/health > /dev/null 2>&1; then
        print_message "✓ 图片解读服务运行正常" "$GREEN"
    else
        print_message "✗ 图片解读服务异常" "$RED"
    fi
    
    # 检查 Nginx
    if curl -f http://localhost:80 > /dev/null 2>&1; then
        print_message "✓ Nginx 服务运行正常" "$GREEN"
    else
        print_message "✗ Nginx 服务异常" "$RED"
    fi
    
    # 检查 Redis
    if docker-compose exec redis redis-cli ping > /dev/null 2>&1; then
        print_message "✓ Redis 服务运行正常" "$GREEN"
    else
        print_message "✗ Redis 服务异常" "$RED"
    fi
    
    # 检查 PostgreSQL
    if docker-compose exec postgres pg_isready > /dev/null 2>&1; then
        print_message "✓ PostgreSQL 服务运行正常" "$GREEN"
    else
        print_message "✗ PostgreSQL 服务异常" "$RED"
    fi
}

# 备份数据
backup_data() {
    print_message "备份数据..." "$BLUE"
    
    BACKUP_DIR="backup/$(date +'%Y%m%d_%H%M%S')"
    mkdir -p "$BACKUP_DIR"
    
    # 备份数据库
    docker-compose exec postgres pg_dump -U vdi_user vdi_db > "$BACKUP_DIR/database.sql"
    
    # 备份数据文件
    cp -r pilotdeck-vdi/data "$BACKUP_DIR/data"
    
    # 备份配置文件
    cp .env "$BACKUP_DIR/env"
    cp docker-compose.yml "$BACKUP_DIR/docker-compose.yml"
    
    print_message "数据备份完成: $BACKUP_DIR" "$GREEN"
}

# 恢复数据
restore_data() {
    if [ -z "$1" ]; then
        print_message "请指定备份目录" "$RED"
        exit 1
    fi
    
    print_message "恢复数据: $1" "$BLUE"
    
    # 恢复数据库
    docker-compose exec -T postgres psql -U vdi_user vdi_db < "$1/database.sql"
    
    # 恢复数据文件
    cp -r "$1/data" pilotdeck-vdi/
    
    print_message "数据恢复完成" "$GREEN"
}

# 更新服务
update_services() {
    print_message "更新服务..." "$BLUE"
    
    # 拉取最新代码
    git pull
    
    # 重新构建镜像
    build_images
    
    # 重启服务
    restart_services
    
    print_message "服务更新完成" "$GREEN"
}

# 清理资源
cleanup() {
    print_message "清理资源..." "$BLUE"
    
    # 停止并删除容器
    docker-compose down -v
    
    # 删除未使用的镜像
    docker image prune -f
    
    # 删除未使用的卷
    docker volume prune -f
    
    print_message "资源清理完成" "$GREEN"
}

# 显示帮助
show_help() {
    echo "VDI 数字工程师部署脚本"
    echo ""
    echo "用法: $0 [命令]"
    echo ""
    echo "命令:"
    echo "  build       构建 Docker 镜像"
    echo "  start       启动服务"
    echo "  stop        停止服务"
    echo "  restart     重启服务"
    echo "  status      查看服务状态"
    echo "  logs        查看日志"
    echo "  health      健康检查"
    echo "  backup      备份数据"
    echo "  restore     恢复数据（需要指定备份目录）"
    echo "  update      更新服务"
    echo "  cleanup     清理资源"
    echo "  help        显示帮助"
    echo ""
    echo "示例:"
    echo "  $0 build    # 构建镜像"
    echo "  $0 start    # 启动服务"
    echo "  $0 health   # 健康检查"
    echo "  $0 backup   # 备份数据"
    echo "  $0 restore /path/to/backup  # 恢复数据"
}

# 主函数
main() {
    # 检查依赖
    check_dependencies
    
    # 创建环境变量文件
    create_env_file
    
    # 创建必要的目录
    create_directories
    
    # 解析命令
    case "${1:-help}" in
        build)
            build_images
            ;;
        start)
            start_services
            ;;
        stop)
            stop_services
            ;;
        restart)
            restart_services
            ;;
        status)
            view_status
            ;;
        logs)
            view_logs
            ;;
        health)
            health_check
            ;;
        backup)
            backup_data
            ;;
        restore)
            restore_data "$2"
            ;;
        update)
            update_services
            ;;
        cleanup)
            cleanup
            ;;
        help|*)
            show_help
            ;;
    esac
}

# 执行主函数
main "$@"