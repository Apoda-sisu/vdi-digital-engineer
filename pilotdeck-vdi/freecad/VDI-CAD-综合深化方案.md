# VDI 自动绘图综合深化方案

**版本**：V1.3  
**日期**：2026-06-11  
**范围**：`pilotdeck-vdi/freecad` · `pilotdeck-vdi/mcp/vdi-cad` · 工厂对象模型（POM）  
**试点项目**：MEOH-100（甲醇装置 48 设备 / 32 管线 / 12 控制回路）

> **V1.1 增补**：明确施工交付核心不是「更漂亮的二三维图」，而是 **带工厂对象属性、可编辑、可回写** 的数字工厂模型；二三维仅为同一对象集的不同视图（View）。

> **V1.2 增补（2026-06-12）**：CP-1 preview PFD（A1 图幅）可读出图已打通；增补 **Phase 8（FreeCAD TechDraw 点选查参）** 与 **Phase 9（PilotDeck Web 图面点选）** 实施方案（§7）；更新 M0 完成度与 §9.2 验收项。

> **V1.3 增补（2026-06-11）**：基于国内外智能绘图调研（§1.4），明确 **「数据先行、视图衍生、标准交换、Agent 编排」** 为最优路线；新增 Phase 10–12 升级方案（§6.10–6.12）与 GB/T 51296 / DEXPI 2.0 对齐路径（§8.6）。

---

## 一、执行摘要

### 1.1 现状判断

VDI 自动绘图已完成 **「设计数据 → 几何草图」** 的单向链路验证。对 **高端施工交付** 而言，这远远不够：

| 交付层级 | 行业要求 | 当前 VDI CAD | 差距 |
|---------|---------|-------------|------|
| **L1 几何视图** | PFD/P&ID/layout/3D 图面 | Part 线框 + 可选 TechDraw | 符号/布局/出图规范不足 |
| **L2 对象属性** | 位号、类、设计/操作条件、材质、规格 | PlantModel + **VDI_* CustomProperty 已绑定**（preview 约 34 对象）；**TechDraw 点选未通** | **交互层缺口** |
| **L3 对象关联** | 设备–管嘴–管段–仪表–回路拓扑 | PlantModel relationships + lines；P&ID 语义 Phase 3 | 部分完成 |
| **L4 可编辑回写** | CAD 改属性/拓扑 → 项目模型同步 | `fresh_document` + merge；**extract/apply_delta RPC 已有** | **GUI/点选未接** |
| **L5 交换与协同** | DEXPI / ISO 15926 / 业主数据标准 | 规划中有，未实现 | 未启动 |

**结论**：继续只堆几何渲染，无法进入施工交付；必须先建立 **工厂对象模型（Plant Object Model, POM）**，再让二三维成为 POM 的 **投影视图**。

| 维度 | 已完成 | 未完成 |
|------|--------|--------|
| 数据契约 | PlantModel v1 + CadCommand v1.1 | CFIHOS 键名全量映射 |
| 对象属性 | `VDI_ObjectId/Tag/Class/Attributes` 写入几何 | **TechDraw 图面点选 → 属性面板** |
| 集成 | MCP generate/execute；extract/apply_delta RPC | `get_object` 只读 API |
| 渲染 | PFD preview（12 台 / A1 / ISO 图框） | 48 台分单元多页；P&ID preview |
| 编辑 | 树/模型空间可选中查 VDI 属性（JSON） | 格式化 TaskPanel；Web 表单 |

### 1.2 核心结论

1. **范式转变**：从 `CadCommand → 画线` 升级为 **`PlantModel → 实例化对象 → 多视图渲染 → 编辑回写`**。
2. **二三维等价**：同一 `object_id` 在 PFD 符号、P&ID 气泡、layout 轮廓、3D 实体上是 **同一工厂对象** 的不同表现；改属性一处，各视图可再生成或增量更新。
3. **维护目标不变**：运行时以 `vdi_cad_addon` + `vdi-cad` MCP 为准；`cad-intelligence` 符号库迁移为 **对象类的视觉模板**，而非独立几何源。
4. **深化顺序调整**：**POM 基础（Phase P）优先于符号美化（Phase 1）**；无对象绑定的图形深化投入产出比低。

### 1.3 目标定位（12 个月）

| 里程碑 | 时间 | 交付物质量 |
|--------|------|-----------|
| **M0 对象模型** | Q2 2026 | PlantModel 持久化；FreeCAD 对象带 VDI 属性；单对象可编辑回写 |
| **M0.5 图面点选（FC）** | Q2 2026 | TechDraw 页点击符号 → 位号/设计参数只读展示 |
| **M0.6 图面点选（Web）** | Q3 2026 | PilotDeck Web 点击 PFD/P&ID → datasheet + 标准引用 |
| M1 符号统一 | Q2–Q3 2026 | 符号按 **object.class** 渲染，非 tag 猜测 |
| M2 布局可读 | Q3 2026 | 视图布局存 **view 层**，不污染对象属性 |
| M3 P&ID 语义 | Q3–Q4 2026 | 仪表/阀/管段均为 **独立对象实例** |
| M4 正式出图 | Q4 2026 | PDF/DXF + **对象清单导出**（含属性） |
| M5 多维 + 交换 | 2027 Q1 | 3D/layout；**DEXPI 2.0 子集导出** |
| **M6 标准交付** | 2027 Q2 | GB/T 51296 类库映射；数字化移交包 |
| **M7 智能闭环** | 2027 H2 | Agent 校验 + 仿真/规则闭环；可选逆向识图 |

### 1.4 智能绘图行业方向（2026 调研）

> 调研范围：国际 DEXPI / AVEVA / Hexagon / Bentley / 学术 Agent 路线；国内 GB/T 51296、中望 Plant、Bentley×创新奇智 iPID、迈烁 NeuroBox D、中石化数字化交付平台。结论用于校正 VDI 投入优先级，**不**改变「PlantModel 真源」基本判断。

#### 1.4.1 国际共识：从「文档中心」到「对象中心」

| 方向 | 代表 | 核心做法 | 对 VDI 启示 |
|------|------|---------|------------|
| **数据中心工程** | AVEVA Unified Engineering、Hexagon Smart P&ID | 图是数据库的 **视图/报表**；1D/2D/3D 同源；改数据驱动全视图更新 | ✅ VDI Phase P 路线正确；须加速 **停止几何真源化** |
| **开放交换标准** | **DEXPI 2.0**（2025-10 发布） | P&ID + PFD/BFD 统一信息模型；**DEXPI XML** 序列化；与 ISO 15926 / CFIHOS 对齐；PIDMIC 全生命周期最佳实践 | Phase 6 目标应从「子集导出」升级为 **DEXPI 2.0 XML 读写** |
| **智能图 = 可查询模型** | Konnect xD Smart P&ID | DEXPI XML 摄入 + SVG 渲染；跨页管线追踪；MoC / testpack | Phase 9 Web viewer 应对标 **DEXPI+manifest 双索引** |
| **逆向数字化** | SmartPFID、Digitize-PID | 扫描/PDF → 结构化 P&ID（补 legacy 缺口） | **独立产品线**；非 VDI 主路径，可作 Phase 12 可选 |
| **Agent 正向生成** | AutoChemSchematic、ACPID Copilot | NL/知识图谱 → PFD/P&ID + **仿真器闭环**验证 | 适合 VDI **Skill→PlantModel**；不宜裸 LLM→几何 |
| **P&ID→3D** | NeuroBox D、DrawingDiff | 视觉识图 + 企业零件库 + **原生 CAD** 装配 | 高难度；VDI 3D 应走 **Nozzle/PipeRun 对象** 而非图像转换 |

**国际最优方向一句话**：先建立 **可交换的对象模型（DEXPI/CFIHOS）**，再让 AI 做 **编排、校验、补全、逆向识图**——而不是让 AI 直接「画线」替代数据库。

#### 1.4.2 国内方向：数字化交付 + 国产平台 + 大模型识图

| 方向 | 代表 | 核心做法 | 对 VDI 启示 |
|------|------|---------|------------|
| **国标交付** | **GB/T 51296-2018** | 类库、工厂对象、PBS、智能 P&ID 与 3D 关联；设计/采购/施工全阶段属性 | PlantModel 须显式映射 **附录 B/C 类库**；交付物含对象清单 |
| **国产二三维一体** | **中望 Plant 2026** | 统一数据库；P&ID↔3D 双向联动；DWG 智能提取；自动材料表/轴测图 | 功能对标目标；VDI 短期用 FreeCAD+PlantModel **模拟其数据层**，不追 GUI  parity |
| **大模型识图** | **Bentley iPID**（×创新奇智） | 多模态大模型：PDF/图片 → **可交互智能 P&ID**；对接 OpenPlant | 国内业主旧改场景强；VDI 可 MCP 插件化对接，或 Phase 12 自研轻量入口 |
| **AI 云设计** | **NeuroBox D**（迈烁集芯） | P&ID 视觉识别 → SolidWorks 原生装配；企业零件库 | 偏设备级/半导体；与 VDI 工艺装置级 POM 互补 |
| **业主平台** | 中石化数字化交付及应用平台（2026） | 设计数据归集 → 数字工厂可视化运营 | VDI 产出须能 **汇入** 类库+PBS+智能 P&ID 包，而非仅 FCStd |

**国内最优方向一句话**：满足 **GB/T 51296 工厂对象交付**，同时用 Agent 把 **工艺 Skill 输出** 结构化为类库实例——国产 CAD 是载体选项之一，**不是** VDI 必须先绑定的内核。

#### 1.4.3 AI 在绘图中的「有效区」与「 hype 区」（2026）

| 层级 | 成熟度 | 典型能力 | VDI 是否投入 |
|------|--------|---------|-------------|
| **L0 几何美化** | 高 | AutoCAD Smart Blocks、标注排版 | 低优先级（Phase 2 布局算法即可） |
| **L1 数据层 AI** | 中高 | Markup 回写、NL 查图、属性补全、规则解释 | **高** — 与 vdi-knowledge / vdi-rules 一体 |
| **L2 结构化生成** | 中 | Skill/Agent → PlantModel；converter 校验 | **核心** — 已在走 |
| **L3 物理/仿真闭环** | 中（研究） | DWSIM-in-the-loop PFD 验证 | Phase 11 可选，对接工艺仿真 Skill |
| **L4 端到端 NL→施工图** | 低（生产） | 纯 LLM 出 P&ID 可施工详图 | **不做主路径**；仅作 copilot 草稿 |
| **L5 逆向 PDF→模型** | 中（场景化） | iPID、SmartPFID | Phase 12 可选模块 |

> 参考：2026 工程软件 AI 采购指南普遍强调 **「先数据层、后 Agent 层」**——与 VDI 深集成架构一致。

#### 1.4.4 与 VDI 当前方案的对照

