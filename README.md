# VDI Digital Engineer — Engineering Design Multi-Agent System

> 化工工程设计多智能体系统：32 个专业化 Skill、事件驱动跨专业协作、四层漏斗知识检索，覆盖从工艺设计到 HAZOP 安全分析的全流程智能化。

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![PilotDeck](https://img.shields.io/badge/Runtime-PilotDeck-green.svg)](https://github.com/pilot-deck/pilotdeck)
[![Skills](https://img.shields.io/badge/Agent%20Skills-32-orange.svg)](skills/)

---

## 项目简介

VDI Digital Engineer（虚拟设计院数字工程师）是一个面向**化工工程设计领域**的多智能体系统。它将传统设计院的专业分工映射为 AI Skill，让每个设计专业拥有自己的「数字工程师」，并通过知识检索、规则校验、事件协作实现专业间的自动化协同。

**核心理念**：AI 应用于过程而非审查结果——通过规范设计过程来保障结果的正确性，创造价值而非增加负担。

### 它能做什么

- **专业设计辅助**：给排水、工艺、HAZOP 分析等 32 个专业 Skill，覆盖设计、计算、选型、校审全流程
- **规范知识检索**：基于 470+ 条国家标准/行业标准条文的四层漏斗精准检索
- **跨专业提资协作**：工艺 → 管道 → 仪控 → 电气的事件驱动自动提资
- **质量红线校验**：7 条红线规则 + 4 阶段校审闸门，确保设计合规
- **HAZOP 分析**：完整的主席 + 5 专家 + 6 助理多智能体协作体系

---

## 核心特性

### 三级指挥体系

每个设计专业采用「负责人 → 分项领域 → 专项共享」三级架构，以给排水为试点：

```
设计经理（跨专业派发）
    │
    ▼
给排水专业负责人（一级：任务拆解、进度控制、校审组织）
    │
    ├── 给水设计 / 消防给水 / 排水设计 / 雨水设计 / 污水处理 / 循环水（二级：6 个分项领域）
    │       │
    │       └── 水力计算 / 设备选型（三级：2 个专项共享，被二级调用）
    │
    ▼
汇总 DisciplineOutput → 校审 → 提交
```

### 四层漏斗知识检索

精准召回规范条文，每一层逐步缩小范围：

| 层级 | 功能 | 示例 |
|------|------|------|
| 第 1 层 | 查询解析 + 路由 | "GB 50974 消火栓" → 精确查找 |
| 第 2 层 | 实体索引精确匹配 | "GB 50974 §7.2.1" → 直接命中 |
| 第 3 层 | BM25 混合检索 | "消防水泵流量" → 评分排序 |
| 第 4 层 | 精排 + 跨引用解析 | 追踪 GB 6245 等引用关系 |

### 事件驱动跨专业协作

14 种事件类型，16 个专业的订阅关系：

```
工艺(PR) ──publish(design_basis.updated)──→ 管道(PI) + 仪控(IN)
                                               │
管道(PI) ──publish(discipline_output.published)──→ 管理(MG)
```

### HAZOP 多智能体分析

完整的危险与可操作性分析体系，由 12 个 Skill 组成：

```
HAZOP 分析主席（决策层）
    │
    ├── 工艺专家 / 仪表专家 / 设备专家 / 安全专家 / 操作专家（分析层）
    │
    ├── Prep 助理（会前准备、资料解析）
    ├── Matrix 助理（偏差矩阵、引导词应用）
    ├── Scenario 助理（场景分析、六步分析）
    ├── QA 助理（质量审查、完整性检查）
    ├── Report 助理（报告生成、建议台账）
    └── 本质安全评估助理（物料替代、工艺简化）
```

---

## 项目结构

```
.
├── skills/                        # 32 个 Agent Skill 定义
│   ├── vdi-water-lead/            #   给排水专业负责人（一级）
│   ├── vdi-water-fire/            #   消防给水设计（二级）
│   ├── vdi-water-hydraulics/      #   水力计算（三级）
│   ├── vdi-process-lead/          #   工艺专业负责人
│   ├── vdi-process-calc/          #   工艺计算
│   ├── vdi-process-simulation/    #   流程模拟
│   ├── vdi-design-manager/        #   设计经理
│   ├── vdi-scheduler-agent/       #   计划调度
│   ├── hazop-chair/               #   HAZOP 分析主席
│   ├── hazop-expert-*/            #   HAZOP 专家（5 个专业方向）
│   ├── hazop-*-assistant/         #   HAZOP 助理（6 个功能）
│   └── index.json                 #   Skill 注册表
│
├── pilotdeck-vdi/                 # PilotDeck VDI 核心
│   ├── mcp/                       # MCP 微服务
│   │   ├── vdi-knowledge/         #   知识库检索（四层漏斗，5 工具）
│   │   ├── vdi-orchestrator/      #   任务编排（WBS/派发/里程碑，9 工具）
│   │   ├── vdi-events/            #   事件总线（跨专业提资，5 工具）
│   │   └── vdi-rules/             #   规则引擎（红线/校审/契约，3 工具）
│   ├── config/                    # 配置文件
│   │   ├── mcp.json               #   MCP 服务配置
│   │   └── discipline-codes.json  #   学科代码体系
│   ├── data/                      # 知识库数据
│   │   ├── knowledge-clauses-v2.json  # 470+ 条规范条文
│   │   ├── hazop-knowledge-clauses.json # HAZOP 知识条文
│   │   └── domain-dictionary.yaml #   领域词典
│   ├── scripts/                   # 构建与工具脚本
│   │   ├── build_enhanced_index.py #  索引构建器
│   │   ├── build_milvus_index.py  #  Milvus 向量索引
│   │   ├── evaluate_retrieval.py  #  检索评估
│   │   └── e2e-pilot-a.mjs       #  端到端验证脚本
│   ├── products/vdi/plugins/      # PilotDeck 插件定义
│   └── README.md                  # 部署说明
│
├── .env.example                   # 环境变量模板
├── LICENSE                        # Apache 2.0
└── README.md                      # 本文件
```

> **注意**：项目文档（`docs/`）、工作空间数据（`workspaces/`）、标准采集器（`pilotdeck-vdi/collector/`）等目录因包含敏感配置或内部资料，未纳入开源仓库。

---

## Skill 全景（32 个）

### VDI 工程设计 Skills（20 个）

| 类别 | Skills | 说明 |
|------|--------|------|
| **设计管理** | `vdi-design-manager`、`vdi-scheduler-agent` | 项目级任务派发与计划调度 |
| **工艺专业** | `vdi-process-lead`、`vdi-process-route`、`vdi-process-pfd-pid`、`vdi-process-calc`、`vdi-process-balance`、`vdi-process-equipment`、`vdi-process-simulation`、`vdi-process-safety`、`vdi-process-utilities` | 工艺三级体系（1 负责人 + 8 分项） |
| **给排水专业** | `vdi-water-lead`、`vdi-water-supply`、`vdi-water-fire`、`vdi-water-drainage`、`vdi-water-stormwater`、`vdi-water-wastewater`、`vdi-water-circulating`、`vdi-water-hydraulics`、`vdi-water-equipment` | 给排水三级体系（1 负责人 + 6 分项 + 2 共享） |

### HAZOP 分析 Skills（12 个）

| 层级 | Skills | 说明 |
|------|--------|------|
| **决策层** | `hazop-chair` | 分析主席：节点确认、风险审核、团队协调 |
| **分析层** | `hazop-expert-process`、`hazop-expert-instrument`、`hazop-expert-equipment`、`hazop-expert-safety`、`hazop-expert-operation` | 5 位专家：工艺/仪表/设备/安全/操作 |
| **执行层** | `hazop-prep-assistant`、`hazop-matrix-assistant`、`hazop-scenario-assistant`、`hazop-qa-assistant`、`hazop-report-assistant`、`hazop-inherent-safety` | 6 个助理：准备/矩阵/场景/质审/报告/本质安全 |

---

## 知识库

### 覆盖范围

| 类别 | 文件数量 | 条款数量 | 强制性条文 |
|------|----------|----------|------------|
| 法律法规 | 5 | 85 | 15 |
| 国家标准 | 11 | 180 | 25 |
| 行业标准 | 8 | 120 | 10 |
| 公司规定 | 8 | 60 | 5 |
| 项目案例 | 5 | 25 | - |
| **合计** | **37** | **470** | **55** |

### 核心规范

- **GB 50160** 石油化工企业设计防火规范
- **GB 50016** 建筑设计防火规范
- **GB 50058** 爆炸危险环境电力装置设计规范
- **GB 50974** 消防给水及消火栓系统技术规范
- **GB 50493** 石油化工可燃气体和有毒气体检测报警设计标准
- **GB/T 50770** 石油化工安全仪表系统设计规范
- **SH/T 3011** 石油化工企业工艺装置设计规范
- 以及更多（详见知识库数据文件）

### 条文数据结构

每条知识条文包含完整的元数据，支持精准检索与证据链追溯：

```json
{
  "clause_id": "fbd6997a32fc",
  "source_id": "GB 50974-2014",
  "clause": "5.1.5",
  "content": "消防水泵应根据设计要求选用...",
  "discipline": "water",
  "mandatory": false,
  "outgoing_refs": ["GB 6245"],
  "tokens": ["消防水泵", "GB 6245"],
  "evidence_tag": "[GB 50974-2014 §5.1.5]"
}
```

---

## 快速开始

### 前置条件

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 已安装并运行
- [PilotDeck](https://github.com/pilot-deck/pilotdeck) 已克隆

### 部署步骤

```bash
# 1. 克隆本项目
git clone https://github.com/YOUR_USERNAME/vdi-digital-engineer.git
cd vdi-digital-engineer

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 AI 视觉模型 API Key（用于验证码识别等 RPA 场景）

# 3. 链接插件到 PilotDeck 全局目录
mkdir -p ~/.pilotdeck/plugins
for p in vdi-knowledge vdi-rules vdi-events vdi-orchestrator; do
  ln -sf "$(pwd)/pilotdeck-vdi/products/vdi/plugins/$p" \
    "$HOME/.pilotdeck/plugins/$p"
done

# 4. 迁移 Skills 到 PilotDeck
cd /path/to/pilotdeck
npm run skills:migrate -- \
  --source "/path/to/vdi-digital-engineer/skills" \
  --execute

# 5. 在 PilotDeck docker-compose.yml 中添加挂载
# volumes:
#   - /path/to/vdi-digital-engineer:/workspace
#   - ~/.pilotdeck/plugins:/root/.pilotdeck/plugins

# 6. 启动容器
cd /path/to/pilotdeck && docker compose restart

# 7. 访问 PilotDeck Web UI
open http://localhost:3000
```

### 使用 Skill

在 PilotDeck Web UI 中：
1. 创建新项目（WorkSpace）
2. 对话中输入斜杠命令启用 Skill，如 `/vdi-water-lead` 或 `/hazop-chair`
3. 当工具显示为 `mcp__vdi-knowledge__*` 时，表示 MCP 知识库已接通

---

## 技术栈

| 组件 | 技术 | 用途 |
|------|------|------|
| 运行时 | PilotDeck (Docker) | 智能体操作系统 |
| MCP 服务 | Node.js + JavaScript | 22 个工具（知识 5 + 编排 9 + 事件 5 + 规则 3） |
| 知识检索 | BM25 + Milvus Lite | 混合检索（稀疏 + 稠密） |
| 向量数据库 | Milvus Lite 3.0 | 向量索引与相似度搜索 |
| 事件总线 | 文件系统 + JSON | 跨专业异步协作 |
| 规范采集 | Playwright (RPA) | 自动化网页采集 |
| 验证码识别 | Tesseract.js / Vision API | OCR + AI 视觉模型 |

---

## 文档索引

> 项目内部文档未纳入开源仓库，以下列出主要文档标题供参考：

| 编号 | 文档 | 说明 |
|------|------|------|
| 1001 | PilotDeck-VDI 深集成建设规划 | 技术路线与实施计划 |
| 1002 | 项目规划书 V3.3 | 总体设计与全专业体系 |
| 1003 | 项目整体建设进度跟踪计划书 | 里程碑与进度管理 |
| 1004 | 跨专业提资事件链设计 | 事件驱动协作设计 |
| 1005 | 跨专业调用的实现方法 | 技术实现细节 |
| 2001 | 标准规范收集系统与知识运营平台设计 | 知识库建设规划 |
| 2003 | 知识库更新机制 | 三种更新路径与痛点分析 |
| 2004 | 结构化公式库建设 | 公式引擎规划 |
| 9999 | 三期目标及技术风险预判 | 远期规划 |

---

## 发展路线

| 阶段 | 目标 | 状态 |
|------|------|------|
| **阶段 0 — 基座** | Docker 部署、Skills 迁移、`vdi-knowledge` MCP | **已完成** |
| **阶段 1 — 试点 A** | 给排水单专业三审三校 + `vdi-rules` | **已完成**（编排层就绪，Schema 对齐，离线 E2E 26/26 通过） |
| **阶段 2 — 试点 B** | 工艺 → 管道 → 仪控跨专业提资 | 待启动 |
| **阶段 3 — 扩展** | 其余专业索引、企业系统 Adapter、知识库扩至 1000+ 条文 | 待启动 |

### 三期愿景

| 时期 | 目标 |
|------|------|
| 现阶段 | 直接产生文档类、数据类、说明类成果 |
| 中期 | 以 CFIHOS 为基础建立多专业语义锚点和数据标准 |
| 长期 | 连通设计工具（CAD、3D、Aspen 等）提供数据支持 |
| 远期 | 直接指挥设计工具完成图形绘制 |

---

## 参与贡献

欢迎贡献代码、规范条文、Skill 定义或文档改进！

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/my-feature`
3. 提交更改：`git commit -m 'feat: add my feature'`
4. 推送分支：`git push origin feature/my-feature`
5. 提交 Pull Request

### 贡献方向

- **新增专业 Skill**：参考 `skills/` 下已有 Skill 的结构，为新专业创建 SKILL.md
- **扩充知识库**：补充规范条文、行业标准、设计案例
- **改进 HAZOP 分析**：增强专家推理能力、扩展引导词库
- **Bug 修复与文档**：任何改进都欢迎

---

## 开源协议

本项目采用 [Apache License 2.0](LICENSE) 开源协议。

Copyright 2026 VDI Digital Engineer Project
