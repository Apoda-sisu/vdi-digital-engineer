# VDI 数字工程师 — 工程设计智能体操作系统

> 基于 [PilotDeck](https://github.com/pilot-deck/pilotdeck) 的化工工程设计多智能体系统，通过专业化 Skill 分工、事件驱动协作和四层漏斗知识检索，实现从设计输入到校审输出的全流程智能化。

## 核心特性

- **三级指挥体系**：专业负责人(Lead) → 子专业(Sub) → 工具级(Tool)，分层管理设计任务
- **事件驱动跨专业协作**：工艺 → 管道 → 仪控 → 电气，通过事件总线实现松耦合提资
- **四层漏斗知识检索**：查询解析 → 实体索引 → BM25 混合检索 → 精排+跨引用，精准召回规范条文
- **红线规则引擎**：7 条红线规则 + 4 阶段校审闸门，确保设计合规
- **结构化输出契约**：DisciplineOutput JSON Schema，强制各专业输出格式一致

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                    PilotDeck 容器                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │              共享 MCP 服务层                        │  │
│  │  ┌────────┐ ┌────────────┐ ┌────────┐ ┌────────┐ │  │
│  │  │events  │ │orchestrator│ │ rules  │ │knowledge│ │  │
│  │  │事件总线 │ │ 任务编排器  │ │规则引擎│ │知识检索 │ │  │
│  │  └───┬────┘ └─────┬──────┘ └───┬────┘ └───┬────┘ │  │
│  └──────┼────────────┼────────────┼──────────┼──────┘  │
│         │            │            │          │         │
│  ┌──────┼────────────┼────────────┼──────────┼──────┐  │
│  │  ┌───┴───┐  ┌─────┴──┐  ┌─────┴──┐  ┌───┴───┐  │  │
│  │  │给排水组│  │ 工艺组 │  │ 管理组 │  │ 试点  │  │  │
│  │  │Skills │  │ Skills │  │ Skills │  │ A / B │  │  │
│  │  └───────┘  └────────┘  └────────┘  └───────┘  │  │
│  │            工作空间（互相隔离）                    │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 项目结构

```
.
├── docs/                          # 项目文档
│   ├── 项目建议书-详细版.md        # 项目总体设计
│   ├── 项目整体建设进度跟踪计划书.md # 进度跟踪
│   └── ...
├── pilotdeck-vdi/                 # PilotDeck VDI 核心
│   ├── config/                    # 配置文件
│   │   ├── mcp.json               # MCP 服务配置
│   │   └── discipline-codes.json  # 学科代码体系
│   ├── mcp/                       # MCP 微服务
│   │   ├── vdi-knowledge/         # 知识库检索（四层漏斗）
│   │   ├── vdi-orchestrator/      # 任务编排（WBS/派发/里程碑）
│   │   ├── vdi-events/            # 事件总线（跨专业提资）
│   │   └── vdi-rules/             # 规则引擎（红线/校审/契约）
│   ├── scripts/                   # 构建与工具脚本
│   │   ├── build_enhanced_index.py # V2 索引构建器
│   │   ├── build_milvus_index.py  # Milvus 向量索引
│   │   └── evaluate_retrieval.py  # 检索评估
│   ├── data/                      # 知识库数据
│   │   ├── knowledge-clauses-v2.json # 360+ 条规范条文
│   │   └── domain-dictionary.yaml # 领域词典
│   └── collector/                 # 标准规范采集器
│       └── rpa/openstd-collector.mjs
├── skills/                        # 专业 Skill 定义
│   ├── vdi-design-manager/        # 设计经理（项目级）
│   ├── vdi-scheduler-agent/       # 计划调度
│   ├── vdi-water-lead/            # 给排水负责人
│   ├── vdi-water-equipment/       # 给排水设备选型
│   ├── vdi-water-hydraulics/      # 给排水水力计算
│   ├── vdi-process-lead/          # 工艺负责人
│   ├── vdi-process-calc/          # 工艺计算
│   └── vdi-process-simulation/    # 工艺模拟
├── workspaces/                    # 工作空间
│   ├── 给排水组/                   # 给排水专业组
│   ├── 工艺组/                     # 工艺专业组
│   ├── 管理组/                     # 管理组
│   └── VDI-跨专业提资-试点B/       # 试点项目
├── LICENSE                        # Apache 2.0 开源协议
└── README.md                      # 本文件
```

## 快速开始

### 前置条件

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 已安装并运行
- [PilotDeck](https://github.com/pilot-deck/pilotdeck) 已克隆

### 启动步骤

```bash
# 1. 克隆 PilotDeck
git clone https://github.com/pilot-deck/pilotdeck.git
cd pilotdeck

# 2. 克隆本项目到 PilotDeck 目录
git clone https://github.com/YOUR_USERNAME/vdi-digital-engineer.git

# 3. 将本项目的 MCP 服务复制到 PilotDeck
cp -r vdi-digital-engineer/pilotdeck-vdi/mcp/* pilotdeck/plugins/

# 4. 启动 Docker 容器
docker-compose up -d

# 5. 访问 PilotDeck Web UI
open http://localhost:3000
```

### 创建项目并加载 Skill

1. 在 PilotDeck Web UI 中创建新项目
2. 项目路径指向 `workspaces/给排水组/`（或其他专业组）
3. Skill 会自动从 `skills/` 目录加载

## 核心模块

### 1. 知识库检索（vdi-knowledge）

四层漏斗架构，精准召回规范条文：

| 层级 | 功能 | 示例 |
|------|------|------|
| 第1层 | 查询解析 + 路由 | "GB 50974 消火栓" → 精确查找 |
| 第2层 | 实体索引精确匹配 | "GB 50974 §7.2.1" → 直接命中 |
| 第3层 | BM25 混合检索 | "消防水泵流量" → 评分排序 |
| 第4层 | 精排 + 跨引用解析 | 追踪 GB 6245 等引用关系 |

当前知识库覆盖：**360+ 条规范条文**，涵盖 GB 50974、GB 50016、GB 50160 等 20+ 部国家标准。

### 2. 事件驱动协作（vdi-events）

14 种事件类型，16 个专业的订阅关系：

```
工艺(PR) ──publish(design_basis.updated)──→ 管道(PI) + 仪控(IN)
                                               │
管道(PI) ──publish(discipline_output.published)──→ 管理(MG)
```

### 3. 任务编排（vdi-orchestrator）

专业依赖图 + WBS 拓扑排序 + 关键路径计算：

```
PR(工艺) → PI(管道) → IN(仪控) → EL(电气) → ST(结构)
   ├→ EQ(设备)
   ├→ WA(给排水) → FI(消防)
   └→ HS(HSE)
```

### 4. 规则引擎（vdi-rules）

- **7 条红线规则**：消防流量、防火间距、防爆等级等硬性约束
- **4 阶段校审闸门**：方案设计 → 初步设计 → 施工图设计 → 出版前检查
- **输出契约**：各专业 DisciplineOutput JSON Schema

## 技术栈

| 组件 | 技术 | 用途 |
|------|------|------|
| 运行时 | PilotDeck (Docker) | 智能体操作系统 |
| MCP 服务 | Node.js + TypeScript | 微服务通信协议 |
| 知识检索 | BM25 + Milvus Lite | 混合检索（稀疏+稠密） |
| 向量数据库 | Milvus Lite 3.0 | 向量索引与相似度搜索 |
| 事件总线 | 文件系统 + JSON | 跨专业异步协作 |
| 规范采集 | Playwright (RPA) | 自动化网页采集 |

## 文档

- [项目建议书-详细版](docs/项目建议书-详细版.md) — 总体设计与技术方案
- [项目整体建设进度跟踪计划书](docs/项目整体建设进度跟踪计划书.md) — 进度跟踪与里程碑
- [跨专业提资事件链设计](docs/1004_跨专业提资事件链设计.md) — 事件驱动协作设计
- [Milvus 与 BM25 关系分析](docs/Milvus与BM25关系分析.md) — 检索架构技术分析
- [标准规范收集系统设计](docs/标准规范收集系统与知识运营平台设计.md) — 知识运营平台规划

## 参与贡献

欢迎贡献代码、规范条文、Skill 定义或文档改进！

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/my-feature`
3. 提交更改：`git commit -m 'Add my feature'`
4. 推送分支：`git push origin feature/my-feature`
5. 提交 Pull Request

## 开源协议

本项目采用 [Apache License 2.0](LICENSE) 开源协议。

Copyright 2026 VDI Digital Engineer Project