| 行业最优实践 | VDI V1.2 状态 | 差距等级 |
|-------------|--------------|---------|
| 对象模型为真源 | PlantModel v1 + VDI_* 绑定 | 🟢 方向正确 |
| 图面可点选查参 | 数据有、交互无（Phase 8–9） | 🟡 3–8 周可补 |
| DEXPI 2.0 交换 | 规划 Phase 6，未实现 | 🟠 需提前 |
| GB/T 51296 类库 | 未 formal 映射 | 🟠 交付必需 |
| 1D/2D/3D 同源 | 2D 为主，3D 未通 | 🟠 Phase 5 |
| Agent 生成 + 规则闸门 | Skill + vdi-rules 已有 | 🟢 差异化优势 |
| 逆向识图 | 无 | ⚪ 可选，非阻塞 |
| 企业级 CAD 内核 | FreeCAD 开源栈 | 🟡 可接受试点；长期评估中望/SP 导出链 |

### 1.5 V1.3 升级战略判断

基于 §1.4，VDI 智能绘图 **不应** 升级为「更强的 AutoCAD 替代品」或「纯 AIGC 画图工具」，而应升级为：

```
工艺/管道 Skill ──► PlantModel（类库实例 + 关系）
                         │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
   多视图渲染        规则/知识 Agent      标准交换
   PFD/P&ID/3D      vdi-rules/knowledge  DEXPI 2.0 / 51296
         │                │                │
         └────────────────┴────────────────┘
                         ▼
              可点选、可审计、可移交的数字工厂片段
```

**四条战略原则（V1.3 起强制执行）**：

1. **数据先行**：任何新功能必须先问「是否写入/读取 PlantModel」；禁止新增仅存在于 FCStd 内的业务属性。
2. **视图可弃**：FCStd/PDF/SVG 均可再生；`plant/model.json` + `revision` 不可丢。
3. **标准出口**：对外交付默认 **DEXPI 2.0 XML + 51296 对象清单**；FCStd 为内部编辑格式。
4. **AI 在链路上**：AI 负责 DisciplineOutput 解析、布局建议、规范引用、逆向识图——**不**负责未经校验的几何真值。

**与 V1.2 路线图的关系**：Phase P–9 **不变**；V1.3 在 Phase 6 之后插入 **Phase 10–12**，并抬高 Phase 6 验收标准（DEXPI 2.0）。

---

## 二、系统现状深度分析

### 2.1 架构总览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PilotDeck VDI（工艺组试点）                        │
├─────────────────────────────────────────────────────────────────────────┤
│  PR-D04 PFD Skill ──┐                                                    │
│  PR-S01 P&ID Skill ─┼──► DisciplineOutput                                │
│  PR-S05 控制哲学 ───┘         │                                          │
│                               ▼                                          │
│              pilotdeck-vdi/mcp/vdi-cad/converter.mjs                     │
│              DisciplineOutput → CadCommand v1                            │
│                               │                                          │
│              pilotdeck-vdi/mcp/vdi-cad/server.mjs                        │
│              vdi_cad_generate | execute | export | screenshot              │
│                               │ XML-RPC :9876                            │
│                               ▼                                          │
│              pilotdeck-vdi/freecad/vdi_cad_addon/                          │
│              rpc_server.py → pipeline.py → pfd.py | pid.py               │
│                               │                                          │
│                               ▼                                          │
│              FCStd / DXF / PDF / STEP → cad-output/                       │
│              drawing.generated → events/inbox/                           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│              cad-intelligence（已弃用，资产待迁移）                        │
├─────────────────────────────────────────────────────────────────────────┤
│  scheme-v1 → DrawingPipeline → drawing2d | drawing_pid | layout |       │
│              isometric | equipment3d                                      │
│  symbols/ (47 JSON) · constraint_validator · knowledge_graph             │
│  无生产 RPC/MCP · VDI 桥接为桩                                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 双栈能力对照

| 能力 | cad-intelligence | vdi_cad_addon（维护目标） | 差距说明 |
|------|------------------|---------------------------|----------|
| **输入契约** | scheme-v1 | CadCommand v1 | 字段名不同，需统一映射层 |
| **PFD** | JSON 符号 + TechDraw 默认开 | 7 类硬编码符号，TechDraw 默认关 | 视觉与出图规范 |
| **P&ID** | inline 阀 + 三表 Spreadsheet | 仪表气泡 + PSV + 文字管道表 | 表格式与管阀语义 |
| **layout** | 轮廓 + 尺寸 + 轴网 | ❌ 未实现（layout.py 是仪表布局） | 命名混淆 |
| **isometric** | 简化 2D 投影 | ❌ 未实现 | schema 已预留 |
| **3D** | 8 类参数化 + nozzle 对接 | ❌ 未实现 | PLANT-3D-PILOT 依赖 |
| **符号库** | 47 JSON（GB 参数化 geometry + connections） | symbols.py ~230 行手绘 | **50x 规模差** |
| **连接路由** | 设备中心 → 正交折线 | **边缘端口** connection_ports() | vdi 侧更合理，但未用 JSON connections |
| **仪表布局** | 简单圆 + 标签 | InstrumentPlacer 防碰撞 | **vdi 侧更优** |
| **约束验证** | ConstraintValidator（pytest 覆盖） | 无 | 需接入 vdi-rules |
| **生产集成** | 无 RPC | RPC + MCP + Docker 挂载 | **vdi 侧更优** |
| **测试** | pytest 56+ 项 + verify_r1 | 2 项离线 + 可选 E2E | 严重不足 |

### 2.3 CadCommand v1：契约 vs 渲染

Schema 声明（`mcp/vdi-cad/schemas/cad-command-v1.schema.json`）已覆盖完整工程语义；FreeCAD 渲染器仅消费子集：

| Schema 字段 | converter 填充 | renderer 使用 | 缺口 |
|-------------|---------------|---------------|------|
| `drawing_type: pfd/pid` | ✅ | ✅ | — |
| `drawing_type: layout/isometric/3d` | ❌ | ❌ fallback PFD | 全链路缺失 |
| `equipment[].tag/type` | ✅ | ✅ | — |
| `equipment[].position` | ✅（拓扑布局） | ⚠️ 被 `_auto_layout` 覆盖 | **双端重复布局** |
| `equipment[].parameters` | 恒 `{}` | ❌ | 设计条件未上图 |
| `lines[].dn/fluid/phase/design_P/T/material/insulation` | ✅ | ❌ 仅画线 | 管道表语义未贴线 |
| `instruments[].on_line/loop/range/signal` | 部分 | ❌ 仅画圆 | P&ID 控制语义 |
| `streams[].T_C/P_MPa/phase` | 部分 | ❌ 仅 stream_no+flow | 物流标注不足 |
| `tables.pipe_list` | ✅ | ⚠️ 前 12 行文字 | 非标准表格 |
| `tables.stream_list/equipment_list` | 部分 | ❌ | 未渲染 |
| `tables.cause_effect` | ✅ | ⚠️ 简化菱形 | 无标准联锁符号 |
| `tables.safety_valves` | converter 写入 | ✅ PSV 气泡 | schema 未正式定义 |
| `citations[]` | ✅ | ❌ | 规范引用未上图 |
| `title_block` | ✅ | ⚠️ 需 `options.create_sheet=true` | CP 脚本显式关闭 |
| `options.create_sheet` | CP 脚本使用 | ✅ | **未写入 schema** |

### 2.4 converter.mjs 已知问题

| 问题 | 影响 | 修复优先级 |
|------|------|-----------|
| 无 CadCommand JSON Schema 校验 | 脏数据直达 FreeCAD | P1 |
| `K→compressor` vs symbols `K→vessel` | 压缩机符号错误 | P1 |
| converter 与 FreeCAD 双端布局 | 位置不一致 | P1 |
| `equipment.parameters` 丢弃 | 无法驱动符号变体 | P2 |
| 无 layout/isometric/3d 映射 | 多维出图阻塞 | P3 |
| `tables.safety_valves` 不在 schema | 契约漂移 | P2 |

### 2.5 试点数据与工作区

| 资源 | 路径 | 状态 |
|------|------|------|
| 项目注册 | `workspaces/.vdi-project-registry.json` | ✅ MEOH-100 / PLANT-3D-PILOT |
| 甲醇 MUST 数据 | `workspaces/工艺组/pilot/meoh-100/test-inputs/pid-01-must-data.json` | ⚠️ **未入库** |
| 内置 fixture | `converter.mjs` → `buildMethanolFixture()` | ✅ 48eq/32line/12loop |
| Golden 输出 | `cad-intelligence/output/verify_2d_pfd.FCStd` 等 | ✅ 可作对标基准 |
| CP 脚本 | `run-pfd-cp1.mjs` / `run-pid-cp2.mjs` / `run-pid-cp3-cp4.mjs` | 需 FreeCAD + 工作区 |

---

## 三、工厂对象模型（POM）— 施工交付核心

### 3.1 为什么「仅有二三维图形」不够

高端 EPC / 数字化交付（Digital Delivery）的验收对象不是 DWG/PDF，而是 **可检索、可关联、可修订的工厂对象**：

| 场景 | 仅有几何 | 有 POM |
|------|---------|--------|
| 采购提资 | 从图面人工读 DN/材质 | 按 `PipeRun` 对象导出 BOM |
| 施工分包 | PDF 标注易漏改 | 改 `Valve.setpoint` 自动触发校验与事件 |
| 竣工资料 | 图模不一致 | 同一 `object_id` 驱动 2D 符号与 3D 模型 |
| 业主移交 | 无法进 OSIsoft/AVEVA | DEXPI / CFIHOS 从 POM 导出 |
| 设计变更 | 重跑 JSON 全覆盖 | `apply_delta` 增量更新 + 修订号 |

当前 `vdi_cad_addon` 每次 `execute_command` **关闭并新建文档**，对象仅为 `Part::Feature`，**Label=位号、无工程属性、无全局 ID**——这是与高端交付的 **根本性差距**，优先级高于符号库扩展。

### 3.2 概念模型

```
PlantModel（项目级真源，持久化 JSON/SQLite）
├── PlantObject[]                    # 工厂对象实例
│   ├── object_id      (UUID, 全局唯一)
│   ├── class          (Equipment | PipeRun | Instrument | Valve | Nozzle | …)
│   ├── tag              (P-401, 100-P-101-12"-C1A, TIC-101)
│   ├── attributes       (设计/操作 T·P, DN, 材质, 规格, 回路号…)
│   ├── relationships[]  (connected_to, mounted_on, protects, loop_member)
│   └── revision         (与 title_block.revision 联动)
│
├── ViewDefinition[]                 # 视图定义（非对象本身）
│   ├── view_id          (pfd-100-001 | pid-100-001 | layout-100 | model-3d)
│   ├── view_type        (pfd | pid | layout | isometric | 3d)
│   ├── object_placements { object_id → {x,y,z, rotation, scale, layer} }
│   └── sheet / title_block
│
└── ChangeLog[]                      # 编辑回写审计
```

**原则**：

