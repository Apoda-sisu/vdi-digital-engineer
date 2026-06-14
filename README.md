# VDI 数字工程师 — 工程设计智能体操作系统

> 基于 [PilotDeck](https://github.com/pilot-deck/pilotdeck) 的化工工程设计多智能体系统：专业化 Skill 分工、CFIHOS 编码体系、事件驱动协作与四层漏斗知识检索，覆盖从设计输入到校审输出的智能化工作流。

**仓库**：https://github.com/Apoda-sisu/vdi-digital-engineer

---

## 核心特性

- **三级指挥体系**：L1 专业负责人 → L2 交付物工程师 → L3 计算/工具 Skill
- **CFIHOS 编码对齐**：专业、交付物、事件链、Skill 注册与 CFIHOS V2.0 一致；对内计算保留独立 **计算 ID**
- **事件驱动跨专业协作**：工艺(PX) → 管道(MP) → 仪控(IN) → 电气(EA)…，通过 MCP 事件总线松耦合提资
- **四层漏斗知识检索**：查询解析 → 实体索引 → BM25 混合检索 → 精排 + 跨引用
- **结构化公式库**：167 条 AST 公式 + 关键词/参数双索引，供 `vdi_calculate` 调用
- **红线与校审闸门**：规则引擎 + DisciplineOutput 输出契约

---

## 当前规模（2026-06）

| 维度 | 数量 | 说明 |
|------|------|------|
| Skill | **70** | `workspaces/skills-registry.json` |
| 知识库条文 | **1919** | `pilotdeck-vdi/data/knowledge-clauses-v2.json` |
| 公式 | **167** | 计算 ID 主键，如 `WA-HYD-001`、`PR-COL-001` |
| 已激活专业 | **PX / MP / CI / IN / AA** | 工艺 / 管道 / 给排水 / 仪控 / 管理 |

---

## 编码体系（双轨）

| 用途 | 编码 | 示例 |
|------|------|------|
| Skill `discipline`、知识库、事件/规则键 | **CFIHOS 专业码** | `PX` `MP` `CI` `IN` `AA` |
| Skill `code` / `cfihos_unique_code` | **CFIHOS unique code** | `CFIHOS-20000682` |
| L2 `deliverable_code` | **CFIHOS document type** | `CX7770` `MP1010` |
| `formula_id`、Skill `formula_ids` | **计算 ID** | `WA-HYD-001`（前缀为计算命名空间，≠ CFIHOS 专业码） |

给排水 canonical 专业码为 **CI**（禁止与 CFIHOS.WA 海洋工程混淆）。详见 `pilotdeck-vdi/config/cfihos-discipline-resolve.mjs`。

---

## 架构概览

```
┌──────────────────────────────────────────────────────────────┐
│  PilotDeck 容器 + Docker Compose (vdi-knowledge/events/…)     │
├──────────────────────────────────────────────────────────────┤
│  共享 MCP：knowledge · events · rules · orchestrator · cad   │
├──────────────┬──────────────┬──────────────┬────────────────┤
│  给排水组 CI  │  工艺组 PX   │  管道组 MP   │  仪控组 IN …   │
│  workspaces/ │  workspaces/ │  workspaces/ │  workspaces/   │
│  {组}/skills │  {组}/skills │  {组}/skills │  {组}/skills   │
└──────────────┴──────────────┴──────────────┴────────────────┘
         ↑ canonical 源                    ↓ sync
    workspaces/skills-registry.json   .pilotdeck/skills 副本
```

---

## 项目结构

```
.
├── pilotdeck-vdi/                 # VDI 核心产品包
│   ├── config/
│   │   ├── mcp.json               # MCP 服务清单
│   │   ├── discipline-codes.json  # CFIHOS 专业映射
│   │   ├── cfihos-discipline-resolve.mjs
│   │   └── skills-layout.mjs      # Skill 路径唯一真相源
│   ├── mcp/                       # MCP 微服务实现
│   │   ├── vdi-knowledge/         # 知识库 + 公式计算
│   │   ├── vdi-events/            # 事件总线
│   │   ├── vdi-rules/             # 规则 / 校审 / 契约
│   │   ├── vdi-orchestrator/      # 任务编排
│   │   ├── vdi-cad/               # CAD 制图（试点）
│   │   ├── vdi-documents/         # 文档导入导出
│   │   └── vdi-vision/            # 视觉理解
│   ├── data/
│   │   ├── knowledge-clauses-v2.json
│   │   ├── formulas/              # 公式 JSON + index.json
│   │   ├── skill-cfihos-unique-codes.json
│   │   └── dashboard-enhanced.html
│   ├── pilotdeck-user-skills/     # 跨项目用户技能（→ ~/.pilotdeck/skills）
│   └── scripts/                   # 审计、E2E、迁移、同步
├── workspaces/                    # 工作空间（gitignore，本地开发目录）
│   ├── skills-registry.json       # 全库 Skill 索引
│   ├── 工艺组/skills/             # canonical Skill 源
│   ├── 管道组/skills/
│   ├── 给排水组/skills/
│   └── …
├── cad-intelligence/              # CAD 智能制图模块（FreeCAD）
├── CFIHOS V2.0/                   # CFIHOS 参考数据（CSV / 规范文档）
├── docker-compose.yml             # VDI MCP 服务栈
├── deploy.sh                      # 构建 / 启停 / 健康检查
├── DEPLOYMENT.md                  # 生产部署说明
└── docs/                          # 建设方案与模块设计（本地文档）
```

> **禁止**在仓库根目录创建 `skills/`；历史根目录 `skills/` 已移除，一律使用 `workspaces/{专业组}/skills/`。

---

## 快速开始

### 前置条件

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Node.js 18+（本地跑审计 / 测试脚本）
- （可选）[PilotDeck](https://github.com/pilot-deck/pilotdeck) 用于 IDE 内 Skill 调试

### 1. 克隆与配置

```bash
git clone https://github.com/Apoda-sisu/vdi-digital-engineer.git
cd vdi-digital-engineer
cp .env.example .env   # 按需修改
```

### 2. 启动 MCP 服务栈

```bash
docker compose up -d --build
# 或
./deploy.sh start
```

| 服务 | 端口 | 健康检查 |
|------|------|----------|
| vdi-knowledge | 3000 | `curl localhost:3000/health` |
| vdi-events | 3011 | `curl localhost:3011/health` |
| vdi-rules | 3002 | `curl localhost:3002/health` |
| vdi-documents | 3003 | `curl localhost:3003/health` |
| vdi-vision | 3004 | `curl localhost:3004/health` |

### 3. 同步 Skill 到 PilotDeck 工作空间

```bash
node pilotdeck-vdi/scripts/sync-pilotdeck-workspace.mjs --all-workspaces
# 需要重载容器时
node pilotdeck-vdi/scripts/sync-pilotdeck-workspace.mjs --all-workspaces --restart
```

### 4. 质量门禁（提交前建议）

```bash
node pilotdeck-vdi/scripts/validate-system.mjs --quick
node pilotdeck-vdi/scripts/audit-all-skills.mjs
node pilotdeck-vdi/tests/test-system-health.mjs --quick
node pilotdeck-vdi/tests/test-formula-tools.mjs
```

### 5. 可视化

```bash
node pilotdeck-vdi/scripts/sync-dashboard-enhanced.mjs
open pilotdeck-vdi/data/dashboard-enhanced.html
```

---

## 核心模块

### 知识库检索（vdi-knowledge）

| 层级 | 功能 |
|------|------|
| 第1层 | 查询解析 + 专业路由（CFIHOS `discipline`，兼容 legacy slug） |
| 第2层 | 实体索引精确匹配 |
| 第3层 | BM25 混合检索 |
| 第4层 | 精排 + 跨引用解析 |

工具：`vdi_search_knowledge` · `vdi_get_citation` · `vdi_search_formulas` · `vdi_calculate`

### 事件驱动协作（vdi-events）

```
PX(工艺) ── design_basis.updated ──→ MP(管道) + IN(仪控) + CI(给排水) …
MP(管道) ── discipline_output.published ──→ 按订阅路由
AA(管理) ── 订阅关键闸门事件 ──→ 进度与审核
```

注册表：`pilotdeck-vdi/mcp/vdi-events/event-registry.json`

### 任务编排（vdi-orchestrator）

专业依赖图（节选）：

```
PX → MP → IN → EA
PX → CI → HX
PX → MX → CS
AA → 全专业（顶层协调）
```

### 规则引擎（vdi-rules）

红线规则、三审三校闸门、`vdi_validate_discipline_output` 输出契约校验。

---

## 文档索引

| 文档 | 内容 |
|------|------|
| [pilotdeck-vdi/README.md](pilotdeck-vdi/README.md) | 产品包、审计命令、E2E 清单 |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Docker 生产部署 |
| `docs/系统建设方案与各模块设计/0000_*.md` | Skill 建设原则 + 编码 §7 |
| `docs/系统建设方案与各模块设计/1007_*.md` | 日常约束操作 |
| `docs/系统建设方案与各模块设计/1013_*.md` | `audit-all-skills` 规格 |

---

## 技术栈

| 组件 | 技术 | 用途 |
|------|------|------|
| 运行时 | PilotDeck + Docker Compose | 智能体 OS + MCP 服务 |
| MCP | Node.js (ESM) | 微服务协议 |
| 知识检索 | BM25 + 实体索引 | 规范条文召回 |
| 公式引擎 | JSON AST | `vdi_calculate` |
| 事件总线 | JSON 注册表 + 文件 inbox | 跨专业异步协作 |
| CAD | FreeCAD + cad-intelligence | 二维/三维制图试点 |

---

## 参与贡献

1. Fork 本仓库
2. `git checkout -b feature/my-feature`
3. 改动后跑 `validate-system.mjs --quick` 与 `audit-all-skills.mjs`
4. 提交 PR

Skill 新增请遵循 `workspaces/{专业组}/skills/{slug}/` 布局，并在 `skill-cfihos-unique-codes.json` 注册。

---

## 开源协议

[Apache License 2.0](LICENSE)

Copyright 2026 VDI Digital Engineer Project
