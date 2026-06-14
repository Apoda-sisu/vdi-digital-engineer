# VDI 数字工程师部署指南

## 概述

本文档介绍如何部署 VDI 数字工程师系统到生产环境。

## 系统要求

### 硬件要求

- **CPU**: 4 核以上
- **内存**: 8GB 以上
- **存储**: 100GB 以上
- **网络**: 稳定的网络连接

### 软件要求

- **操作系统**: Linux (推荐 Ubuntu 20.04+ / CentOS 7+)
- **Docker**: 20.10+
- **Docker Compose**: 2.0+
- **Git**: 2.0+

## 快速部署

### 1. 克隆代码

```bash
git clone <repository-url>
cd vdi-digital-engineer
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，修改数据库密码、JWT 密钥等配置
vi .env
```

### 3. 构建并启动服务

```bash
# 构建 Docker 镜像
./deploy.sh build

# 启动所有服务
./deploy.sh start
```

### 4. 验证部署

```bash
# 执行健康检查
./deploy.sh health
```

访问 http://localhost 即可打开 VDI 数字工程师界面。

## 服务架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Nginx (反向代理)                         │
│                    端口: 80, 443                            │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  知识库服务    │   │  事件总线服务  │   │  规则引擎服务  │
│  端口: 3000   │   │  端口: 3001   │   │  端口: 3002   │
└───────────────┘   └───────────────┘   └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│    Redis      │   │  PostgreSQL   │   │  Prometheus   │
│  端口: 6379   │   │  端口: 5432   │   │  端口: 9090   │
└───────────────┘   └───────────────┘   └───────────────┘
```

## 服务说明

### 核心服务

| 服务 | 端口 | 说明 |
|------|------|------|
| vdi-knowledge | 3000 | 知识库服务，提供规范查询、公式计算等功能 |
| vdi-events | 3001 | 事件总线服务，处理跨专业协作事件 |
| vdi-rules | 3002 | 规则引擎服务，执行设计规则检查 |
| vdi-documents | 3003 | 文档服务，处理文档导入导出 |

### 基础服务

| 服务 | 端口 | 说明 |
|------|------|------|
| nginx | 80, 443 | 反向代理，负载均衡 |
| redis | 6379 | 缓存服务，提高查询性能 |
| postgres | 5432 | 数据库，存储结构化数据 |
| prometheus | 9090 | 监控服务，收集指标数据 |

## 常用命令

### 服务管理

```bash
# 启动服务
./deploy.sh start

# 停止服务
./deploy.sh stop

# 重启服务
./deploy.sh restart

# 查看服务状态
./deploy.sh status

# 查看日志
./deploy.sh logs
```

### 数据管理

```bash
# 备份数据
./deploy.sh backup

# 恢复数据
./deploy.sh restore /path/to/backup

# 更新服务
./deploy.sh update
```

### 健康检查

```bash
# 执行健康检查
./deploy.sh health
```

## 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| NODE_ENV | 运行环境 | production |
| PORT | 服务端口 | 3000 |
| LOG_LEVEL | 日志级别 | info |
| POSTGRES_DB | 数据库名 | vdi_db |
| POSTGRES_USER | 数据库用户 | vdi_user |
| POSTGRES_PASSWORD | 数据库密码 | vdi_postgres_2026 |
| REDIS_PASSWORD | Redis 密码 | vdi_redis_2026 |
| JWT_SECRET | JWT 密钥 | - |
| API_KEY | API 密钥 | - |

### 端口配置

默认端口分配：

- 3000: 知识库服务
- 3001: 事件总线服务
- 3002: 规则引擎服务
- 3003: 文档服务
- 80: HTTP
- 443: HTTPS
- 6379: Redis
- 5432: PostgreSQL
- 9090: Prometheus

如需修改端口，请编辑 `docker-compose.yml` 文件。

## 监控与告警

### Prometheus 监控

访问 http://localhost:9090 查看 Prometheus 监控界面。

默认监控指标：

- 服务请求量
- 响应时间
- 错误率
- 系统资源使用情况

### 日志管理

日志文件位于 `logs/` 目录：

- `app.log`: 应用日志
- `error.log`: 错误日志
- `access.log`: 访问日志

## 备份与恢复

### 自动备份

建议配置定时任务自动备份：

```bash
# 编辑 crontab
crontab -e

# 添加每日备份任务（凌晨 2 点）
0 2 * * * cd /path/to/vdi-digital-engineer && ./deploy.sh backup
```

### 手动备份

```bash
./deploy.sh backup
```

备份文件保存在 `backup/` 目录。

### 恢复数据

```bash
./deploy.sh restore /path/to/backup
```

## 故障排查

### 服务无法启动

1. 检查端口是否被占用
2. 检查 Docker 是否正常运行
3. 查看日志：`./deploy.sh logs`

### 数据库连接失败

1. 检查 PostgreSQL 服务是否启动
2. 检查数据库配置是否正确
3. 检查网络连接

### 性能问题

1. 检查系统资源使用情况
2. 查看监控指标
3. 优化数据库查询
4. 增加缓存

## 安全建议

1. **修改默认密码**: 修改所有默认密码
2. **启用 HTTPS**: 配置 SSL 证书
3. **限制访问**: 配置防火墙规则
4. **定期更新**: 定期更新依赖包
5. **备份数据**: 定期备份重要数据
6. **监控告警**: 配置监控告警规则

## 扩展部署

### 水平扩展

```bash
# 扩展知识库服务到 3 个实例
docker-compose up -d --scale vdi-knowledge=3
```

### 集群部署

对于大规模部署，建议使用 Kubernetes：

1. 将 Docker Compose 转换为 Kubernetes 配置
2. 部署到 Kubernetes 集群
3. 配置自动伸缩
4. 配置负载均衡

## 更新日志

### v1.0.0 (2026-06-08)

- 初始版本发布
- 支持 Docker 容器化部署
- 支持多服务架构
- 支持监控和告警

## 技术支持

如有问题，请联系技术支持：

- 邮箱: support@vdi.com
- 文档: https://docs.vdi.com
- 社区: https://community.vdi.com