- **PlantModel 是唯一真源**；CadCommand 降为「某视图的渲染快照指令」。
- **属性在对象上**，不在图元上；图元是对象的 **代理（Proxy）**。
- **编辑默认改对象**；纯几何拖动改 `ViewDefinition.object_placements`，不改设计条件。

### 3.3 对象类体系（初版）

| class | tag 示例 | 核心 attributes | 2D 表现 | 3D 表现 |
|-------|---------|-----------------|---------|---------|
| `Equipment` | R-101, P-401 | type, design_T/P, oper_T/P, symbol_id | GB 符号 | 参数化实体 |
| `Nozzle` | N1 on R-101 | nominal_dn, rating, direction | 端口连接点 | 管嘴几何 |
| `PipeRun` | 100-P-101-12"-C1A | dn, fluid, phase, material, insulation, design/oper T/P | 正交管段+标注 | 管道实体 |
| `Valve` | XV-101 | valve_type, fail_position, dn | inline 符号 | 阀体 |
| `Instrument` | TIC-101 | inst_type, range, signal, loop_id, location | ISA 气泡 | — |
| `SafetyValve` | PSV-101 | setpoint, capacity, protected_equipment | PSV 气泡 | — |
| `ControlLoop` | LC-101 | strategy, interlocks | 信号线拓扑 | — |
| `Stream` | S-101 | flow, composition, T, P, phase | 物流标注 | — |

类定义与 `equipment_draft_datasheets`、`line_list`、DEXPI EquipmentClass / PipingNetworkSegment 对齐，见 §6.4。

### 3.4 FreeCAD 对象绑定方案

每个工厂对象对应一个 **可编辑 FreeCAD 文档对象**（推荐 `App::FeaturePython` 或 `Part::Feature` + Custom Property 组）：

```python
# 每个代理对象必须携带的最小属性集（VDI 命名空间）
VDI_ObjectId      # UUID，与 PlantModel 一致
VDI_Class         # Equipment | PipeRun | ...
VDI_Tag           # 人类可读位号
VDI_Revision      # 对象级修订（可选）
VDI_Attributes    # JSON 字符串或分组 Property（design_P_MPaG, DN, …）
VDI_ViewId        # 所属视图（多视图时可多个代理指向同一 object_id）
```

**创建流程（目标态）**：

1. MCP 加载/合并 `PlantModel`（非裸 CadCommand）
2. `instantiate_objects(doc, plant_model)` → 带 VDI 属性的 FreeCAD 对象
3. `render_view(doc, view_id)` → 按 ViewDefinition 放置几何/符号
4. 用户 GUI 编辑属性 → `onPropertyChanged` → 队列 `PlantDelta`
5. RPC `apply_delta` / `extract_model` → 回写 workspace + 发 `plant.object.changed` 事件

**禁止**：无 `object_id` 的「匿名线」作为交付物；辅助几何（标注、表格框）可匿名。

### 3.5 可编辑性与同步策略

| 编辑类型 | 发生位置 | 同步目标 | 触发 |
|---------|---------|---------|------|
| 设计属性 | FreeCAD 属性面板 / MCP | `PlantObject.attributes` | `plant.object.changed` |
| 位号变更 | 同上 | `tag` + 全视图代理 | 校验位号唯一后生效 |
| 拓扑连接 | 改 PipeRun from/to | `relationships` | `plant.topology.changed` |
| 视图位置 | 拖动符号 | `ViewDefinition.placements` | 低优先级，不触发工艺校验 |
| 批量生成 | Skill / converter | 整图 `PlantModel` merge | `drawing.generated` |

**增量 vs 全量**：

- 开发期：先实现 **全量 merge**（按 object_id upsert），避免每次 destroy document
- 生产期：`apply_delta` 支持 `{ object_id, op: update|delete, attributes, relationships }`

**RPC 增补（v1.1）**：

| 方法 | 作用 |
|------|------|
| `load_plant_model(json)` | 载入/合并 POM，不销毁无关对象 |
| `extract_plant_model()` | 从当前文档导出 POM |
| `apply_delta(json)` | 增量更新 |
| `render_view(view_id)` | 仅重绘指定视图 |
| `get_object(object_id)` | 查询属性（供 MCP/Skill 只读） |

现有 `execute(CadCommand)` 保留为 **兼容入口**，内部转为 `load + render_view`。

### 3.6 与行业标准对齐

| 标准 | 用途 | V1.1 目标 |
|------|------|----------|
| **DEXPI** | P&ID 语义交换（XML） | Phase 6：Equipment + Pipe + Instrument 子集导出 |
| **ISO 15926** | 生命周期工厂数据 | 长期：object.class 映射到 ISO 模板 |
| **CFIHOS** | 业主移交属性集 | attributes 键名预留 CFIHOS 映射表 |
| **GB/T 2625 / ISA 5.1** | 2D 符号 | symbol_id 挂在 Equipment/Instrument 上 |

### 3.7 当前代码差距（POM 专项）

| 检查项 | cad-intelligence | vdi_cad_addon |
|--------|------------------|---------------|
| scheme/CadCommand 含 parameters | ✅ schema 有 | converter 丢弃 `{}` |
| FreeCAD CustomProperty | ❌ 仅 Label | ❌ 仅 Label |
| 全局 object_id | ❌ 用 label 作 key | ❌ 用 tag 作 Part 名 |
| 文档增量更新 | ❌ 新建 doc | ❌ `closeDocument` + new |
| 编辑回写 RPC | ❌ | ❌ |
| 3D nozzle 作为对象 | ⚠️ dict 非 PlantObject | ❌ |

---

## 四、与真实工程图的差距（分层模型）

真实 PFD/P&ID 是 **七层语义叠加**；当前实现约覆盖第 1–2 层。

```
Layer 7  出图规范    线型/线宽/图层/比例/图框/修订栏     ░░░░░░░░░░  10%
Layer 6  校验闭环    位号唯一/拓扑闭合/规范合规           ░░░░░░░░░░  10%
Layer 5  表格图例    物流表/设备表/图例/索引              ███░░░░░░░  30%
Layer 4  控制语义    回路/信号线/DCS分界/联锁             ██░░░░░░░░  20%
Layer 3  管段语义    管径/材质/等级/保温/流向/管阀        █░░░░░░░░░  10%
Layer 2  拓扑布局    分层/避障/正交路由/回流可读          ██░░░░░░░░  20%
Layer 1  符号几何    GB/ISA 标准符号 + 连接点             ██░░░░░░░░  20%
         ─────────────────────────────────────────────────────────
         当前综合完成度（相对行业交付物）                  ≈ 15–20%
```

### 4.1 分图层差距详表

| 图层 | 行业标准 | 当前 vdi_cad_addon | 行业参考（AVEVA/SmartPlant） |
|------|---------|-------------------|------------------------------|
| **符号** | GB/T 2625、HG/T 20559、ISA 5.1 | 7 类 Part 线框 | 200–500+ 符号块 |
| **连接点** | 按 nozzle 方向对接 | 包围盒边缘估算（较 cad-intelligence 中心对接更优） | 符号块内定义 port |
| **布局** | 物料流分层 Sugiyama | 8 列网格 + 简单拓扑序 | 遗传算法 + 人工规则 |
| **管道路由** | 正交避障、跨层 | 中点三折线、无避障 | 通道分配 + A* |
| **管段标注** | DN/流向/管段号贴线 | 物流号中点文字 | 自动标注引擎 |
| **inline 元件** | 阀/盲板/大小头/三通 | ❌ | 管线对象模型 |
| **仪表** | ISA 气泡 + 信号线 | 圆 + 双行字，无信号线 | 完整回路图 |
| **表格** | TechDraw 表格 / 标准 grid | Draft 文字块 | 数据库驱动 |
| **图框** | GB A3 + 会签栏 | 有模板但默认跳过 | 企业模板库 |
| **校验** | 发布前规则引擎 | 无 | 数百条规则 |

### 4.2 cad-intelligence 可迁移 vs 需重写

| 资产 | 路径 | 迁移方式 | 备注 |
|------|------|---------|------|
| 符号 JSON 库 | `cad-intelligence/symbols/` | **直接复用** | 47 个，含 connections |
| 符号渲染 | `core/drawing2d.build_symbol_2d` | **移植为 2D 线框** | 读 geometry.components |
| 符号管理 | `core/symbol_manager.py` | **抽为共享包** | 或 symlink 到 vdi |
| 约束验证 | `core/constraint_validator.py` | **CadCommand 适配** | 改输入模型 |
| 知识图谱 | `core/knowledge/` | 保留，经 vdi-knowledge MCP | vdi_bridge 现为桩 |
| PFD/PID 引擎 | `drawing2d.py` / `drawing_pid.py` | **选择性合并** | inline 阀、Spreadsheet 表 |
| 3D 引擎 | `equipment3d.py` | **Phase 5 迁移** | nozzle 对接可复用 |
| layout/isometric | `drawing_layout.py` 等 | **Phase 5 迁移** | 独立于仪表 layout.py |
| scheme-v1 | `schemas/scheme-v1.schema.json` | **不维护** | 仅作字段映射参考 |

**关键发现**：符号 JSON 已定义 `connections`（如离心泵 suction/discharge），但 cad-intelligence 2D 引擎**也未使用**——两端都是从中心/边缘估算。深化时应在共享层统一实现 **port-aware routing**。

---

## 五、目标架构

### 5.1 分层职责（目标态）

```
┌──────────────────────────────────────────────────────────────┐
│  L5  VDI Skills + 人类 CP 闸门                                 │
│      DisciplineOutput → 写入 PlantModel（非直接画图）           │
└────────────────────────────┬─────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────┐
│  L4  PlantModel 持久层（项目真源）                              │
│      workspaces/.../.pilotdeck/projects/{id}/plant/model.json │
│      object_id · class · tag · attributes · relationships      │
└────────────────────────────┬─────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────┐
│  L3  vdi-cad MCP                                               │
│      plant_merge · render_view · extract_model · apply_delta   │
│      converter: DisciplineOutput → PlantModel（非裸 CadCommand）│
└────────────────────────────┬─────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────┐
│  L2  vdi-cad-core（Python）                                    │
│      plant_schema · object_factory · view_renderer            │
│      symbol_manager · layout_engine · constraint_validator    │
└────────────────────────────┬─────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────┐
│  L1  vdi_cad_addon（FreeCAD）                                  │
│      FeaturePython 代理 · VDI CustomProperty · TechDraw · RPC  │
└──────────────────────────────────────────────────────────────┘
         │ 2D Views                    │ 3D View
         ▼                             ▼
    PFD / P&ID / layout           参数化设备 + 管道
    （同一 object_id 集合）        （同一 object_id 集合）
```

**设计原则**：

- **PlantModel 是唯一真源**；CadCommand 为视图渲染的衍生/快照格式。
- **先实例化对象、再渲染视图**；禁止「只有 Shape 没有 VDI_ObjectId」的交付物。
- **编辑回写 PlantModel**，再选择性 `render_view`；避免 destroy-recreate 文档。
- **cad-intelligence 符号库** 为 Equipment/Instrument 的 **visual_template**，不是独立数据源。

