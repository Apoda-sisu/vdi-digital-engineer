# PilotDeck VDI 深集成产品包

将虚拟设计院（VDI）数字工程师能力以 **PilotDeck Plugin + MCP + Skill** 形式部署。建设规划见 `docs/PilotDeck-VDI-深集成建设规划.md`；Skill 建设路线见 `docs/系统建设方案与各模块设计/0001_智慧设计蜂群Skill建设Plan.md`。

**当前状态（2026-06-13）**：阶段 1「三家老店整改」已完成 — 给排水 / 管道 / 工艺共 **57 个实体 Skill** 均已迁移 **V1.2**（正文七块 + `references/` 附录 + L2 `evals/evals.json`）。

---

## 目录结构

| 路径 | 说明 |
|------|------|
| `products/vdi/plugins/` | PilotDeck 插件骨架（knowledge / rules / events / orchestrator） |
| `mcp/` | MCP 服务实现（knowledge、rules、events、orchestrator、cad、documents…） |
| `config/` | 专业代号、`mcp.json`、工作空间路径 |
| `data/` | 知识库种子、公式、治理看板 |
| `scripts/` | 审计、E2E、知识检索回归、Skill 评分 |
| `schemas/` | Skill / 知识 / 公式 JSON Schema |
| `freecad/` | FreeCAD 插件与 CAD 深化方案 |
| `pilotdeck-user-skills/` | 同步到 `~/.pilotdeck/skills` 的跨项目用户技能 |
| `workspaces/{专业组}/skills/` | **正式 Skill 源**（按专业分组，禁止放仓库根目录） |
| `workspaces/{专业组}/skill-workspaces/` | eval 快照与迭代产物 |
| `workspaces/skills-registry.json` | 全库 Skill 索引 |
| `pilotdeck-vdi/config/skills-layout.mjs` | 路径解析唯一真相源 |
| `../scripts/` | 仓库级 Skill 迁移门禁（`migrate-skill-compact.mjs` 等） |

---

## Skill 体系（V1.2）

### 两层目录（不要混用）

| 范围 | 路径 | 用途 |
|------|------|------|
| **用户技能** | `~/.pilotdeck/skills/` | 跨项目通用（文档导出/解读、健康检查、调度） |
| **项目技能** | `<workspace>/.pilotdeck/skills/` | 当前专业组专用 Skill（白名单过滤） |

- **源目录** `workspaces/{专业组}/skills/`：各专业技能 canonical 源；**严禁**在仓库根目录创建 `skills/` 或 `vdi-*-workspace/`
- **同步**：`sync-pilotdeck-workspace.mjs` 将 `workspace/skills/` 复制到 `workspace/.pilotdeck/skills/`
- **试点数据**：`workspaces/{工艺组,管道组,给排水组}/pilot/`

### 专业索引

| 专业 | 索引 | L1 | L2 | 状态 |
|------|------|----|----|------|
| 给排水 | `workspaces/给排水组/skills/INDEX.md` | 1 | 6 | ✅ V1.2 |
| 管道 | `workspaces/管道组/skills/INDEX.md` | 1 | 12+CAD | ✅ PI-M3 benchmark |
| 工艺 | `workspaces/工艺组/skills/INDEX.md` | 1 | 15 | ✅ V1.2 |
| 仪控 | `workspaces/仪控组/skills/INDEX.md` | 1 | 8 + 4 L3 | ✅ IN-M1 benchmark |

### V1.2 写法要点

1. 正文保留 **七块**（元数据、规范检索、执行模式、MUST 表、CP 步骤表、输出契约、任务卡摘要）
2. 长模板迁入 `references/{code}-cp-templates.md`
3. L2 必须有 `evals/evals.json`（≥2 道行为题）
4. 正文含：**输出 CP-N 前读取 references 中 CP-N 模板**
5. `metadata.vdi.generation: v1.2`

建设原则：`docs/系统建设方案与各模块设计/0000_智慧设计蜂群 Skill建设原则.md`

---

## 验收与审计（Sprint 收尾必跑）

### 全库门禁

```bash
# 结构审计（默认 warn；L2 缺 evals 仅统计）
node pilotdeck-vdi/scripts/audit-all-skills.mjs

# 严格模式（L2 缺 evals → fail）
node pilotdeck-vdi/scripts/audit-all-skills.mjs --strict-eval

# 按专业
node pilotdeck-vdi/scripts/audit-all-skills.mjs --discipline WA
node pilotdeck-vdi/scripts/audit-all-skills.mjs --discipline PI --strict-eval
node pilotdeck-vdi/scripts/audit-all-skills.mjs --discipline PR --strict-eval
```

规格：`docs/系统建设方案与各模块设计/1013_audit-all-skills规格.md`

### 专业结构审计

```bash
node pilotdeck-vdi/scripts/audit-water-skills.mjs
node pilotdeck-vdi/scripts/audit-piping-skills.mjs
node pilotdeck-vdi/scripts/audit-process-skills.mjs
```

### E2E 冒烟（契约与交接链）

| 脚本 | 测什么 | 通过标准 |
|------|--------|----------|
| `e2e-piping-chain.mjs` | 管道 D01→D02→D03→D08→D10 五段成果 JSON | **5/5** |
| `e2e-pilot-a.mjs` | 给排水整趟：派活→CP 人机协同→四审→汇总→事件 | **35/35** |
| `e2e-pilot-b.mjs` | 工艺→管道→仪控 跨专业提资链 | 全绿 |

