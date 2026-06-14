#!/usr/bin/env node
/**
 * 生成管道专业 L2/L3 Skill 骨架（Sprint 11-17）
 * 用法: node scripts/generate-piping-skills.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS = path.join(ROOT, "skills");

const L3 = [
  {
    dir: "vdi-piping-hydraulics", code: "PIT1", name: "管道水力计算", deliverable: "PI-T01",
    called_by: ["管道材料等级", "管道表 Line List", "管道布置", "设备管道连接", "管道综合路由", "地下管沟布置"],
    calcTypes: [
      ["pipe_sizing", "PI-FLOW-001", "PI-FLOW-003", "管径选型"],
      ["pressure_drop", "PI-FLOW-004", "PI-FLOW-005", "压降计算"],
      ["reynolds", "PI-FLOW-002", null, "雷诺数"],
    ],
  },
  {
    dir: "vdi-piping-stress-calc", code: "PIT2", name: "管道应力计算", deliverable: "PI-T02",
    called_by: ["管道支架设计", "管道应力分析"],
    calcTypes: [
      ["thermal_expansion", "PI-STR-001", null, "热膨胀"],
      ["allowable_stress", "PI-STR-002", null, "许用应力"],
      ["support_load", "PI-STR-003", null, "支架荷载"],
    ],
  },
  {
    dir: "vdi-piping-corrosion-calc", code: "PIT3", name: "管道腐蚀计算", deliverable: "PI-T03",
    called_by: ["管道材料等级", "阀门与特殊件选用"],
    calcTypes: [
      ["corrosion_allowance", "PI-COR-001", null, "腐蚀裕量"],
      ["remaining_life", "PI-COR-002", null, "剩余寿命"],
    ],
  },
  {
    dir: "vdi-piping-vibration-calc", code: "PIT4", name: "管道振动计算", deliverable: "PI-T04",
    called_by: ["管道布置", "管道支架设计"],
    calcTypes: [
      ["mechanical_vibration", "PI-VIB-001", null, "机械振动"],
      ["water_hammer", "PI-VIB-002", null, "水锤"],
    ],
  },
  {
    dir: "vdi-piping-weight-calc", code: "PIT5", name: "管道重量与荷载", deliverable: "PI-T05",
    called_by: ["管架管廊布置", "管道支架设计"],
    calcTypes: [
      ["pipe_weight", "PI-VOL-001", null, "管道自重"],
      ["fluid_weight", "PI-VOL-002", null, "介质重量"],
    ],
  },
  {
    dir: "vdi-piping-data-mgmt", code: "PIT6", name: "管道数据与 MTO", deliverable: "PI-T06",
    called_by: ["管道表 Line List", "管道综合路由", "ISO 单线图管段图"],
    calcTypes: [
      ["mto_extract", null, null, "MTO 提取"],
      ["test_package", null, null, "试压包划分"],
    ],
  },
];

const L2 = [
  { dir: "vdi-piping-material-class", code: "PIM", sub: "M", d: "01", name: "管道材料等级", output: "material_class", may: ["管道腐蚀计算"], scope: "管道材料等级（PMS）、壁厚、腐蚀裕量", std: "SH/T 3059、GB 50316", task: "PI-01a", fields: ["classes"] },
  { dir: "vdi-piping-line-list", code: "PIL", sub: "L", d: "02", name: "管道表 Line List", output: "line_list", may: ["管道水力计算", "管道数据与 MTO"], scope: "Line List 编制、管径校核、命名规则", std: "GB/T 50933、HG/T 20519", task: "PI-01b", fields: ["lines"] },
  { dir: "vdi-piping-layout", code: "PIY", sub: "Y", d: "03", name: "管道布置", output: "piping_layout", may: ["管道水力计算", "管道振动计算"], scope: "平面路由、标高竖向、管廊接口", std: "HG/T 20519-4", task: "PI-02", fields: ["plan_sheets", "elevation_sheets", "revision"], event: "piping_layout.updated" },
  { dir: "vdi-piping-equipment-connect", code: "PIN", sub: "N", d: "04", name: "设备管道连接", output: "equipment_piping", may: ["管道水力计算"], scope: "管口方位、泵/塔接管、检修空间", std: "HG/T 20519-4", task: "PI-04a", fields: ["nozzle_connections"], event: "equipment_piping.updated" },
  { dir: "vdi-piping-rack-layout", code: "PIR", sub: "R", d: "05", name: "管架管廊布置", output: "rack_layout", may: ["管道重量与荷载"], scope: "管廊坐标、层位、路权", std: "HG/T 20519-4", task: "PI-04b", fields: ["racks"], event: "rack_layout.updated" },
  { dir: "vdi-piping-routing", code: "PIG", sub: "G", d: "06", name: "管道综合路由", output: "piping_design", may: ["管道水力计算", "管道振动计算", "管道数据与 MTO"], scope: "碰撞协调、设计说明、路由汇总", std: "HG/T 20519-4", task: "PI-02b", fields: ["routing_summary", "clash_report"] },
  { dir: "vdi-piping-support", code: "PIU", sub: "U", d: "07", name: "管道支架设计", output: "support_design", may: ["管道应力计算", "管道振动计算", "管道重量与荷载"], scope: "支架选型、荷载计算、特殊支架", std: "HG/T 20645", task: "PI-03a", fields: ["supports", "loads_kN"], event: "piping_support.updated" },
  { dir: "vdi-piping-stress", code: "PIS", sub: "S", d: "08", name: "管道应力分析", output: "stress_analysis", may: ["管道应力计算"], scope: "临界管系、CAESAR 分析、应力报告", std: "HG/T 20645、GB 50316", task: "PI-03b", fields: ["critical_lines", "recommendations"], event: "stress_analysis.completed" },
  { dir: "vdi-piping-insulation", code: "PII", sub: "I", d: "09", name: "绝热伴热设计", output: "insulation_tracing", may: [], scope: "绝热厚度、伴热方式、Line List 字段", std: "GB 50264", task: "PI-05a", fields: ["insulation_lines", "tracing_lines"], event: "insulation_tracing.updated" },
  { dir: "vdi-piping-isometric", code: "PIO", sub: "O", d: "10", name: "ISO 单线图管段图", output: "isometric_spool", may: ["管道数据与 MTO"], scope: "轴测图、管段图、试压包", std: "SH/T 3503", task: "PI-05b", fields: ["isometrics", "test_packages"], event: "isometric_spool.updated" },
  { dir: "vdi-piping-valve-spec", code: "PIV", sub: "V", d: "11", name: "阀门与特殊件选用", output: "valve_specialty", may: ["管道腐蚀计算"], scope: "阀门型式、VDS、特殊件", std: "SH/T 3059", task: "PI-05c", fields: ["valves", "specialty_items"], event: "valve_spec.updated" },
  { dir: "vdi-piping-underground", code: "PIB", sub: "B", d: "12", name: "地下管沟布置", output: "underground_piping", may: ["管道水力计算"], scope: "埋地管线、管沟、覆土深度", std: "GB 50316", task: "PI-05d", fields: ["underground_routes", "trench_sections"], event: "underground_piping.updated" },
];

function l3Skill(s) {
  const calcTable = s.calcTypes.map(([t, id1, id2, desc]) =>
    `| ${t} | ${id1 || "—"} | ${desc} |`
  ).join("\n");
  return `---
name: ${s.name}
code: ${s.code}
description: ${s.name}引擎。被二级 Skill 调用执行管道专业原子计算。触发场景：${s.calcTypes.map(c => c[3]).join("、")}。
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
    triggers:
${s.calcTypes.map(c => `      - ${c[3]}`).join("\n")}
---

# ${s.name}（三级 · ${s.deliverable}）

## 角色定位

本 Skill 是**公式调度器**，被二级 Skill 调用。所有计算通过 \`vdi_search_formulas\` → \`vdi_calculate\`（discipline=piping）执行，禁止脑算。不产出专业交付物。

## calc_type → 公式 ID

| calc_type | 公式 ID | 说明 |
|-----------|---------|------|
${calcTable}

## 调用流程

1. 根据 calc_type 查上表
2. \`vdi_search_formulas(query="...", discipline="piping")\`
3. \`vdi_calculate(formula_id="...", inputs={...})\`
4. 将 \`audit.evidence_tag\` 写入 L2 输出引用

## 使用方式

二级 Skill 在 CP-2 调用 \`/${s.name}\` 并整合结果到 payload。

---

**版本**：V1.0 · Sprint 11-14 · ${s.deliverable}
`;
}

function l2Skill(s) {
  const mayYaml = s.may.length ? s.may.map(m => `      - ${m}`).join("\n") : "      []";
  const payloadExample = s.fields.reduce((o, f) => ({ ...o, [f]: f === "classes" ? [{ class_id: "A1", max_P_MPa: 1.6, max_T_C: 200, material: "20#" }] : f === "lines" ? [{ line_id: "1001-P-001", from: "V-101", to: "P-101", dn: 100 }] : [] }), {});
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

- \`${s.name}\` → ${s.std}
- CP-0 调用 \`vdi_check_data_completeness(discipline="piping", sub_discipline="${s.sub.toLowerCase()}")\`

## 基准数据

\`\`\`
workspaces/管道组/pilot/plant-base/design-basis/must-data.json → piping 段
project_id: PI-PLANT-BASE
\`\`\`

## ⚠ 执行模式

1. **每次回复只执行一个 CP**
2. **每个 CP 末尾输出 \`⛔ [CP-N 完成] — 等待人类响应\`** 并停止
3. **MUST 缺失 → DATA_REQUEST 并停止**

## PilotDeck 集成

- **上级**：管道专业负责人
- **必调 MCP**：vdi-knowledge、vdi-rules
- **禁止**：编造 MUST 数据、跳过 CP-0、脑算

## 设计范围

${s.scope}

## 必须遵守的规范

- **${s.std.split("、")[0]}** 及相关条文
- **VDI-RED-002** 证据链引用规范

## 数据完整性校验（CP-0）

调用 \`vdi_check_data_completeness(discipline="piping", sub_discipline="${s.sub}")\`，对照 \`data_contracts.PI.${s.sub}\`。

## 工具调用协议

### CP-0：数据完整性校验

检查 MUST 输入 → DATA_REQUEST 或完整性报告 → \`⛔ [CP-0 完成] — 等待人类响应\`

### CP-1：方案确定

检索规范 \`vdi_search_knowledge(discipline="piping", query="...")\` → 方案摘要 → \`⛔ [CP-1 完成] — 等待人类响应\`

### CP-2：详细设计

${s.may.length ? `调用三级：${s.may.join("、")}` : "查表/布置设计"} → \`vdi_validate_discipline_output\` → \`⛔ [CP-2 完成] — 等待人类响应\`

### CP-3：输出与提交

生成 DisciplineOutput → 自校 → 提交 piping-lead → \`⛔ [CP-3 完成] — 等待人类响应\`

## 输出契约

\`\`\`json
{
  "discipline": "PI",
  "output_type": "${s.output}",
  "payload": ${JSON.stringify(payloadExample, null, 2).split("\n").join("\n  ")},
  "citations": [{ "source_type": "standard", "source_id": "${s.std.split("、")[0]}", "clause": "—" }],
  "risk_level": "medium",
  "confidence": 0.85,
  "status": "draft"
}
\`\`\`

${s.event ? `\n## 事件发布\n\n完成后发布 \`${s.event}\`。\n` : ""}
## 场景任务卡 ${s.task}（PI-PLANT-BASE）

**输入**：must-data.json \`piping\` 段 + 上游工艺/总图提资  
**流程**：CP-0 → CP-1 → CP-2 → CP-3  
**通过标准**：\`vdi_validate_discipline_output\` 通过，required_payload_fields 齐全

---

**版本**：V1.0 · Sprint 11-17 · PI-D${s.d}
`;
}

for (const s of L3) {
  const dir = path.join(SKILLS, s.dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), l3Skill(s));
  console.log("L3:", s.dir);
}

for (const s of L2) {
  const dir = path.join(SKILLS, s.dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), l2Skill(s));
  console.log("L2:", s.dir);
}

console.log("Done:", L2.length, "L2 +", L3.length, "L3");
