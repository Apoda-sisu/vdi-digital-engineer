#!/usr/bin/env node
/**
 * 管道专业 Skill V1.1 紧凑深化
 * 用法: node scripts/deepen-piping-skills-v11.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILLS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills");

const EXEC = `## ⚠ 执行模式

1. 每次只执行 **一个 CP**，末尾 \`⛔ [CP-N 完成] — 等待人类响应\` 后停止
2. 人类「确认/继续/批准」前不得进入下一 CP
3. MUST 缺失 → DATA_REQUEST，禁止编造

## 违规自查

- [ ] 是否跨 CP？ → 截断
- [ ] 是否编造 MUST？ → 回退 CP-0
- [ ] 末尾是否有停止标记？`;

const L2 = [
  {
    dir: "vdi-piping-material-class", code: "PIM", sub: "M", d: "01", name: "管道材料等级",
    output: "material_class", may: ["管道腐蚀计算"], task: "PI-01a",
    std: "SH/T 3059、GB 50316",
    queries: ["管道材料等级 设计温度压力", "腐蚀裕量 壁厚", "管材选用 碳钢合金"],
    scope: "PMS 等级表、壁厚系列、腐蚀裕量",
    cp0: "medium_list、design_TP（工艺）",
    cp1: "按介质 T·P 划分等级；检索 SH/T 3059",
    cp2: "可选调用管道腐蚀计算；vdi_validate_discipline_output",
    cp3: "发布 material_class.updated；提交 piping-lead",
    points: [["等级划分", "按 T·P·介质"], ["腐蚀", "裕量 mm"], ["材质", "20#/304/合金"], ["壁厚", "按 ASME/GB 表"]],
    payload: { classes: [{ class_id: "A1", max_P_MPa: 1.6, max_T_C: 200, material: "20#", corrosion_mm: 1.5 }] },
    forbid: "禁止在无介质清单时定等级",
    event: "material_class.updated",
  },
  {
    dir: "vdi-piping-line-list", code: "PIL", sub: "L", d: "02", name: "管道表 Line List",
    output: "line_list", may: ["管道水力计算", "管道数据与 MTO"], task: "PI-01b",
    std: "GB/T 50933、HG/T 20519",
    queries: ["管道表 编制深度", "Line List 命名", "管道表 绝热字段"],
    scope: "Line List 升版、命名、管径初校、绝热字段",
    cp0: "pid_line_list_draft、material_classes（D01）",
    cp1: "合并工艺草案与等级；统一命名规则",
    cp2: "管道水力计算校核关键线管径；契约校验",
    cp3: "发布 line_list.updated；提交 piping-lead",
    points: [["命名", "单元-公称-序号"], ["字段", "from/to/Dn/T/P/等级"], ["管径", "工艺初值+水力校核"], ["绝热", "操作温度驱动"]],
    payload: { lines: [{ line_id: "1001-P-001", from: "V-101", to: "P-101", dn: 100, material_class: "A1" }] },
    forbid: "禁止在 D01 未发布时锁定 material_class",
    event: "line_list.updated",
  },
  {
    dir: "vdi-piping-layout", code: "PIY", sub: "Y", d: "03", name: "管道布置",
    output: "piping_layout", may: ["管道水力计算", "管道振动计算"], task: "PI-02",
    std: "HG/T 20519-4、GB/T 50933",
    queries: ["管道平面布置 管廊", "管道立面 标高 坡度", "管廊 管道布置 检修", "管道净距 热膨胀"],
    scope: "平面+立面布置、标高竖向、管廊接口（单一交付物 piping_layout）",
    cp0: "plot_boundary、equipment_coords、pid_line_list_draft、rack_zones",
    cp1: "平面路由（管廊 L1/L2、净距协调）；检索 HG/T 20519-4",
    cp2: "立面标高 + 水力/振动初校；vdi_validate_discipline_output",
    cp3: "piping_layout.updated；提交 piping-lead",
    points: [["平面", "管廊集中、检修通道 ≥600mm"], ["立面", "泵吸入无气袋、重力流坡度"], ["协调", "与 D02/D05/D08 接口"], ["图幅", "PL/EL 成对 revision 同步"]],
    payload: {
      plan_sheets: [{ number: "PL-001", title: "管道平面布置图", revision: "A", unit: "甲醇装置" }],
      elevation_sheets: [{ number: "EL-001", title: "管道立面图", revision: "A", unit: "甲醇装置" }],
      routing_summary: {
        line_count: 2,
        rack_levels_used: ["L1", "L2"],
        critical_elevations: [{ line_id: "1001-P-001", from_EL: "EL+100.000", to_EL: "EL+100.500" }],
      },
    },
    forbid: "禁止在 Line List 未发布时锁定最终管径路由",
    event: "piping_layout.updated",
  },
  {
    dir: "vdi-piping-routing", code: "PIG", sub: "G", d: "06", name: "管道综合路由",
    output: "piping_design", may: ["管道水力计算", "管道振动计算", "管道数据与 MTO"], task: "PI-02b",
    std: "HG/T 20519-4",
    queries: ["管道综合 碰撞", "设计说明 配管", "各专业协调"],
    scope: "碰撞汇总、设计说明、路由聚合（E2E 交付）",
    cp0: "line_list、piping_layout（D02/D03）",
    cp1: "汇总布置与碰撞清单；编制设计说明目录",
    cp2: "关键管线水力/振动复核；vdi_validate_discipline_output",
    cp3: "discipline_output.published 聚合提交",
    points: [["碰撞", "结构/电缆/暖通"], ["说明", "布置原则"], ["MTO", "T06 接口"], ["风险", "未闭合项清单"]],
    payload: { routing_summary: { line_count: 45 }, clash_report: { resolved: 2, pending: 0 } },
    forbid: "禁止在 D03 未发布时出综合路由终版",
    event: null,
  },
  {
    dir: "vdi-piping-equipment-connect", code: "PIN", sub: "N", d: "04", name: "设备管道连接",
    output: "equipment_piping", may: ["管道水力计算"], task: "PI-04a",
    std: "HG/T 20519-4",
    queries: ["设备接管 管口方位", "泵入口 管道布置", "塔器接管"],
    scope: "管口方位、泵/塔接管、检修空间",
    cp0: "nozzle_list、line_list",
    cp1: "核对管口与 Line List 对应关系",
    cp2: "泵 NPSH/入口管径水力校核",
    cp3: "equipment_piping.updated；提交 lead",
    points: [["管口", "EQ 清单为准"], ["泵", "顶进底出/避免气袋"], ["塔", "重沸/回流口标高"], ["检修", "可拆法兰留距"]],
    payload: { nozzle_connections: [{ equipment: "P-101", line_id: "1001-P-001", nozzle: "N1" }] },
    forbid: "禁止擅自改设备管口方位",
    event: "equipment_piping.updated",
  },
  {
    dir: "vdi-piping-rack-layout", code: "PIR", sub: "R", d: "05", name: "管架管廊布置",
    output: "rack_layout", may: ["管道重量与荷载"], task: "PI-04b",
    std: "HG/T 20519-4",
    queries: ["管廊 布置 层位", "管架 坐标"],
    scope: "管廊坐标、层位、路权",
    cp0: "plot_plan（总图）；SHOULD piping_layout",
    cp1: "确定管廊轴线与层位划分",
    cp2: "管道重量与荷载估算各层承载",
    cp3: "rack_layout.updated；提交 lead",
    points: [["层位", "L1/L2/L3"], ["宽度", "满足净距"], ["路权", "与电缆/结构协调"], ["荷载", "→ ST 接口"]],
    payload: { racks: [{ id: "RACK-N", levels: ["L1", "L2"], width_m: 6 }] },
    forbid: "禁止占用消防通道",
    event: "rack_layout.updated",
  },
  {
    dir: "vdi-piping-support", code: "PIU", sub: "U", d: "07", name: "管道支架设计",
    output: "support_design", may: ["管道应力计算", "管道振动计算", "管道重量与荷载"], task: "PI-03a",
    std: "HG/T 20645",
    queries: ["管道支架 选型", "支架荷载", "特殊支架"],
    scope: "支架表、荷载、特殊支架",
    cp0: "piping_geometry（D03）",
    cp1: "支承点布置；标准支架初选",
    cp2: "应力/重量计算荷载；契约校验",
    cp3: "piping_support.updated → ST；提交 lead",
    points: [["间距", "按管径/保温"], ["类型", "A/B/C 类"], ["荷载", "垂直/水平/热载"], ["特殊", "弹簧/导向/固定"]],
    payload: { supports: [{ id: "S-1001-01", type: "A", line_id: "1002-P-001" }], loads_kN: [{ support_id: "S-1001-01", vertical: 12 }] },
    forbid: "禁止无几何数据出支架荷载",
    event: "piping_support.updated",
  },
  {
    dir: "vdi-piping-stress", code: "PIS", sub: "S", d: "08", name: "管道应力分析",
    output: "stress_analysis", may: ["管道应力计算"], task: "PI-03b",
    std: "HG/T 20645、GB 50316",
    queries: ["临界管系 应力分析", "管道柔性 CAESAR", "热膨胀"],
    scope: "临界管系表、应力报告、建议",
    cp0: "piping_geometry、operating_TP",
    cp1: "识别临界管系清单",
    cp2: "管道应力计算；输出 recommendations",
    cp3: "stress_analysis.completed；回提 D03/D07",
    points: [["临界", "高温/大口径/薄壁"], ["工具", "CAESAR II 等"], ["允许应力", "GB 50316"], ["反馈", "支架/路由修改"]],
    payload: { critical_lines: ["1002-P-001"], recommendations: ["增加导向支架"] },
    forbid: "禁止无 T·P 做应力判定",
    event: "stress_analysis.completed",
  },
  {
    dir: "vdi-piping-insulation", code: "PII", sub: "I", d: "09", name: "绝热伴热设计",
    output: "insulation_tracing", may: [], task: "PI-05a",
    std: "GB 50264、SH/T 3015",
    queries: ["管道绝热 厚度", "伴热 蒸汽 电伴热"],
    scope: "绝热厚度、伴热方式、Line List 字段回填",
    cp0: "line_list（含操作温度）",
    cp1: "按温度/节能要求定绝热等级",
    cp2: "伴热方式比选；更新 line 字段",
    cp3: "insulation_tracing.updated",
    points: [["绝热", "防烫/保冷/节能"], ["伴热", "蒸汽/电/热水"], ["厚度", "查 GB 50264"], ["字段", "回填 D02"]],
    payload: { insulation_lines: [{ line_id: "1002-P-001", type: "防烫", thickness_mm: 50 }], tracing_lines: [] },
    forbid: "禁止无操作温度选绝热",
    event: "insulation_tracing.updated",
  },
  {
    dir: "vdi-piping-isometric", code: "PIO", sub: "O", d: "10", name: "ISO 单线图管段图",
    output: "isometric_spool", may: ["管道数据与 MTO"], task: "PI-05b",
    std: "SH/T 3503、HG/T 20519",
    queries: ["轴测图 ISO", "试压包 划分"],
    scope: "ISO 图、管段、试压包",
    cp0: "line_list、piping_layout",
    cp1: "按线号生成 ISO 索引",
    cp2: "试压包划分（T06）；焊口/支架标注",
    cp3: "isometric_spool.updated",
    points: [["ISO", "一管一图或分段"], ["试压包", "SH/T 3503"], ["标注", "焊口/阀门/支架"], ["MTO", "T06 提取"]],
    payload: { isometrics: ["ISO-1001-001"], test_packages: ["TP-01"] },
    forbid: "禁止 ISO 与 Line List 线号不一致",
    event: "isometric_spool.updated",
  },
  {
    dir: "vdi-piping-valve-spec", code: "PIV", sub: "V", d: "11", name: "阀门与特殊件选用",
    output: "valve_specialty", may: ["管道腐蚀计算"], task: "PI-05c",
    std: "SH/T 3059",
    queries: ["阀门选用 型式", "特殊件 三通 大小头"],
    scope: "阀门型式、VDS、特殊件（与 D01 分工）",
    cp0: "material_classes、line_list",
    cp1: "按等级/介质选阀型",
    cp2: "特殊件清单；腐蚀敏感件复核",
    cp3: "valve_spec.updated",
    points: [["阀门", "闸/截止/球/蝶"], ["特殊件", "与等级匹配"], ["VDS", "采购接口"], ["分工", "型式本 Skill/材质 D01"]],
    payload: { valves: [{ line_id: "1001-P-001", type: "gate", dn: 100 }], specialty_items: [] },
    forbid: "禁止阀体材质与等级不符",
    event: "valve_spec.updated",
  },
  {
    dir: "vdi-piping-underground", code: "PIB", sub: "B", d: "12", name: "地下管沟布置",
    output: "underground_piping", may: ["管道水力计算"], task: "PI-05d",
    std: "GB 50316、GB 50268",
    queries: ["埋地管道 覆土深度", "管沟 布置"],
    scope: "埋地路由、管沟、覆土",
    cp0: "plot_boundary、line_list（buried 标注）",
    cp1: "区分埋地/管沟/架空段",
    cp2: "埋地管坡向/水力；与地下设施净距",
    cp3: "underground_piping.updated",
    points: [["埋深", "≥规范最小覆土"], ["管沟", "排水/通风"], ["净距", "与电缆/建构筑物"], ["防腐", "与 D01 等级一致"]],
    payload: { underground_routes: [{ line_id: "1003-P-001", burial_depth_m: 1.2 }], trench_sections: ["T-01"] },
    forbid: "禁止埋地管无防腐等级",
    event: "underground_piping.updated",
  },
];

function l2(s) {
  const mayYaml = s.may.length ? s.may.map(m => `      - ${m}`).join("\n") : "      []";
  const pts = s.points.map(([a, b]) => `| ${a} | ${b} |`).join("\n");
  const eventSec = s.event ? `\n完成后发布 \`${s.event}\`。\n` : "";
  return `---
name: ${s.name}
code: ${s.code}
description: ${s.name}工程师。${s.scope}。触发场景：${s.name}、${s.output}。
metadata:
  vdi:
    discipline: PI
    sub_discipline: ${s.sub}
    branch: PI-${s.sub}
    role: 分析层
    level: 2
    deliverable_code: PI-D${s.d}
    reports_to: vdi-piping-lead
    pilotdeck_workspace: /workspace/workspaces/管道组
    mcp_required:
      - vdi-knowledge
      - vdi-rules
    may_call:
${mayYaml}
    triggers:
      - ${s.name}
      - ${s.output}
---

# ${s.name}工程师（二级 · PI-D${s.d}）

## 规范检索（CP 前必调）

${s.queries.map(q => `- \`${q}\` → ${s.std.split("、")[0]}`).join("\n")}

CP-0：\`vdi_check_data_completeness(discipline="piping", sub_discipline="${s.sub}")\`

## 基准数据

\`workspaces/管道组/pilot/plant-base/design-basis/must-data.json\` → \`piping\` · project_id: **PI-PLANT-BASE**

${EXEC}

- [ ] ${s.forbid}？

## PilotDeck 集成

- **上级**：管道专业负责人 · **MCP**：vdi-knowledge、vdi-rules
- **三级**：${s.may.length ? s.may.join("、") : "（查表为主）"}
- 🚫 禁止编造 MUST、跳过 CP-0、跨 CP、脑算

## 设计范围

${s.scope}

## 数据完整性（CP-0）

| 级别 | 输入 | 来源 |
|------|------|------|
| MUST | ${s.cp0.split("、")[0]} | 见 data_contracts.PI.${s.sub} |
${s.cp0.includes("、") ? `| MUST/SHOULD | ${s.cp0.split("、").slice(1).join("、")} | 上游 Skill / 工艺 |\n` : ""}

缺失 MUST → DATA_REQUEST → \`⛔ [CP-0 完成]\`

## CP 协议

| CP | 步骤 | 停止 |
|----|------|------|
| **0** | 契约校验、MUST 检查 | ⛔ 等待 |
| **1** | ${s.cp1} | ⛔ 等待 |
| **2** | ${s.cp2} | ⛔ 等待 |
| **3** | ${s.cp3} | ⛔ 等待 |

## 输出契约

\`\`\`json
{
  "discipline": "PI",
  "output_type": "${s.output}",
  "payload": ${JSON.stringify(s.payload)},
  "citations": [{ "source_type": "standard", "source_id": "${s.std.split("、")[0]}", "clause": "—" }],
  "risk_level": "medium",
  "confidence": 0.85,
  "status": "draft"
}
\`\`\`
${eventSec}
## 设计要点

| 项目 | 要点 |
|------|------|
${pts}

## 任务卡 ${s.task}（PI-PLANT-BASE）

**MUST**：${s.cp0} · **流程**：CP-0 → 1 → 2 → 3 · **通过**：契约校验 + 人类确认每 CP

---

**版本**：V1.1 · 2026-06-12 · PI-D${s.d}
`;
}

const L3 = [
  {
    dir: "vdi-piping-hydraulics", code: "PIT1", name: "管道水力计算", deliverable: "PI-T01",
    called_by: ["管道材料等级", "管道表 Line List", "管道布置", "设备管道连接", "管道综合路由", "地下管沟布置"],
    calcs: [
      ["pipe_sizing", "PI-FLOW-001", "Q/A/v 管径选型"],
      ["pressure_drop", "PI-FLOW-004", "沿程+局部压降"],
      ["reynolds", "PI-FLOW-002", "雷诺数"],
    ],
    example: { calc_type: "pipe_sizing", flow_m3s: 0.05, velocity_ms: 2.0, dn_mm: 180 },
  },
  {
    dir: "vdi-piping-stress-calc", code: "PIT2", name: "管道应力计算", deliverable: "PI-T02",
    called_by: ["管道支架设计", "管道应力分析"],
    calcs: [
      ["thermal_expansion", "PI-STR-001", "热膨胀量"],
      ["allowable_stress", "PI-STR-002", "许用应力"],
      ["support_load", "PI-STR-003", "支架荷载"],
    ],
    example: { calc_type: "thermal_expansion", delta_T_C: 120, length_m: 30, alpha: 1.2e-5 },
  },
  {
    dir: "vdi-piping-corrosion-calc", code: "PIT3", name: "管道腐蚀计算", deliverable: "PI-T03",
    called_by: ["管道材料等级", "阀门与特殊件选用"],
    calcs: [
      ["corrosion_allowance", "PI-COR-001", "腐蚀裕量"],
      ["remaining_life", "PI-COR-002", "剩余寿命"],
    ],
    example: { calc_type: "corrosion_allowance", rate_mm_y: 0.1, design_life_y: 20 },
  },
  {
    dir: "vdi-piping-vibration-calc", code: "PIT4", name: "管道振动计算", deliverable: "PI-T04",
    called_by: ["管道布置", "管道支架设计"],
    calcs: [
      ["mechanical_vibration", "PI-VIB-001", "机械振动 screening"],
      ["water_hammer", "PI-VIB-002", "水锤初算"],
    ],
    example: { calc_type: "mechanical_vibration", line_id: "1002-P-001", velocity_ms: 2.5 },
  },
  {
    dir: "vdi-piping-weight-calc", code: "PIT5", name: "管道重量与荷载", deliverable: "PI-T05",
    called_by: ["管架管廊布置", "管道支架设计"],
    calcs: [
      ["pipe_weight", "PI-VOL-001", "管道自重"],
      ["fluid_weight", "PI-VOL-002", "介质重"],
    ],
    example: { calc_type: "pipe_weight", dn_mm: 150, length_m: 12, insulation_mm: 50 },
  },
  {
    dir: "vdi-piping-data-mgmt", code: "PIT6", name: "管道数据与 MTO", deliverable: "PI-T06",
    called_by: ["管道表 Line List", "管道综合路由", "ISO 单线图管段图"],
    calcs: [
      ["mto_extract", "—", "材料量自 Line List/ISO"],
      ["test_package", "—", "试压包索引"],
    ],
    example: { calc_type: "mto_extract", line_ids: ["1001-P-001"], source: "line_list" },
  },
];

function l3(s) {
  const table = s.calcs.map(([t, id, desc]) => `| ${t} | ${id} | ${desc} |`).join("\n");
  return `---
name: ${s.name}
code: ${s.code}
description: ${s.name}。L2 调用的公式/MTO 调度器。触发：${s.calcs.map(c => c[0]).join("、")}。
metadata:
  vdi:
    discipline: PI
    sub_discipline: T
    role: 执行层
    level: 3
    deliverable_code: ${s.deliverable}
    called_by:
${s.called_by.map(c => `      - ${c}`).join("\n")}
    pilotdeck_workspace: /workspace/workspaces/管道组
    mcp_required:
      - vdi-knowledge
    standalone: false
---

# ${s.name}（三级 · ${s.deliverable}）

## 角色

公式/MTO **调度器**；\`vdi_search_formulas\` → \`vdi_calculate\`（discipline=piping）；**不产出**专业交付物。

## calc_type 映射

| calc_type | 公式 ID | 说明 |
|-----------|---------|------|
${table}

## 调用示例

\`\`\`json
${JSON.stringify(s.example, null, 2)}
\`\`\`

## 流程

1. 按 calc_type 查表 → 2. search_formulas → 3. calculate → 4. 写 evidence_tag → 5. 返回 L2

---

**版本**：V1.1 · 2026-06-12 · ${s.deliverable}
`;
}

for (const s of L2) {
  fs.mkdirSync(path.join(SKILLS, s.dir), { recursive: true });
  fs.writeFileSync(path.join(SKILLS, s.dir, "SKILL.md"), l2(s));
  console.log("L2 V1.1:", s.dir);
}

for (const s of L3) {
  fs.mkdirSync(path.join(SKILLS, s.dir), { recursive: true });
  fs.writeFileSync(path.join(SKILLS, s.dir, "SKILL.md"), l3(s));
  console.log("L3 V1.1:", s.dir);
}

console.log("Done");