```bash
node pilotdeck-vdi/scripts/e2e-piping-chain.mjs
node pilotdeck-vdi/scripts/e2e-pilot-a.mjs
node pilotdeck-vdi/scripts/e2e-pilot-b.mjs
```

### 知识库检索回归

```bash
node pilotdeck-vdi/scripts/test-water-knowledge-retrieval.mjs    # 18/18
node pilotdeck-vdi/scripts/test-piping-knowledge-retrieval.mjs
node pilotdeck-vdi/scripts/test-process-knowledge-retrieval.mjs
```

### L2 行为考试（压缩迁移前后对比）

```bash
# 给排水（6 L2）
node pilotdeck-vdi/scripts/run-drainage-eval-compare.mjs
node pilotdeck-vdi/scripts/run-supply-eval-compare.mjs
node pilotdeck-vdi/scripts/run-fire-eval-compare.mjs
# … 其他给排水 L2 均有对应 run-*-eval-compare.mjs

# 管道（13 L2，通用脚本 + 批量）
node pilotdeck-vdi/scripts/run-skill-eval-compare.mjs --skill vdi-piping-material-class --sprint PI-M3 --iteration iteration-pi-m3
node scripts/run-all-piping-eval-compare.mjs
```

评分器：`grade-skill-eval-output.mjs` · 迁移门禁：`../scripts/migrate-skill-compact.mjs`

---

## MCP 服务

| 服务 | 路径 | 职责 |
|------|------|------|
| vdi-knowledge | `mcp/vdi-knowledge/` | 规范/公式检索、`vdi_calculate` |
| vdi-rules | `mcp/vdi-rules/` | 输出契约、红线、`vdi_check_data_completeness` |
| vdi-events | `mcp/vdi-events/` | 事件总线 |
| vdi-orchestrator | `mcp/vdi-orchestrator/` | 任务包、WBS、派发、里程碑 |
| vdi-cad | `mcp/vdi-cad/` | PFD/PID/layout/iso/3d 出图 |
| documents | `mcp/documents/` | 文档导入导出 |

配置入口：`config/mcp.json`（工作空间内可覆盖）。

---

## 插件列表

| 目录 | 状态 | 说明 |
|------|------|------|
| `products/vdi/plugins/vdi-knowledge` | 骨架 | 规范/知识检索 |
| `products/vdi/plugins/vdi-rules` | 骨架 | 红线与输出契约校验 |
| `products/vdi/plugins/vdi-events` | 骨架 | 事件总线 |
| `products/vdi/plugins/vdi-orchestrator` | 骨架 | 任务编排与派发 |

---

## 同步工作空间

```bash
# 同步用户技能 + 专业组 workspace（修改后建议 --restart）
node pilotdeck-vdi/scripts/sync-pilotdeck-workspace.mjs --restart

# 全工作空间
node pilotdeck-vdi/scripts/sync-pilotdeck-workspace.mjs --all-workspaces --restart
```

修改 `PilotDeck/docker-compose.yml` 挂载后需 recreate 容器：

```bash
cd /path/to/PilotDeck && docker compose up -d
```

---

## 部署到本地 Docker PilotDeck

```bash
# 1. 链接插件到 PilotDeck 全局目录
mkdir -p ~/.pilotdeck/plugins
REPO="/Users/apoda/Documents/Cursor/016-数字工程师"
for p in vdi-knowledge vdi-rules vdi-events vdi-orchestrator; do
  ln -sf "$REPO/pilotdeck-vdi/products/vdi/plugins/$p" "$HOME/.pilotdeck/plugins/$p"
done

# 2. 同步 Skill 到 workspace（推荐，替代整库 migrate）
node "$REPO/pilotdeck-vdi/scripts/sync-pilotdeck-workspace.mjs" --all-workspaces

# 3. 验收
node "$REPO/pilotdeck-vdi/scripts/audit-all-skills.mjs" --strict-eval
node "$REPO/pilotdeck-vdi/scripts/e2e-pilot-a.mjs"
```

### Docker Compose 建议挂载

```yaml
volumes:
  - /Users/apoda/Documents/Cursor/016-数字工程师:/workspace
  - /Users/apoda/Documents/Cursor/016-数字工程师/pilotdeck-vdi/pilotdeck-user-skills:/root/.pilotdeck/skills:rw
  - /Users/apoda/.pilotdeck/plugins:/root/.pilotdeck/plugins
  - pilotdeck-home:/root/.pilotdeck
```

WorkSpace 根目录示例：`/workspace/workspaces/给排水组`。专业 Skill 在**项目技能**中，经白名单过滤，不在用户技能目录。

---

## 开发顺序（历史 → 当前）

| 阶段 | 内容 | 状态 |
|------|------|------|
| 0 打地基 | 0000 原则、audit-all、排水试点 | ✅ |
| 1 三家整改 | 给排水/管道/工艺 V1.2 + E2E 基线 | ✅ |
| 2 自动化 | pre-commit audit、批量迁移脚本深化 | ✅ |
| 3 新店 | 仪控、电气等 11 个专业 | 仪控 ✅ 全量；电气等 pending |

---

## 相关文档

| 文档 | 用途 |
|------|------|
| `0000` 建设原则 | 写 Skill 前 |
| `0001` 建设 Plan | 排期、分工、E2E 说明 |
| `1010` 管道建设方案 | 新专业方案样板 |
| `1012` 给排水迁移清单 | 逐 Skill 勾选 |
| `1013` audit 规格 | 审计项说明 |
| `.cursor/skills/vdi-skill-governance/` | Agent 侧治理 Skill |

---

**维护**：平台组 · 最后更新 2026-06-13（阶段 1 完成）