### 5.2 模块命名澄清

| 现有名称 | 实际含义 | 目标命名 |
|---------|---------|---------|
| `engine/layout.py` | 仪表气泡布局 | `instrument_layout.py` |
| `drawing_layout.py`（ci） | 设备布置平面图 | `render_layout.py` |
| `converter autoLayoutEquipment` | 设备网格布局 | 迁入 `layout_engine.py` |

---

## 六、分阶段实施路线图

> **顺序调整（V1.1）**：Phase P（POM）与 Phase 0 并行启动；**无对象绑定的 Phase 1–3 图形工作降权**，与 Phase P 交错交付。

### Phase P：工厂对象模型基础（4–5 周）→ M0 【最高优先级】

**目标**：二三维图元可追溯到带属性的工厂对象；支持只读编辑与回写。

| 任务 | 技术方案 | 验收标准 |
|------|---------|---------|
| PlantModel v1 schema | `schemas/plant-model-v1.schema.json` | Equipment/PipeRun/Instrument 三类 |
| 持久化路径 | `.pilotdeck/projects/MEOH-100/plant/model.json` | CP 脚本读写 |
| converter 升级 | DisciplineOutput → **PlantModel**（再 derive CadCommand） | 48 eq / 32 pipe / 12 inst 各有 object_id |
| object_factory | `FeaturePython` + VDI CustomProperty | 选中 P-401 可见 design_P、DN 等 |
| 停止 destroy-recreate | merge by object_id | 二次 execute 位号不丢、属性不丢 |
| RPC `extract_plant_model` | 导出 JSON | 与输入 fixture 属性一致 |
| RPC `apply_delta` | 改 design_P → 回写文件 | 触发校验事件 |
| 事件 | `plant.object.changed` | 写入 events/inbox |
| 单元测试 | schema + merge + delta | 不需 FreeCAD |

**不做**：DEXPI 导出、复杂 GUI 属性面板（可用 FreeCAD 原生 Property 视图）。

### Phase 0：基线与债务清理（2 周，与 Phase P 并行）

**目标**：消除迷茫感——可重复跑通、有明确对标物。

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 入库 MEOH-100 试点数据 | `workspaces/工艺组/pilot/meoh-100/test-inputs/pid-01-must-data.json` | CP 脚本 `existsSync` 通过 |
| 统一布局责任 | converter **或** renderer 单端算 position | 同一 fixture 两次出图设备坐标一致 |
| 修复 K→compressor 映射 | converter + symbols 对齐 | C-601 类设备有压缩机符号 |
| schema 补全 | `options`、`tables.safety_valves` | JSON Schema 与 runtime 一致 |
| Golden 基准建立 | `pilotdeck-vdi/freecad/golden/meoh-100/` | 存 PFD/PID FCStd + 截图 + 元数据 |
| CI 分层 | `npm run test:converter` + mock E2E 进 CI | PR 必过；FreeCAD E2E 可选 nightly |

### Phase 1：符号引擎统一（3–4 周）→ M1

**目标**：符号按 **PlantObject.class + symbol_id** 渲染，而非 tag 猜测。

**前置**：Phase P 对象绑定已完成。

| 任务 | 技术方案 | 验收标准 |
|------|---------|---------|
| 创建 `vdi-cad-core/symbols/` | symlink `cad-intelligence/symbols/` | SymbolManager 加载 47 符号 |
| 2D 线框渲染器 | `build_symbol_2d` → 绑定 `VDI_ObjectId` | 点击符号可见属性 |
| 替换 `symbols.py` 硬编码 | 从 `PlantObject.attributes.symbol_id` 取图 | 甲醇 48 设备零 generic |
| port-aware 连接 | PipeRun.relationships + Nozzle | 泵进出口方向正确 |
| 单元测试 | 每 symbol_id smoke test | pytest ≥ 47 |

### Phase 2：拓扑布局与管道路由（4 周）→ M2

**目标**：30+ 设备流程图可读。

| 任务 | 技术方案 | 验收标准 |
|------|---------|---------|
| 分层布局 Sugiyama | 基于 lines 建 DAG，按层分配 Y，层内按 X 排序 | 甲醇 fixture 主线左→右，回流不交叉主线 |
| 设备避障 bbox | content_bounds + padding | 符号不相交 |
| 管道路由升级 | channel routing / A* on grid | 管线不穿设备 bbox |
| 贴线标注 | line_no、DN、流向箭头 | 32 条管线均有 DN 标注 |
| 移除双端布局 | position 仅 converter 计算，renderer 尊重输入 | Phase 0 验收复测 |
| 布局单测 | 纯 Python，不需 FreeCAD | 拓扑序 + 无碰撞断言 |

### Phase 3：P&ID 语义补全（5–6 周）→ M3

**目标**：阀、仪表、管段均为 **独立 PlantObject**；控制回路可追踪。

| 任务 | 技术方案 | 验收标准 |
|------|---------|---------|
| Valve / Instrument 独立实例 | class=Valve/Instrument，非装饰圆 | 改 TIC-101.range 回写 POM |
| inline 阀门 | PipeRun.relationships 引用 Valve object_id | 至少 gate/ball/check |
| 信号线 | ControlLoop 对象 + view 层几何 | TIC-101 回路可追踪 |
| 标准表格 | 从 PlantModel 生成，非硬编码文字 | 管道表 32 行来自 PipeRun.attributes |
| PSV | class=SafetyValve | setpoint 可编辑回写 |

### Phase 4：正式出图与校验闭环（4 周）→ M4

**目标**：PDF/DXF + **对象清单（含属性）** 可进设计流转。

| 任务 | 技术方案 | 验收标准 |
|------|---------|---------|
| TechDraw 默认开启 | scale-to-fit A3 | CP 脚本 `create_sheet: true` |
| 对象清单导出 | `plant/model.json` + CSV/Excel | 48 设备设计条件齐全 |
| vdi-rules 集成 | 校验 **PlantModel**（非仅 DisciplineOutput） | 缺 design_P 拒绝发布 |
| PDF/DXF | TechDraw 优先 | 图层可辨 |
| Golden diff | 对象数 + **属性快照** | CI nightly |

### Phase 5：多维出图（6–8 周）→ M5

**目标**：支撑 PLANT-3D-PILOT 与施工图方向。

| drawing_type | 源引擎 | 迁移策略 |
|--------------|--------|---------|
| `layout` | `drawing_layout.py` | CadCommand 增 `footprint[]` / `elevation` |
| `isometric` | `drawing_isometric.py` | 标注为「简化单线」，非真 3D 轴测 |
| `3d` | `equipment3d.py` | 独立 RPC 模式或 STEP 导出 |

**converter 扩展**：DisciplineOutput 管道专业字段 → CadCommand 3D 段。

---

### Phase 5：多维视图 + 3D 对象（6–8 周）→ M5

**目标**：layout / isometric / 3D 为 **同一 PlantModel** 的附加 ViewDefinition。

| view_type | 对象要求 | 迁移策略 |
|-----------|---------|---------|
| `layout` | Equipment 增 footprint/elevation | ViewDefinition 存 2D 位置 |
| `isometric` | PipeRun 3D 路由投影 | 标注「简化单线」 |
| `3d` | Equipment 参数化 + Nozzle 对象 | `equipment3d.py` 读 PlantObject.attributes |

**关键**：3D 管道连接 **Nozzle.object_id**，非硬编码坐标 dict。

### Phase 6：交换与高端交付（4–6 周）

| 任务 | 验收标准 |
|------|---------|
| DEXPI 子集导出 | MEOH-100 P&ID → DEXPI XML 可被第三方工具打开 |
| CFIHOS 属性映射表 | 核心 Equipment/Pipe 属性键名对照 |
| 修订追溯 | PlantModel.revision + ChangeLog 与图框版次一致 |
| 可选：IFC / STEP 带属性 | 3D 交付包试点 |

### Phase 7：E2E 验收闭环与技能闸门（2–3 周）→ M6

**目标**：§9.2 验收清单可自动化；FreeCAD nightly E2E；Skill 文档与 CP 脚本对齐。

| 任务 | 验收标准 |
|------|---------|
| 离线验收闸门 | `npm run test:acceptance` 聚合 Phase P–6 检查项 |
| FreeCAD E2E | `npm run test:e2e`：PlantModel 写盘 → PFD/PID/多维 → extract → apply_delta → merge 重渲染 |
| CP 脚本对齐 | `run-pfd-cp1` 写入 `plant/model.json`；`run-acceptance.mjs` 编排全量回归 |
| Skill 更新 | `skills/vdi-process-cad-2d/SKILL.md` CP-0~CP-6 + 自动化矩阵 |
| Golden 扩展 | `manifest.json` 含 change_log / dexpi 计数 |

### Phase 8：FreeCAD TechDraw 点选查参（2–3 周）→ M0.5

**目标**：在 FreeCAD 内打开 `VDI_Sheet`，**点击图元即可看到** 设备/管段/仪表位号及设计参数（只读优先，可选编辑回写）。

**前置**：Phase P 对象绑定（preview FCStd 已含 `VDI_*` 属性）；A1 图框 + `VDI_View` 可正常显示。

| 任务 | 技术方案 | 验收标准 |
|------|---------|---------|
| 点选追溯 | TechDraw 选中 → `VDI_View.Source` 反查 `Part::Feature` | 点 R-101 符号，面板显示 `VDI_Tag=R-101` |
| 属性 TaskPanel | `gui/vdi_property_panel.py` 按 class 格式化字段 | 设备见 design/oper P/T；管段见 DN/流体 |
| 选择监听 | `Gui.Selection.addObserver` + TechDraw 页激活时启用 | 切换文档/页时自动注销 |
| 模型空间备选 | `options.pick_mode: tree \| model \| techdraw` | TechDraw 未命中时可树选/模型选 |
| RPC `get_object` | 只读查询 `object_id → PlantObject` | MCP/CLI 可调用，与 GUI 同源 |
| 只读默认 | 首版不强制 apply_delta | 改属性走 Phase P 已有 RPC |

**不做（Phase 8 范围外）**：Web 端 viewer；每设备独立 `DrawViewSymbol` 重构（留 Phase 1 优化）。

**工期**：2–3 周（可与 Phase 3 P&ID preview 并行）。

> 详设见 **§7.1 FreeCAD 方案**。

### Phase 9：PilotDeck Web 图面点选（4–6 周）→ M0.6

**目标**：浏览器打开 PFD/P&ID（SVG/PDF），**点击位号/符号热点** 展示 datasheet、计算书引用、标准条款；可选 Web 表单改属性 → `apply_delta` → 触发再出图。

**前置**：`plant/model.json` 稳定；`drawing-manifest.json` 生成器；PilotDeck 项目/workspace 路由已有。

| 任务 | 技术方案 | 验收标准 |
|------|---------|---------|
| 点选清单 | `drawing-manifest.json`：object_id、tag、bbox、view_id | 与 preview PFD 12 设备 bbox 一致 |
| SVG 热点层 | 出图时写 `data-vdi-id` 或独立 overlay SVG | 浏览器点 R-101 命中 |
| Web Viewer | React/Vue 组件 `DrawingViewer` | 侧栏显示属性 + citations |
| API | `GET /projects/:id/objects/:object_id` 或 MCP `get_object` | 与 PlantModel 真源一致 |
| 编辑（可选） | Web 表单 → `apply_delta` → `drawing.regenerate` 事件 | 改 design_P 后新 FCStd 可下载 |
| 权限 | 只读/编辑按 PilotDeck 角色 | 工艺工程师可改，其他只读 |

**不做（Phase 9 范围外）**：FreeCAD 内嵌 Web；实时协同编辑。

**工期**：4–6 周（Week 3 起可与 Phase 8 并行，依赖 PlantModel 而非 FreeCAD GUI）。

> 详设见 **§7.2 PilotDeck Web 方案**。

### Phase 10：标准交换与数字化移交（6–8 周）→ M6

**目标**：对外交付包满足 **GB/T 51296** 与 **DEXPI 2.0** 双出口；业主/第三方工具可导入对象与关联。

**前置**：Phase 6 基础、PlantModel 48+32+12 全量、Phase 9 manifest 稳定。

| 任务 | 技术方案 | 验收标准 |
|------|---------|---------|
| DEXPI 2.0 导出 | `dexpi_export.py`：PlantModel → DEXPI XML（Equipment/PipeRun/Instrument 子集） | Konnect xD 或 DEXPI 官方工具可打开 |
| DEXPI 2.0 导入（只读） | 解析第三方 P&ID XML → PlantObject 草稿 | 位号/tag 不丢；关系可浏览 |
| GB/T 51296 类库映射 | `schemas/gbt51296-class-map.json`：PlantObject.class → 附录 C 类 | 对象清单 CSV 含国标类码 |
| PBS 关联 | `plant/pbs.json` + 对象→文档关联 | 附录 A 结构可导出 |
| 移交包编排 | `digital-handover-pack.mjs`：model + dexpi + manifests + PDF/DXF | 单命令生成 `handover/` 目录 |
| CFIHOS 键名 | 核心属性 dual-key（VDI + CFIHOS） | 属性对照表文档化 |

**不做**：全量 CFIHOS RDL；SPF/SDx 原生写入。

> 详设见 **§8.6 标准映射**。

### Phase 11：Agent 智能闭环（8–10 周）→ M7（可选加速）

**目标**：从「Skill 出图」升级为 **「生成 → 校验 → 修正 → 再生成」** 闭环；减少人工审图往返。

| 任务 | 技术方案 | 验收标准 |
|------|---------|---------|
| 布局 Agent | orchestrator 调用 layout 建议 + vdi-rules 碰撞/间距 | 48 台 A1 自动分页方案可采纳 |
| 规范 Agent | 改属性前 `vdi_get_citation` 预检 | Web/FC 改 design_P 带条款引用 |
| 仿真钩子（可选） | DisciplineOutput ↔ 简化物料平衡校验 | 明显 mass imbalance 阻断发布 |
| 变更 Agent | `apply_delta` 后 diff 摘要 + 影响视图列表 | `plant.object.changed` 含 human-readable summary |
| Golden 对抗测试 | Agent 改图 vs 人工 baseline diff | 无 object_id 丢失 |

**边界**：仿真闭环为 **warn/block 闸门**，不替代工艺师签字。

### Phase 12：逆向识图与遗留资产（可选，6–8 周）

**目标**：旧项目 PDF/DWG P&ID → PlantModel 草稿，支撑改扩建与 **iPID 类场景**。

| 任务 | 技术方案 | 验收标准 |
|------|---------|---------|
| 入口 | MCP `vdi_cad_digitize_pid`：PDF/DWG/图片 | 返回 PlantModel draft + 置信度 |
| 引擎选型 | A) 对接 Bentley iPID API B) 开源 OCR+符号检测 C) 混合 | POC 选一种；不阻塞 Phase 10 |
| 人工审核 UI | Web 低置信度高亮 + 批量确认 | 审核后 merge 进正式 model.json |
| 与正向链关系 | draft 对象带 `source: digitize` 标记 | 不与 Skill 生成对象静默合并 |

**建议**：仅在业主旧改需求明确时启动；**不**与 Phase 8–10 抢资源。

#### V1.3 路线图总览（Phase P → 12）

```
Phase P ──► 0 ──► 1 ──► 2 ──► 3 ──► 4 ──► 5 ──► 6 ──► 7
   │                                                    │
   └────── 8 (FC点选) ── 9 (Web点选) ───────────────────┘
                              │
                              ▼
                    10 (51296+DEXPI2) ──► 11 (Agent闭环) ──► 12 (逆向,可选)
```

| 优先级 | Phase | 周期 | 里程碑 |
|--------|-------|------|--------|
| P0 | P, 8, 9 | 进行中 | M0 / M0.5 / M0.6 |
| P1 | 1–4 | Q3–Q4 2026 | M1–M4 可读可审可出图 |
| P1 | 10 | Q1 2027 | M6 数字化移交 |
| P2 | 5–7, 6 | Q4 2026–Q1 2027 | M5 + E2E |
| P3 | 11 | Q2 2027 | M7 Agent 闭环 |
| P4 | 12 | 按需 | 旧改识图 |

---

## 七、图面点选交互实施方案

> **原则**：PlantModel 为唯一真源；图面点选是 **视图层交互**，不复制属性到图元。FreeCAD 与 Web **双轨交付**，共享 `object_id` 与 `get_object` 契约。

### 7.0 现状与根因（2026-06-12）

| 现象 | 根因 |
|------|------|
| 树中有 `VDI_Sheet` / `VDI_Template` / `VDI_View`，但点图看不到参数 | `VDI_View` 是 TechDraw **投影视图**，选中的是视图图元，非带 `VDI_*` 的源对象 |
| 模型空间对象有 `VDI_Attributes`，但用户看不到 | `hide_model_space_geometry()` 出图后隐藏了 `Part::Feature` |
| `VDI_Template` Width=0 时无图框 | 自定义 SVG 未解析；已改内置 ISO A1 + 加载校验（V1.2 前序修复） |

**数据层已通**：preview FCStd 内约 34 个 Plant 代理 + 12 设备符号几何均带 `VDI_ObjectId`；`plant/model.json` 为真源。

### 7.1 FreeCAD：TechDraw 点选查参

#### 7.1.1 目标体验

1. 用户打开 `PFD-100-001-PREVIEW.FCStd`，进入 **TechDraw 页 `VDI_Sheet`**
2. 点击流程图上的 **R-101** 符号（或管段、仪表）
3. 右侧 **VDI 属性面板** 显示：
   - 位号、对象类、object_id
   - 设计/操作 P、T，材质，DN（按 class 切换字段模板）
   - 只读展示；「在 PlantModel 中打开」跳转 JSON 路径（可选）

#### 7.1.2 架构

```
┌─────────────────────────────────────────────────────────────┐
│  FreeCAD GUI（TechDraw 页 VDI_Sheet）                        │
│  用户点击 ──► SelectionObserver                              │
│                    │                                         │
│         ┌──────────┴──────────┐                              │
│         ▼                     ▼                              │
│  TechDraw 命中           树/模型空间命中                      │
│  VDI_View + 子元素       SYM_R_101 (Part::Feature)           │
│         │                     │                              │
│         └──────────┬──────────┘                              │
│                    ▼                                         │
│         resolve_source_object(selection)                     │
│                    │                                         │
│                    ▼                                         │
│         get_plant_object_props(obj)  ← object_factory.py     │
│                    │                                         │
│                    ▼                                         │
│         VDIPropertyPanel（Task Panel / Dock）                  │
└─────────────────────────────────────────────────────────────┘
                    │ 可选编辑
                    ▼
         RPC apply_delta → plant/model.json → plant.object.changed
```

#### 7.1.3 点选追溯策略（按优先级）

| 优先级 | 策略 | 说明 |
|--------|------|------|
| P0 | **TechDraw → Source 列表** | 选中 `VDI_View` 内图元时，用 `view.Source` 中 `Part::Feature` 列表 + 最近 bbox 命中 |
| P1 | **按位号标签反查** | 选中 `Draft` 文本（位号）→ 同 tag 的 `VDI_Tag` 对象 |
| P2 | **树同步选中** | 点选失败时，Observer 提示「请在组合视图选择 SYM_*」 |
| P3 | **DrawViewSymbol 拆分**（Phase 1+） | 每设备独立 TechDraw 视图，点选最可靠，成本较高 |

**关键 API（FreeCAD 1.x）**：

- `Gui.Selection.getSelectionEx()` — 含 `SubObjects` / `Object`
- `TechDrawGui` 页视图下选中项 `TypeId` 常为 `TechDraw::DrawViewPart`
- 对 `VDI_View`：`view.Source` 为绑定的模型对象列表；结合 `view.getBoundingBox()` 与 pick 坐标做 hit test（addon 自研 `engine/pick_resolver.py`）

#### 7.1.4 模块与文件

| 模块 | 路径 | 职责 |
|------|------|------|
| pick_resolver | `vdi_cad_addon/engine/pick_resolver.py` | selection → `App.DocumentObject` + object_id |
| selection_observer | `vdi_cad_addon/gui/selection_observer.py` | 注册/注销 Gui observer |
| property_panel | `vdi_cad_addon/gui/vdi_property_panel.py` | 按 Equipment/PipeRun/Instrument 模板展示 |
| field_templates | `vdi_cad_core/object_field_templates.json` | class → 显示字段列表（中英文标签） |
| InitGui 挂钩 | `InitGui.py` | 启动时 `register_vdi_selection()` |

**CadCommand / options 扩展**：

```json
{
  "options": {
    "hide_model_space": true,
    "pick_mode": "techdraw",
    "enable_vdi_property_panel": true
  }
}
```

- `hide_model_space: false` — 调试/树选模式，模型空间可点
- `pick_mode: "techdraw" | "model" | "tree"` — 默认 techdraw

#### 7.1.5 RPC 扩展

| 方法 | 签名 | 说明 |
|------|------|------|
| `get_object` | `(object_id: str) → PlantObject` | 只读；GUI 与 MCP 共用 |
| `resolve_pick` | `(doc_name, selection_json) → { object_id, tag, class }` | 自动化/测试用 |

MCP 工具名：`vdi_cad_get_object`（与 §10.1 表对齐）。

#### 7.1.6 分期交付（Phase 8 内部）

| 迭代 | 周期 | 交付 | 验收 |
|------|------|------|------|
| **8a** | 第 1 周 | 树/模型空间点选 + 原生 Property 验证 + 格式化 TaskPanel（只读） | 选 SYM_R-101 见 design_P_MPaG |
| **8b** | 第 2 周 | TechDraw 页点选追溯 P0 | 在 VDI_Sheet 点 R-101 符号，面板同步 |
| **8c** | 第 3 周 | `get_object` RPC + 管段/仪表字段模板 + 文档/单测 | `npm run test:e2e` pick 场景 |

#### 7.1.7 风险与缓解

| 风险 | 缓解 |
|------|------|
| TechDraw 点选只能选中整页 View | P0 bbox hit test；P3 长期改 DrawViewSymbol |
| 属性 JSON 字符串难读 | TaskPanel 格式化，不暴露原始 `VDI_Attributes` |
| Observer 与 RPC 线程 | 全部 Observer 逻辑 `Gui.updates` 主线程 |

---

### 7.2 PilotDeck Web：图面点选查参

#### 7.2.1 目标体验

1. 用户在 PilotDeck 打开 MEOH-100 → **PFD-100-001-PREVIEW**
2. 浏览器渲染 SVG（或 PDF+SVG 叠加层）
3. 鼠标悬停高亮 **R-101** 区域；点击后右侧 **对象卡片** 显示：
   - 位号、设备类型、设计/操作条件
   - 关联管段列表（`relationships`）
   - Skill 计算书 / 标准条款 `citations`（来自 DisciplineOutput）
4. （Phase 9b）工艺工程师可改 design_P → 保存 → 后台 `apply_delta` + 可选再出图

#### 7.2.2 架构

```
┌─────────────────── PilotDeck Web ───────────────────────────┐
│  DrawingViewer (SVG)                                        │
│    ├─ 底图：cad-output/PFD-*-PREVIEW.svg（或 manifest 生成） │
│    └─ 热点层：<g data-vdi-id="uuid">…</g>                   │
│              │ click                                        │
│              ▼                                              │
│  ObjectInspectorPanel                                       │
│    ├─ GET /api/vdi/projects/MEOH-100/objects/:id            │
│    └─ 或 MCP vdi_cad_get_object                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
              workspaces/.../plant/model.json  （真源）
                           │
              drawing-manifest.json（视图热点索引）
```

#### 7.2.3 核心产物：`drawing-manifest.json`

出图流水线在 `execute_command` 成功后写入（与 FCStd 同目录）：

```json
{
  "drawing_number": "PFD-100-001-PREVIEW",
  "view_id": "pfd-100-001-preview",
  "sheet_size": "A1",
  "scale": 1.0,
  "objects": [
    {
      "object_id": "ffb52770-b258-ee8d-5375-05f6331da476",
      "tag": "R-101",
      "class": "Equipment",
      "bbox_mm": { "x": 47.2, "y": 154.3, "w": 24.5, "h": 24.5 },
      "bbox_view": { "x": 0.31, "y": 0.42, "w": 0.04, "h": 0.05 }
    }
  ],
  "files": {
    "fcstd": "PFD-100-001-PREVIEW.FCStd",
    "svg": "PFD-100-001-PREVIEW.svg",
    "dxf": "PFD-100-001-PREVIEW.dxf"
  }
}
```

- `bbox_mm`：模型空间（与 `ViewDefinition.placements` 一致）
- `bbox_view`：归一化坐标（0–1），便于 Web 缩放；由 `fit_scale` + `view_x/y` 换算

**生成器**：`engine/manifest_export.py` + `run-pfd-cp1.mjs` 写入 `outputs/pfd-deliverables.json` 时合并 manifest 路径。

#### 7.2.4 SVG 热点导出（二选一）

| 方案 | 优点 | 缺点 | 建议 |
|------|------|------|------|
| **A. 出图时写 overlay SVG** | 精确、可测 | 需改 export 流水线 | **Phase 9a 首选** |
| **B. 前端用 manifest bbox 画透明 rect** | 不改 FreeCAD | 与 TechDraw 缩放需同步 | 9a POC 可用 |

Phase 9a 用 **方案 B** 快速验证；9b 切 **方案 A** 正式交付。

#### 7.2.5 Web 组件与 API

| 组件/端点 | 位置（建议） | 说明 |
|-----------|-------------|------|
| `DrawingViewer` | `pilotdeck-vdi/web/components/DrawingViewer.tsx` | SVG + 热点 + zoom/pan |
| `ObjectInspector` | 同目录 | 属性卡片 + citations |
| `GET .../objects/:object_id` | VDI API 或现有 workspace 静态读 | 读 `plant/model.json` 切片 |
| MCP `vdi_cad_get_object` | 已有 Phase 8 RPC | Agent/Skill 复用 |

**与 Deep Integration 规划对齐**：Web 改属性、FreeCAD 改布局（§11.2 决策 C）。

#### 7.2.6 分期交付（Phase 9 内部）

| 迭代 | 周期 | 交付 | 验收 |
|------|------|------|------|
| **9a** | 第 1–2 周 | manifest 生成 + Web POC（manifest bbox 热点）+ 只读属性 | 浏览器点 R-101 见 design_P |
| **9b** | 第 3–4 周 | SVG overlay + PDF 侧栏（可选）+ citations 链接 | 与 Skill 标准条款联动 |
| **9c** | 第 5–6 周 | Web 编辑 → apply_delta → 再出图任务队列 | 改 P 后新 FCStd 可下载 |

#### 7.2.7 风险与缓解

| 风险 | 缓解 |
|------|------|
| TechDraw 导出 SVG 无 object_id | 不依赖 SVG 语义，manifest 驱动热点 |
| PDF 点选难 | 首版 SVG；PDF 用 pdf.js + 同 manifest 叠加 |
| 双端属性编辑冲突 | PlantModel revision + `change_log`；Web 写 FC 只读布局 |

---

### 7.3 双轨关系与选型

```
                    PlantModel (真源)
                           │
           ┌───────────────┴───────────────┐
           ▼                               ▼
    Phase 8 FreeCAD                   Phase 9 Web
    布局编辑 + 现场审图                  日常查参 + 表单改属性
    TechDraw 点选                      浏览器点选
           │                               │
           └───────────────┬───────────────┘
                           ▼
                  get_object(object_id)
                  apply_delta (写属性)
```

| 场景 | 推荐端 |
|------|--------|
| 审图、改设备位置、出 PDF | FreeCAD |
| 查 datasheet、对标准、批量改设计条件 | PilotDeck Web |
| Agent / Skill 自动校验 | MCP `get_object` |

**建议排期**：Phase **8a→8b** 先做（2 周可见成果）；Phase **9a** 与 8b 并行（不依赖 FreeCAD GUI）。

---

## 八、数据契约演进

### 8.1 PlantModel v1（新真源）

```json
{
  "version": "1.0",
  "project_id": "MEOH-100",
  "revision": "A",
  "objects": [
    {
      "object_id": "550e8400-e29b-41d4-a716-446655440001",
      "class": "Equipment",
      "tag": "P-401",
      "attributes": {
        "equipment_type": "pump",
        "symbol_id": "PUMP-CENTRIFUGAL-001",
        "design_P_MPaG": 2.5,
        "design_T_C": 120,
        "oper_P_MPaG": 1.8,
        "oper_T_C": 85,
        "material": "CS"
      },
      "relationships": [
        { "type": "has_nozzle", "target_id": "…", "role": "suction" },
        { "type": "connected_by", "target_id": "…", "role": "pipe_in" }
      ]
    },
    {
      "object_id": "550e8400-e29b-41d4-a716-446655440002",
      "class": "PipeRun",
      "tag": "100-P-101-12\"-C1A",
      "attributes": {
        "dn": "DN300",
        "fluid": "合成气",
        "phase": "G",
        "design_P_MPaG": 3.6,
        "design_T_C": 355,
        "material": "C1A",
        "insulation": "H"
      },
      "relationships": [
        { "type": "connects", "from_id": "…", "to_id": "…", "from_port": "outlet", "to_port": "inlet" }
      ]
    }
  ],
  "views": [
    {
      "view_id": "pfd-100-001",
      "view_type": "pfd",
      "title_block": { "drawing_number": "PFD-100-001", "scale": "1:100" },
      "placements": {
        "550e8400-e29b-41d4-a716-446655440001": { "x": 220, "y": 200, "rotation": 0 }
      }
    }
  ]
}
```

### 8.2 CadCommand v1.1（视图衍生格式）

```json
{
  "version": "1.1",
  "options": {
    "create_sheet": true,
    "layout_engine": "sugiyama",
    "strict_validation": true
  },
  "equipment": [{
    "tag": "P-401",
    "type": "pump",
    "symbol_id": "PUMP-CENTRIFUGAL-001",
    "position": { "x": 220, "y": 200 },
    "rotation": 0,
    "parameters": { "design_P_MPaG": 2.5 }
  }],
  "lines": [{
    "line_no": "100-P-101-12\"-C1A",
    "from_tag": "R-101",
    "from_port": "outlet",
    "to_tag": "T-201",
    "to_port": "inlet",
    "inline_valves": [{ "tag": "XV-101", "type": "gate_valve", "position": 0.5 }]
  }],
  "tables": {
    "safety_valves": [{ "tag": "PSV-101", "protected_equipment": "R-101", "setpoint_MPaG": 3.2 }]
  }
}
```

```json
{
  "version": "1.1",
  "plant_model_ref": "MEOH-100/plant/model.json",
  "view_id": "pfd-100-001",
  "options": { "create_sheet": true, "mode": "render_view" }
}
```

完整 CadCommand 字段保留用于 **无 POM 文件的快速渲染/调试**；生产路径必须带 `plant_model_ref` 或内嵌 `objects[]`。

### 8.3 DisciplineOutput → PlantModel 映射（CP 对齐）

| CP | VDI 输出 | CadCommand 关键字段 |
|----|---------|---------------------|
| CP-0 | material_balance + equipment_draft + control_philosophy | 校验输入完整性 |
| CP-1 | PR-D04 streams + equipment | `streams[]`, `equipment[]`, `drawing_type=pfd` |
| CP-2 | PR-S01 line_list + instruments | `lines[]`, `instruments[]`, `tables.pipe_list` |
| CP-3 | PSV 派单 + 校验 | `tables.safety_valves`, vdi-rules gate |
| CP-4 | 发布 | `title_block.revision`, `drawing.generated` |

字段对照详见 `cad-intelligence/schemas/VDI_FIELD_MAPPING.md`（scheme 字段名需映射为 CadCommand 字段名）。

| CP | VDI 输出 | PlantModel 写入 |
|----|---------|----------------|
| CP-0 | material_balance + equipment_draft + control_philosophy | 校验 + 预创建 objects |
| CP-1 | PR-D04 streams + equipment | `Stream` + `Equipment` objects；view `pfd-*` |
| CP-2 | PR-S01 line_list + instruments | `PipeRun` + `Instrument` + `Valve` |
| CP-3 | PSV 派单 | `SafetyValve` objects |
| CP-4 | 发布 | revision++；`drawing.generated` + **model.published** |

### 8.4 DEXPI / 属性键映射（摘要）

| PlantObject.class | DEXPI 概念 | 优先 attributes |
|-------------------|-----------|-----------------|
| Equipment | Equipment | tag, equipment_type, design/oper T/P |
| PipeRun | PipingNetworkSegment | dn, fluid, insulation, line_number |
| Instrument | InstrumentLoopFunction | loop_id, range, signal |
| Valve | Valve | valve_type, fail_position, dn |
| SafetyValve | SafetyValve | setpoint, orifice |

完整映射表在 Phase 6 交付。

### 8.5 布局责任划分

**视图布局** 写入 `ViewDefinition.placements`；**不写入** `PlantObject.attributes`（设计属性与视图位置分离）。

converter 负责初始 layout；FreeCAD 拖动只改 placements，RPC `extract_plant_model` 须区分二者。

### 8.6 GB/T 51296 与 DEXPI 2.0 对齐（V1.3）

#### 8.6.1 三层映射模型

```
GB/T 51296 类库（附录 B/C）  ←map→  PlantModel.class + attributes
                                        │
                                        ├─map→  DEXPI 2.0 XML 类型/属性
                                        │
                                        └─map→  FreeCAD VDI_* CustomProperty
```

| PlantModel | GB/T 51296（附录 C 典型类） | DEXPI 2.0 概念 |
|------------|---------------------------|----------------|
| `Equipment` | 静设备/动设备/换热器… | Equipment |
| `PipeRun` | 管道（管线段） | PipingNetworkSegment |
| `Instrument` | 仪表 | InstrumentLoopFunction / MeasuringElement |
| `Valve` | 阀门 | Valve |
| `SafetyValve` | 安全阀 | SafetyValve |
| `Stream` | 物流/流股 | ProcessConnection（Process 模型） |
| `ControlLoop` | 控制回路 | InstrumentLoop |

#### 8.6.2 数字化移交最小包（M6 交付物）

| 文件/目录 | 标准依据 | 说明 |
|-----------|---------|------|
| `plant/model.json` | 51296 工厂对象数据 | 真源 |
| `plant/pbs.json` | 51296 §4.2 PBS | 工厂分解结构 |
| `plant/class-library-ref.json` | 51296 附录 B | 项目类库版本指针 |
| `handover/dexpi/*.xml` | DEXPI 2.0 | PFD/P&ID 语义交换 |
| `handover/drawings/*.{pdf,dxf,svg}` | 51296 §5.3 文档 | 视图产物 |
| `handover/manifests/drawing-manifest.json` | VDI 扩展 | Web/FC 点选索引 |
| `handover/tables/*.csv` | 51296 典型表 | 管道表/设备表/仪表表（来自 POM） |
| `handover/object-register.csv` | TP_101 类交付 | 位号 + UUID + 类码 + 关键属性 |

#### 8.6.3 DEXPI 2.0 实施要点（相对 V1.2 Phase 6 的升级）

1. **序列化格式**：采用 DEXPI XML（非 Proteus/XMpLant 遗留格式）。
2. **双模型**：P&ID 用 Plant Model 1.4 内容；PFD 流股用 Process Model——与 VDI `Stream` + `Equipment` 划分一致。
3. **可视化分离**：同一 DEXPI 数据可配不同 SVG/FCStd 视图（对齐 §7 manifest 思路）。
4. **扩展机制**：项目专用属性走 DEXPI XML 扩展槽，不污染核心 PlantModel schema。
5. **验证**：导出后用 DEXPI Spec Generator / 第三方 viewer 做 round-trip 抽检。

#### 8.6.4 国内平台互通策略

| 场景 | 策略 |
|------|------|
| 业主用中望 Plant / SP P&ID | **DEXPI 2.0 XML 导入** 为主通道；FCStd 不作为交换格式 |
| 旧 PDF 图纸 | Phase 12 逆向 或 采购 iPID 对接 |
| 中石化交付平台 | Phase 10 `digital-handover-pack` 按业主模板打包 |
| VDI 内部编辑 | 继续 FreeCAD + PlantModel；Web 改属性、FC 改布局 |

---

## 九、测试与验收体系

### 9.1 测试金字塔

```
                    ┌─────────────┐
                    │ 人工 CP 闸门 │  ← 每 CP 对标真实样张
                    └──────┬──────┘
               ┌───────────┴───────────┐
               │  FreeCAD E2E (nightly)│  ← test-e2e.mjs + CP 脚本
               └───────────┬───────────┘
          ┌───────────────┴───────────────┐
          │  Golden FCStd 回归（weekly）   │  ← 对象数/bbox/导出格式
          └───────────────┬───────────────┘
     ┌────────────────────┴────────────────────┐
     │  vdi-cad-core 单元测试（PR 必过）         │  ← POM merge/delta + 符号/布局
     └────────────────────┬────────────────────┘
┌────────────────────────┴────────────────────────┐
│  converter + schema 测试（PR 必过）                │  ← test-converter.mjs
└─────────────────────────────────────────────────┘
```

### 9.2 MEOH-100 验收清单（CP-4 完成标准）

#### PlantModel（M0，Phase P 必过）

- [ ] `plant/model.json` 含 48 Equipment + 32 PipeRun + 12 Instrument（各有 UUID）
- [x] FreeCAD 树/模型空间选设备，属性面板可见 `VDI_*`（JSON 只读）
- [ ] **TechDraw 页点选**设备符号 → VDI 属性面板格式化展示 design/oper T/P（Phase 8b）
- [ ] 修改 `P-401.design_P_MPaG` 后 `extract_plant_model` 回写成功
- [ ] 二次 render 不丢对象、不全量重建文档
- [ ] `plant.object.changed` 事件写入 inbox

#### 图面点选（M0.5 / M0.6，Phase 8–9）

- [ ] **FreeCAD**：`VDI_Sheet` 点击 R-101 → TaskPanel 显示 tag + design_P_MPaG + design_T_C
- [ ] **FreeCAD**：管段/仪表点选展示 DN、loop_id 等 class 字段
- [ ] RPC `get_object(object_id)` 与 GUI 展示一致
- [ ] `drawing-manifest.json` 含 preview 12 设备 bbox
- [ ] **Web**：DrawingViewer 点击 R-101 → 侧栏 datasheet + object_id
- [ ] **Web**（9b）：citations 链接至 Skill 标准条款
- [ ] **Web**（9c）：表单改 design_P → apply_delta → 新 FCStd 可下载

#### PFD（PFD-100-001）

- [ ] 48 台设备均有对应 GB 符号，且 **VDI_ObjectId 可点击查属性**
- [ ] 32 条物流/管段拓扑与 fixture 一致
- [ ] 物流号 + 主要流量标注在线旁或线中
- [ ] 管道表 ≥ 32 行（TechDraw 表格或等效）
- [ ] GB A3 图框，图号/版次/比例正确
- [ ] PDF + DXF 可打开，图层可辨

#### P&ID（PID-100-001）

- [ ] CP-1 全部项 +
- [ ] 12 个控制回路仪表可见，loop 号可追踪
- [ ] ≥ 5 PSV 标注 setpoint
- [ ] 10 条 cause_effect 联锁
- [ ] inline 阀在关键管段
- [ ] 管道表 32 行 **来自 PipeRun 对象**，非硬编码文字
- [ ] 对象清单 CSV 可导出（位号 + 设计条件）

#### 自动化

- [ ] `npm run test:converter` 通过
- [ ] `npm run test:e2e:mock` 通过
- [ ] `npm run test:acceptance` 通过（Phase 7 离线闸门）
- [ ] `npm run test:e2e` 通过（需 FreeCAD RPC，nightly）
- [ ] `vdi_validate_discipline_output` 零 error
- [ ] `drawing.generated` 事件写入 inbox

#### Phase 5–6（多维 + 交换）

- [ ] layout / isometric / 3d 视图 CadCommand 可生成
- [ ] `vdi_cad_export_dexpi` 导出 48+32+12+32+5 对象
- [ ] `change_log` + revision 与图框版次一致

### 9.3 Golden 文件策略

| 文件 | 用途 |
|------|------|
| `golden/meoh-100/plant-model-baseline.json` | POM 属性回归 |
| `golden/meoh-100/pfd-baseline.FCStd` | 视图几何回归 |
| `golden/meoh-100/pid-baseline.FCStd` | P&ID 视图回归 |
| `golden/meoh-100/plant-model-dexpi.xml` | DEXPI 子集回归 |
| `golden/meoh-100/manifest.json` | 对象数、属性 checksum |
| `golden/meoh-100/drawing-manifest-preview.json` | 图面点选 bbox 回归（Phase 9） |

---

## 十、与 VDI 生态集成

### 10.1 MCP 服务依赖

| 服务 | 角色 | 集成点 |
|------|------|--------|
| `vdi-cad` | 绘图 + **POM 读写** | `load_plant_model` / `extract` / `apply_delta` / **`get_object`** |
| `vdi-knowledge` | 规范引用 | attributes 枚举值校验 |
| `vdi-rules` | 发布闸门 | **PlantModel** 完整性 + DisciplineOutput |
| `vdi-events` | `drawing.generated` · **`plant.object.changed`** | CP-4 发布 |
| `vdi-orchestrator` | 跨专业提资 | 管道/仪表对象合并 |

### 10.2 Skill 分工

| 设计内容 | Skill | CAD 职责 |
|---------|-------|----------|
| PFD 工艺 | PR-D04 | 写入 **Equipment + Stream** 对象 |
| P&ID 工艺 | PR-S01 | 写入 **PipeRun + Valve + Instrument** |
| 控制哲学 | PR-S05 | 写入 **ControlLoop + SafetyValve** |
| 3D 管道 | 管道组 PR-CAD-3D | 写入 **Nozzle + 3D PipeRun** 视图 |

### 10.3 部署拓扑

```
宿主机 FreeCAD GUI + vdi_cad_addon (RPC :9876)
         ↑ host.docker.internal
PilotDeck Docker (vdi-cad MCP)
         ↑
workspaces/工艺组/pilot/meoh-100/
  ├── plant/model.json          ← PlantModel 真源
  ├── cad-output/               ← FCStd/PDF/DXF/SVG + drawing-manifest.json
  └── outputs/                  ← DisciplineOutput
```

安装：`bash pilotdeck-vdi/freecad/install.sh`  
诊断：`bash pilotdeck-vdi/freecad/verify-rpc.sh`

---

## 十一、风险与决策

### 11.1 风险登记

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| **无 POM 继续堆图形** | 中 | 交付物不可用于施工 | V1.1 路线：Phase P 阻塞 M1–M4 |
| FreeCAD Property 编辑体验差 | 中 | 用户不愿在 FC 内改属性 | PilotDeck Web 属性表单 + RPC apply_delta |
| 图模属性双源 | 高 | 不一致 | PlantModel 唯一真源；图面只读展示属性 |
| **TechDraw 点选无法命中单设备** | 高 | M0.5 延期 | bbox hit test（§7.1.3 P0）；长期 DrawViewSymbol |
| **模型空间隐藏导致无法点选** | 中 | 用户困惑 | `pick_mode` + `hide_model_space: false` 调试开关 |
| TechDraw 大批量不稳定 | 高 | 图框失败 | 视图与对象分离；TechDraw 只引用代理 |
| destroy-recreate 习惯 | 高 | 编辑不可持续 | Phase P 明确禁止 |
| **DEXPI 2.0 映射工作量** | 中 | Phase 10 延期 | 先 Equipment/Pipe/Instrument 子集；跟 DEXPI Process Type Library 2026 路线图 |
| **国内平台不对接 DEXPI** | 低 | 交付被拒 | Phase 10 并行出 51296 CSV + DEXPI XML 双格式 |
| **盲目投入 AIGC 画图** | 中 | 返工 | 遵守 §1.4.3 有效区；AI 只做 PlantModel 层 |

### 11.2 待决策项

| 决策 | 选项 | 建议 |
|------|------|------|
| **真源存储** | A) JSON 文件 B) SQLite C) 双写 | **A** 试点；B 在对象 >5000 时评估 |
| **FreeCAD 代理类型** | A) FeaturePython B) Part::Feature + Property | **A**，便于扩展编辑回调 |
| **CadCommand 命运** | A) 废弃 B) 作视图快照 C) 长期并存 | **C** 过渡；新功能走 PlantModel |
| **Web 编辑 vs FC 编辑** | A) 仅 FC B) 仅 Web C) 双端 | **C**；Web 改属性，FC 改布局 |
| **3D 优先级** | 与 2D 并行 vs 后置 | **2D POM + 点选先行**；3D Phase 5 |
| **DEXPI 时间** | Phase 6 vs Phase 10 | **Phase 10 正式交付**；Phase 6 仅 POC |
| **逆向识图** | 自研 vs iPID vs 不做 | **Phase 12 按需**；正向链优先 |
| **长期 CAD 内核** | FreeCAD vs 国产 Plant vs 导出链 | **FreeCAD 至 M4**；M6 前评估 DEXPI 导出链是否足够 |

| **TechDraw 点选策略** | A) 整页 View + bbox B) 每设备 DrawViewSymbol C) 仅树选 | **A** 短期；**B** Phase 1+ 正式审图 |

---

## 十二、近期行动项（V1.3 优先级）

### 已完成（V1.2 前序）

1. CP-1 preview PFD（A1 / ISO 图框 / 12 设备）
2. PlantModel + `VDI_*` 对象绑定（preview FCStd）
3. `extract_plant_model` / `apply_delta` RPC 桩
4. §1.4 行业调研与 V1.3 战略判断文档化

### 立即（Phase 8a，第 1 周）

5. **新建** `gui/vdi_property_panel.py` + `object_field_templates.json`
6. **新建** `gui/selection_observer.py`（树/模型空间点选 → TaskPanel）
7. **RPC** `get_object(object_id)` + MCP `vdi_cad_get_object`
8. **options** 增加 `pick_mode` / `enable_vdi_property_panel`

### 第 2–3 周（Phase 8b–8c + 9a 启动）

9. **新建** `engine/pick_resolver.py`（TechDraw → Source bbox hit test）
10. **新建** `engine/manifest_export.py` → `drawing-manifest.json`
11. Web POC：`DrawingViewer` + manifest bbox 热点（只读）
12. TechDraw 点选 E2E 场景写入 `test-e2e.mjs`

### 第一个月（M0.5 / M0.6 闸门）

13. FreeCAD TechDraw 点 R-101 见 design_P（M0.5）
14. Web 点 R-101 见 datasheet（M0.6 / 9a）
15. 更新 `skills/vdi-process-cad-2d/SKILL.md`：验收含 §9.2 点选项

### Q3–Q4 2026（M1–M4，不变）

16. Phase 1–4：符号 / 布局 / P&ID 语义 / 正式出图
17. 甲醇 48+32+12 对象全入库；Golden baseline

### Q1 2027（M6，V1.3 新增）

18. **起草** `schemas/gbt51296-class-map.json`
19. **实现** `dexpi_export.py`（DEXPI 2.0 XML 子集）
20. **实现** `digital-handover-pack.mjs` 移交包编排
21. DEXPI round-trip 抽检 + 51296 对象清单对照

### 按需（Phase 11–12）

22. Agent 布局/规范闭环（orchestrator + vdi-rules 扩展）
23. 逆向识图 POC（PDF → PlantModel draft）— 仅旧改项目触发

---

## 十三、附录

### A. 关键文件索引

| 用途 | 路径 |
|------|------|
| 渲染入口 | `pilotdeck-vdi/freecad/vdi_cad_addon/engine/pipeline.py` |
| PFD/PID | `engine/pfd.py`, `engine/pid.py` |
| 符号（待替换） | `engine/symbols.py` |
| 仪表布局 | `engine/layout.py` |
| RPC | `vdi_cad_addon/rpc_server.py` |
| MCP | `pilotdeck-vdi/mcp/vdi-cad/server.mjs` |
| 转换器 | `pilotdeck-vdi/mcp/vdi-cad/converter.mjs` |
| 契约 | `pilotdeck-vdi/mcp/vdi-cad/schemas/cad-command-v1.schema.json` |
| 符号库（源） | `cad-intelligence/symbols/` |
| 符号管理（源） | `cad-intelligence/core/symbol_manager.py` |
| 约束验证（源） | `cad-intelligence/core/constraint_validator.py` |
| 试点 Skill | `skills/vdi-process-cad-2d/SKILL.md` |
| 字段映射 | `cad-intelligence/schemas/VDI_FIELD_MAPPING.md` |
| object_factory | `vdi_cad_addon/engine/object_factory.py` |
| 点选追溯（待建） | `engine/pick_resolver.py` |
| 选择监听（待建） | `gui/selection_observer.py` |
| 属性面板（待建） | `gui/vdi_property_panel.py` |
| 图面 manifest（待建） | `engine/manifest_export.py` |
| DEXPI 2.0 导出（待建） | `engine/dexpi_export.py` |
| 点选追溯（Phase 8） | `engine/pick_resolver.py` |
| 选择监听（Phase 8） | `gui/selection_observer.py` |
| 属性面板（Phase 8） | `gui/vdi_property_panel.py` |
| 图面 manifest（Phase 9） | `engine/manifest_export.py` · `manifest-export.mjs` |
| 点选 API 文档（Phase 9） | `mcp/vdi-cad/docs/drawing-pick-api.md` |
| 51296 类库映射（Phase 10） | `schemas/gbt51296-class-map.json` |
| 数字化移交包（Phase 10） | `mcp/vdi-cad/digital-handover-pack.mjs` |
| DEXPI 导入 POC（Phase 10） | `mcp/vdi-cad/dexpi-import.mjs` |
| 图幅常量 | `pilotdeck-vdi/mcp/vdi-cad/sheet-sizes.mjs` |
| CP-1 出图 | `pilotdeck-vdi/mcp/vdi-cad/run-pfd-cp1.mjs` |

### B. 命令速查

```bash
# 离线测试
cd pilotdeck-vdi/mcp/vdi-cad && npm run test:acceptance
cd pilotdeck-vdi/mcp/vdi-cad && npm run test:get-object
cd pilotdeck-vdi/mcp/vdi-cad && npm run test:manifest-pick
cd pilotdeck-vdi/mcp/vdi-cad && npm run handover:pack -- --project MEOH-100
cd pilotdeck-vdi/mcp/vdi-cad && npm run test:e2e:mock
cd pilotdeck-vdi/mcp/vdi-cad && npm run acceptance:full   # 全量 PR 回归
cd pilotdeck-vdi/mcp/vdi-cad && npm run acceptance:e2e    # + FreeCAD E2E

# RPC 诊断
bash pilotdeck-vdi/freecad/verify-rpc.sh

# CP 出图（需 FreeCAD + 工作区数据）
node pilotdeck-vdi/mcp/vdi-cad/run-pfd-cp1.mjs
node pilotdeck-vdi/mcp/vdi-cad/run-pid-cp2.mjs

# cad-intelligence 对标验证（旧模块，仅参考）
freecadcmd cad-intelligence/scripts/verify_r1.py
```

### C. 术语对照

| 术语 | 含义 |
|------|------|
| **PlantModel (POM)** | 项目级工厂对象真源（JSON/SQLite） |
| **PlantObject** | 单工厂对象实例（Equipment/PipeRun/…） |
| **ViewDefinition** | 某张图/3D 视图对对象的布局与图框 |
| **object_id** | UUID，全局唯一，跨二三维不变 |
| **代理对象** | FreeCAD 中带 VDI 属性的文档对象 |
| CadCommand | 视图渲染指令（衍生格式，兼容旧路径） |
| apply_delta | 增量更新 PlantModel 的 RPC 操作 |
| drawing-manifest | 图面热点索引（object_id + bbox），供 Web 点选 |
| get_object | 只读查询 PlantObject 的 RPC/MCP 操作 |
| get_object | 只读查询 PlantObject 的 RPC/MCP 操作 |
| DEXPI 2.0 | 流程工业 PFD/P&ID/BFD 统一交换标准（2025-10 发布） |
| GB/T 51296 | 石油化工工程数字化交付国家标准 |
| CFIHOS | 资本项目工厂信息交接规范（与 DEXPI 互补） |
| DEXPI | P&ID 语义数据交换标准（非几何） |

### D. 调研参考（V1.3）

| 类别 | 来源 |
|------|------|
| 国际标准 | [DEXPI 2.0 Specification](https://dexpi.org/dexpi-2-0-specification-published-a-new-standard-for-process-industry-data-exchange/)（2025-10）；[PIDMIC 全生命周期最佳实践](https://dexpi.org/pidmic-best-practice-published-asset-lifecycle-information-management/) |
| 国际平台 | AVEVA Unified Engineering；Hexagon Smart P&ID；Konnect xD Smart P&ID |
| 国内标准 | GB/T 51296-2018《石油化工工程数字化交付标准》 |
| 国内产品 | 中望 Plant 2026；Bentley iPID（×创新奇智，2025-08）；NeuroBox D（迈烁集芯） |
| 学术研究 | AutoChemSchematic AI（physics-aware PFD/P&ID）；ACPID Copilot（NL→P&ID） |
| AI 采购观 | 2026 工程软件 AI：先数据层（Smart Blocks/markup），后 Agent 层 |

---

**文档维护**：V1.3 起以 PlantModel + **标准交换（§8.6）** + **图面点选（§7、§9.2）** 为进度指标；每 Phase 更新 §6 与 §9.2。  
**关联文档**：`cad-intelligence/schemas/VDI_FIELD_MAPPING.md`、`skills/vdi-process-cad-2d/SKILL.md`、`docs/系统建设方案与各模块设计/1001_PilotDeck-VDI-深集成建设规划.md`
