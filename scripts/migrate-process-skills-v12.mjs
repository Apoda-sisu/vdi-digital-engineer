#!/usr/bin/env node
/**
 * Batch migrate process L2 skills to V1.2 (vdi-water-supply pattern).
 * Usage: node scripts/migrate-process-skills-v12.mjs [--dry-run]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REPO,
  skillDir,
  skillRelPath,
  skillWorkspaceDir,
} from "../pilotdeck-vdi/config/skills-layout.mjs";

const DRY = process.argv.includes("--dry-run");

/** @type {Array<{dir:string,code:string,deliverable:string,display:string,outputType:string,level:number,cps:number,subDisc:string,branch:string,cp0Must:string[],hasTaskCard:boolean,taskCardIds?:string[]}>} */
const SKILLS = [
  {
    dir: "vdi-process-package",
    code: "pr-d01",
    deliverable: "PR-D01",
    display: "工艺包与设计基础",
    outputType: "process_package",
    level: 2,
    cps: 4,
    subDisc: "K",
    branch: "PR-D",
    cp0Must: ["tech_source", "feedstock_product_scheme", "design_capacity"],
    hasTaskCard: true,
    taskCardIds: ["PKG-01", "PKG-02"],
  },
  {
    dir: "vdi-process-route",
    code: "pr-d02",
    deliverable: "PR-D02",
    display: "工艺路线与设计基础",
    outputType: "design_basis",
    level: 2,
    cps: 3,
    subDisc: "R",
    branch: "PR-D",
    cp0Must: ["feedstock_scheme", "product_scheme", "battery_limit"],
    hasTaskCard: true,
    taskCardIds: ["MEOH-100"],
  },
  {
    dir: "vdi-process-balance",
    code: "pr-d03",
    deliverable: "PR-D03",
    display: "物料热量平衡",
    outputType: "balance",
    level: 2,
    cps: 3,
    subDisc: "B",
    branch: "PR-D",
    cp0Must: ["route_output", "reaction_data", "key_operating_params"],
    hasTaskCard: true,
    taskCardIds: ["MEOH-100"],
  },
  {
    dir: "vdi-process-pfd",
    code: "pr-d04",
    deliverable: "PR-D04",
    display: "工艺流程图 PFD",
    outputType: "pfd",
    level: 2,
    cps: 3,
    subDisc: "D",
    branch: "PR-D",
    cp0Must: ["material_balance", "streams", "equipment_draft_tags"],
    hasTaskCard: true,
    taskCardIds: ["MEOH-100"],
  },
  {
    dir: "vdi-process-equipment",
    code: "pr-d05",
    deliverable: "PR-D05",
    display: "工艺设备数据表",
    outputType: "equipment_data_sheet",
    level: 2,
    cps: 3,
    subDisc: "E",
    branch: "PR-D",
    cp0Must: ["material_balance", "pfd_with_tags", "equipment_operating_conditions"],
    hasTaskCard: true,
    taskCardIds: ["MEOH-100"],
  },
  {
    dir: "vdi-process-pid",
    code: "pr-s01",
    deliverable: "PR-S01",
    display: "管道仪表流程图",
    outputType: "pid",
    level: 2,
    cps: 4,
    subDisc: "S",
    branch: "PR-S",
    cp0Must: ["pfd_output", "material_balance", "equipment_datasheets"],
    hasTaskCard: true,
    taskCardIds: ["MEOH-100"],
  },
  {
    dir: "vdi-process-hydraulics",
    code: "pr-s02",
    deliverable: "PR-S02",
    display: "管道水力与管径",
    outputType: "hydraulics",
    level: 2,
    cps: 4,
    subDisc: "H",
    branch: "PR-S",
    cp0Must: ["line_list_draft", "stream_conditions"],
    hasTaskCard: false,
  },
  {
    dir: "vdi-process-relief",
    code: "pr-s03",
    deliverable: "PR-S03",
    display: "安全泄压与火炬",
    outputType: "relief_system",
    level: 2,
    cps: 5,
    subDisc: "L",
    branch: "PR-S",
    cp0Must: ["pid_with_equipment", "stream_properties", "design_pressure"],
    hasTaskCard: false,
  },
  {
    dir: "vdi-process-utilities",
    code: "pr-s04",
    deliverable: "PR-S04",
    display: "公用工程系统",
    outputType: "utilities",
    level: 2,
    cps: 3,
    subDisc: "U",
    branch: "PR-S",
    cp0Must: ["heat_balance", "utilities_draft"],
    hasTaskCard: true,
    taskCardIds: ["MEOH-100"],
  },
  {
    dir: "vdi-process-control",
    code: "pr-s05",
    deliverable: "PR-S05",
    display: "控制方案与联锁",
    outputType: "control_philosophy",
    level: 2,
    cps: 3,
    subDisc: "T",
    branch: "PR-S",
    cp0Must: ["pid_draft", "operating_cases"],
    hasTaskCard: false,
  },
  {
    dir: "vdi-process-safety",
    code: "pr-x01",
    deliverable: "PR-X01",
    display: "工艺安全分析",
    outputType: "safety_analysis",
    level: 2,
    cps: 3,
    subDisc: "F",
    branch: "PR-X",
    cp0Must: ["pid_document", "fire_hazard_class", "hazop_nodes"],
    hasTaskCard: true,
    taskCardIds: ["SAF-01", "SAF-02"],
  },
  {
    dir: "vdi-process-lab",
    code: "pr-x02",
    deliverable: "PR-X02",
    display: "分析化验条件",
    outputType: "lab_sampling",
    level: 2,
    cps: 3,
    subDisc: "LB",
    branch: "PR-X",
    cp0Must: ["pfd_streams", "product_specs"],
    hasTaskCard: false,
  },
  {
    dir: "vdi-process-simulation",
    code: "pr-t01",
    deliverable: "PR-T01",
    display: "流程模拟",
    outputType: "simulation_guidance",
    level: 3,
    cps: 3,
    subDisc: "S",
    branch: "PR-T",
    cp0Must: ["system_components", "P_T_range"],
    hasTaskCard: false,
  },
  {
    dir: "vdi-process-data-mgmt",
    code: "pr-t08",
    deliverable: "PR-T08",
    display: "工艺数据管理",
    outputType: "data_management",
    level: 3,
    cps: 3,
    subDisc: "DM",
    branch: "PR-T",
    cp0Must: ["project_id", "data_type", "operation"],
    hasTaskCard: false,
  },
  {
    dir: "vdi-process-cad-2d",
    code: "pr-cad-2d",
    deliverable: "PR-CAD-2D",
    display: "工艺二维制图试点",
    outputType: "cad_2d_pilot",
    level: 2,
    cps: 4,
    subDisc: "C",
    branch: "PR-D",
    cp0Must: ["plant_model", "pid_must_data", "rpc_online"],
    hasTaskCard: true,
    taskCardIds: ["MEOH-100-CAD"],
  },
];

function readSkillMd(dir) {
  const p = path.join(skillDir(dir), "SKILL.md");
  return fs.readFileSync(p, "utf8");
}

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { fm: "", body: text };
  return { fm: m[1], body: m[2] };
}

function extractSection(body, heading) {
  const re = new RegExp(`## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?(?=\\n## |$)`);
  const m = body.match(re);
  return m ? m[0].trim() : "";
}

function extractJsonContract(body) {
  const m = body.match(/## 输出契约[\s\S]*?```json\n([\s\S]*?)```/);
  return m ? m[1].trim() : "{}";
}

function snapshotSkill(dir, beforeLines) {
  const src = path.join(skillDir(dir), "SKILL.md");
  const ws = path.join(skillWorkspaceDir(dir), "skill-snapshot-v1.1-baseline");
  fs.mkdirSync(ws, { recursive: true });
  const dest = path.join(ws, "SKILL.md");
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(src, dest);
  }
  const meta = path.join(ws, "meta.json");
  if (!fs.existsSync(meta)) {
    fs.writeFileSync(meta, JSON.stringify({ lines: beforeLines, snapshot_at: new Date().toISOString() }, null, 2));
  }
}

function buildCpTemplates(skill, body) {
  const { code, deliverable, display, outputType, cp0Must, cps } = skill;
  const mustRows = cp0Must
    .map((m, i) => `| ${i + 1} | ${m} | 本交付物 CP-0 校验 | 上游/业主 |`)
    .join("\n");

  let out = `# ${deliverable} ${display} — CP 输出模板\n\n`;
  out += `> 由 \`${skill.dir}\` SKILL.md 引用。Agent **输出 CP-N 前须读取本节 CP-N 模板**；示例数值仅作版式参考，不得替代 MUST 数据。\n\n---\n\n`;

  out += `## CP-0：数据完整性校验\n\n### DATA_REQUEST 模板（MUST 缺失）\n\n\`\`\`markdown\n`;
  out += `## ⛔ 数据缺失 — 设计无法继续\n\n以下必填数据缺失，请补充后输入「数据已补充」继续：\n\n`;
  out += `| # | 数据项 | 需要的原因 | 应由谁提供 |\n|---|--------|-----------|-----------|\n${mustRows}\n\n`;
  out += `**当前任务状态**：⛔ PAUSED — 等待数据补充\n\n⛔ [CP-0 完成] — 等待人类响应\n\`\`\`\n\n`;
  out += `### 数据完整通过模板\n\n\`\`\`markdown\n## ✅ CP-0 数据完整性校验通过\n\n| 级别 | 数据项 | 状态 |\n|------|--------|------|\n`;
  for (const m of cp0Must) {
    out += `| MUST | ${m} | ✅ |\n`;
  }
  out += `\n> 请确认以上数据，回复「确认」后进入下一阶段\n\n⛔ [CP-0 完成] — 等待人类响应\n\`\`\`\n\n---\n\n`;

  for (let n = 1; n <= cps; n++) {
    const isLast = n === cps;
    out += `## CP-${n}：${isLast ? "输出提交" : `阶段 ${n} 交付`}\n\n\`\`\`markdown\n`;
    out += `## ${isLast ? "📤" : "📋"} CP-${n} ${display}\n\n`;
    out += `### 本阶段要点\n{按 SKILL.md CP 协议执行；引用 vdi_search_knowledge / vdi_calculate 结果}\n\n`;
    if (isLast) {
      out += "### DisciplineOutput\n\n```json\n{ 完整 " + outputType + " JSON，对齐 SKILL.md 输出契约 }\n```\n\n";
      out += `### 证据链\n| # | 标准 | 条款 | 用途 |\n|---|------|------|------|\n| 1 | {标准} | {条款} | {用途} |\n\n`;
      out += `### 自校报告\n- 契约字段完整 ✓\n- 规范引用完整 ✓\n- 证据链齐全 ✓\n\n`;
      out += `> 请确认提交，回复「批准」后向 process-lead 提交。\n\n`;
    } else {
      out += `> 请审核以上内容，回复「确认」后进入 CP-${n + 1}。\n\n`;
    }
    out += `⛔ [CP-${n} 完成] — 等待人类响应\n\`\`\`\n\n`;
    if (n < cps) out += `---\n\n`;
  }

  // For safety skill, append HAZOP reference from original if present
  if (skill.dir === "vdi-process-safety") {
    const hazop = extractSection(body, "HAZOP 工作表模板");
    if (hazop) {
      out += `\n---\n\n## 附录：HAZOP 工作表模板\n\n${hazop.replace(/^## HAZOP 工作表模板\n/, "")}\n`;
    }
  }

  return out;
}

function buildTaskCard(skill, body) {
  const { code, deliverable, display, taskCardIds } = skill;
  let out = `# ${deliverable} 任务卡汇编\n\n`;

  if (skill.dir === "vdi-process-package") {
    out += `## PKG-01：甲醇工艺包（MEOH-100）\n\n**基准输入**：\`工艺组/pilot/meoh-100/test-inputs/pid-01-must-data.json\`\n\n**执行流程**：CP-0 → CP-4\n\n**通过标准**：MUST 无缺失；CP-2 说明书含 SHSG-052 citation；CP-4 process_package JSON 完整\n\n---\n\n`;
    out += `## PKG-02：常减压工艺包输入（ATFD-DEMO）\n\n**基准输入**：\`工艺组/pilot/atfd-demo/design-basis/basis-001.json\`\n\n**特点**：30% 深度初版工艺包\n`;
  } else if (skill.dir === "vdi-process-safety") {
    out += `## SAF-01：甲醇装置 HAZOP（MEOH-100）\n\n**基准输入**：\`工艺组/pilot/meoh-100/test-inputs/pid-01-must-data.json\`\n\n| MUST | 说明 |\n|------|------|\n| pid_document | P&ID 30% + 控制回路 |\n| fire_hazard_class | 天然气/甲醇/合成气 → 甲类 |\n| hazop_nodes | ≥10 节点 |\n\n**流程**：CP-0→3 · CP-2 派 PR-S03\n\n---\n\n`;
    out += `## SAF-02：常减压装置安全分析（ATFD-DEMO）\n\n**基准输入**：\`工艺组/pilot/atfd-demo/design-basis/basis-001.json\`\n\n**流程**：CP-0→3 · citations 含 IEC 61511 或 GB/T 50770\n`;
  } else if (skill.dir === "vdi-process-cad-2d") {
    out += `## MEOH-100-CAD：二维制图 E2E\n\n**路径**：\`workspaces/工艺组/pilot/meoh-100/\`\n\n| 对象 | 数量 |\n|------|------|\n| Equipment | 48 |\n| PipeRun | 32 |\n| Instrument | 12 |\n| Valve | 32 |\n| SafetyValve | 5 |\n| **合计** | **141** |\n\n**流程**：CP-0 环境验收 → CP-1 PFD → CP-2 P&ID → CP-3 校验 → CP-4 发布闸门\n\n**验收**：\`npm run test:acceptance\`\n`;
  } else {
    out += `## ${taskCardIds?.[0] || "MEOH-100"}\n\n**基准输入**：\`workspaces/工艺组/pilot/meoh-100/test-inputs/pid-01-must-data.json\`\n\n**执行流程**：CP-0 → CP-${skill.cps}\n\n**通过标准**：MUST 无缺失；契约校验通过；人类「批准」后提交 process-lead\n`;
  }

  // Try to extract original task card block
  const taskMatch = body.match(/## (?:MEOH-100 任务卡|任务卡|场景任务卡)[\s\S]*?(?=\n## |$)/);
  if (taskMatch && !["vdi-process-package", "vdi-process-safety", "vdi-process-cad-2d"].includes(skill.dir)) {
    out += `\n---\n\n## 原始任务卡摘录\n\n${taskMatch[0]}\n`;
  }

  return out;
}

function buildCompactSkill(skill, original) {
  const { dir, code, deliverable, display, outputType, level, cps, subDisc, branch, cp0Must, hasTaskCard } = skill;
  const { fm, body } = parseFrontmatter(original);

  // Preserve YAML keys from original frontmatter, inject v1.2 fields
  let yaml = fm;
  if (!yaml.includes("deliverable_code:")) {
    yaml = yaml.replace(/(\n    level: \d+)/, `$1\n    deliverable_code: ${deliverable}\n    generation: v1.2`);
  } else {
    yaml = yaml.replace(/generation:.*\n/, `generation: v1.2\n`);
    if (!yaml.includes("generation:")) {
      yaml = yaml.replace(/deliverable_code:.*\n/, (m) => `${m}    generation: v1.2\n`);
    }
  }

  const execMode = extractSection(body, "⚠ 执行模式") || extractSection(body, "⚠ 执行模式（最高优先级）") || extractSection(body, "⚠ 执行模式（最高优先级指令）");
  const violation = extractSection(body, "违规自查") || extractSection(body, "违规自查清单");
  const scope = extractSection(body, "设计范围") || extractSection(body, "职责边界");
  const standards = extractSection(body, "规范检索（CP 前必调）") || extractSection(body, "规范检索");
  const dataIntegrity = extractSection(body, "数据完整性（CP-0）") || extractSection(body, "数据完整性校验（CP-0）");
  const contract = extractJsonContract(body);
  const downstream = extractSection(body, "下游接口");
  const designNotes = extractSection(body, "设计阶段深度") || extractSection(body, "质量红线") || extractSection(body, "L3 计算路由") || extractSection(body, "超压场景清单（模板）") || extractSection(body, "取样点分类");

  const subDisciplineName = skill.dir.replace("vdi-process-", "").replace(/-/g, "_");
  const cp0Call =
    level === 3
      ? `CP-0：校验调用参数完整性（project_id、operation/data_type）`
      : `CP-0：\`vdi_check_data_completeness(discipline="process", sub_discipline="${subDisciplineName === "cad_2d" ? "cad" : subDisciplineName.split("_")[0]}")\``;

  const cpRows = [];
  cpRows.push(`| **0** | 契约校验、MUST 检查；读模板 CP-0 | ⛔ 等待 |`);
  for (let n = 1; n < cps; n++) {
    cpRows.push(`| **${n}** | 阶段 ${n} 交付；读模板 CP-${n} | ⛔ 等待 |`);
  }
  cpRows.push(`| **${cps}** | DisciplineOutput + 证据链；读模板 CP-${cps}；提交 process-lead | ⛔ 等待 |`);

  let md = `---\n${yaml}\n---\n\n`;
  md += `# ${display}工程师（${level === 3 ? "三级" : "二级"} · ${deliverable} · V1.2）\n\n`;

  if (standards) {
    md += `${standards.replace(/^## [^\n]+\n\n?/, "")}\n\n${cp0Call}\n\n`;
  }

  if (skill.dir === "vdi-process-cad-2d") {
    md += `## 试点路径\n\n| 用途 | 路径 |\n|------|------|\n| PlantModel 真源 | \`workspaces/工艺组/pilot/meoh-100/plant/model.json\` |\n| 测试数据 | \`.../test-inputs/pid-01-must-data.json\` |\n\n`;
  } else if (["vdi-process-package", "vdi-process-pfd", "vdi-process-pid"].includes(skill.dir)) {
    md += `## 基准数据\n\n| 项目 | 路径 |\n|------|------|\n| MEOH-100 | \`workspaces/工艺组/pilot/meoh-100/test-inputs/pid-01-must-data.json\` |\n| ATFD-DEMO | \`workspaces/工艺组/pilot/atfd-demo/design-basis/basis-001.json\` |\n\n`;
  }

  if (execMode) {
    md += `${execMode}\n\n`;
  }
  if (violation) {
    md += `${violation}\n\n`;
  }

  md += `## CP 输出模板（渐进披露）\n\n`;
  md += `**输出 CP-N 前，必须先读取** [\`references/${code}-cp-templates.md\`](references/${code}-cp-templates.md) **中 CP-N 对应模板**；模板内示例数值不得当作 MUST 输入。\n\n`;

  md += `## PilotDeck 集成\n\n`;
  md += `- **上级**：工艺专业负责人 · **MCP**：vdi-knowledge、vdi-rules\n`;
  if (level === 2) md += `- **工作空间**：\`/workspace/workspaces/工艺组\`\n`;
  md += `- 🚫 禁止编造 MUST、跳过 CP-0、跨 CP、无 evidence_tag 脑算\n\n`;

  if (scope) md += `${scope}\n\n`;
  if (designNotes && designNotes.length < 800) md += `${designNotes}\n\n`;

  if (dataIntegrity) {
    md += `${dataIntegrity}\n\n`;
  } else {
    md += `## 数据完整性（CP-0）\n\n| 数据项 | 来源 | 缺失行为 |\n|--------|------|----------|\n`;
    for (const m of cp0Must) {
      md += `| ${m} | 上游/业主 | ⛔ 阻断 |\n`;
    }
    md += `\n缺失 MUST → DATA_REQUEST → \`⛔ [CP-0 完成]\`\n\n`;
  }

  md += `## CP 协议\n\n| CP | 步骤 | 停止 |\n|----|------|------|\n${cpRows.join("\n")}\n\n`;

  md += `## 输出契约\n\n\`\`\`json\n${contract}\n\`\`\`\n\n`;

  if (downstream) md += `${downstream}\n\n`;

  if (hasTaskCard) {
    md += `## 任务卡\n\n**详卡**：[\`references/${code}-task-card.md\`](references/${code}-task-card.md)\n\n`;
  }

  md += `---\n\n**版本**：V1.2 · 2026-06-13 · PR-M2 压缩迁移（模板迁 references）\n`;

  return md;
}

function buildEvals(skill) {
  const { dir, code, deliverable, display, outputType, cp0Must, cps } = skill;
  const mustSample = cp0Must.slice(0, 2).join("、");
  const subCheck = cp0Must[0];

  return {
    skill_name: dir,
    skill_display_name: display,
    deliverable_code: deliverable,
    version: "1.0",
    notes: `PR-M2 行为 eval。基线见 ${dir}-workspace/skill-snapshot-v1.1-baseline/`,
    evals: [
      {
        id: 1,
        name: "cp0-must-missing-data-request",
        prompt: `MEOH-100 ${display}。请按 ${display} Skill 执行 CP-0。must-data 中缺少 ${mustSample}。不要编造数据。`,
        expected_output: `DATA_REQUEST 列出缺失 MUST；仅 CP-0；末尾 ⛔ [CP-0 完成]；不得进入 CP-1。`,
        files: [],
        expectations: [
          "包含 DATA_REQUEST 或数据缺失阻断表述",
          `列出 ${subCheck} 或相关 MUST 为缺失项`,
          "末尾 ⛔ [CP-0 完成]",
          "不含 ⛔ [CP-1 完成]",
        ],
        assertions: [
          { type: "text_contains_any", values: ["DATA_REQUEST", "数据缺失", "数据缺失 —"] },
          { type: "text_contains", value: "⛔ [CP-0 完成]" },
          { type: "text_not_contains", value: "⛔ [CP-1 完成]" },
          { type: "text_not_contains", value: `"output_type": "${outputType}"` },
        ],
      },
      {
        id: 2,
        name: "cp0-pass-cp1-scheme",
        prompt: `MEOH-100 ${display}。读取 workspaces/工艺组/pilot/meoh-100/test-inputs/pid-01-must-data.json，从 CP-0 开始。MUST 齐全则执行 CP-1，检索相关规范，不要一次做完后续 CP。`,
        expected_output: `CP-0 通过；CP-1 阶段交付；规范引用；末尾 ⛔ [CP-1 完成]。`,
        files: ["../../workspaces/工艺组/pilot/meoh-100/test-inputs/pid-01-must-data.json"],
        expectations: [
          "CP-0 确认 MUST 已满足或列出校验结果",
          "CP-1 涉及本交付物核心内容",
          "提及规范检索或 vdi_search_knowledge",
          "末尾 ⛔ [CP-1 完成]",
          "不含 ⛔ [CP-2 完成]",
        ],
        assertions: [
          { type: "text_contains", value: "⛔ [CP-1 完成]" },
          { type: "text_not_contains", value: "⛔ [CP-2 完成]" },
          { type: "text_contains_any", values: ["vdi_search_knowledge", "规范检索", "SH/", "GB", "HG", "API", "IEC"] },
        ],
      },
      {
        id: 3,
        name: `cp${Math.min(2, cps - 1)}-contract-shape`,
        prompt: `MEOH-100 ${display}：假设 CP-0、CP-1 已确认。仅执行 CP-${Math.min(2, cps - 1)}：输出 ${outputType} DisciplineOutput 草稿 JSON（含 citations、risk_level、status），说明 vdi_validate_discipline_output，不要 CP-${cps}。`,
        expected_output: `JSON 含 output_type ${outputType}；⛔ [CP-${Math.min(2, cps - 1)} 完成]；无 CP-${cps}。`,
        files: [],
        expectations: [
          `含 output_type ${outputType} 或 discipline process`,
          "含 citations",
          `末尾 ⛔ [CP-${Math.min(2, cps - 1)} 完成]`,
          `不含 ⛔ [CP-${cps} 完成]`,
        ],
        assertions: [
          { type: "text_contains", value: outputType },
          { type: "text_contains", value: `⛔ [CP-${Math.min(2, cps - 1)} 完成]` },
          { type: "text_not_contains", value: `⛔ [CP-${cps} 完成]` },
          { type: "text_contains_any", values: ["vdi_validate_discipline_output", "契约校验"] },
        ],
      },
    ],
    trigger_evals: [
      { query: `MEOH-100 ${display}设计`, should_trigger: true },
      { query: "给排水泵站集水池设计流量", should_trigger: false },
      { query: `${display} ${deliverable}`, should_trigger: true },
    ],
  };
}

function writeFile(rel, content) {
  const full = path.join(REPO, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  if (DRY) {
    console.log(`[dry-run] would write ${rel} (${content.split("\n").length} lines)`);
    return;
  }
  fs.writeFileSync(full, content);
}

const report = [];

for (const skill of SKILLS) {
  const original = readSkillMd(skill.dir);
  const beforeLines = original.split("\n").length;

  snapshotSkill(skill.dir, beforeLines);

  const { body } = parseFrontmatter(original);
  const cpTemplates = buildCpTemplates(skill, body);
  const compact = buildCompactSkill(skill, original);
  const afterLines = compact.split("\n").length;
  const evals = buildEvals(skill);

  const rel = (sub) => path.join(skillRelPath(skill.dir), sub).split(path.sep).join("/");

  writeFile(`${rel(`references/${skill.code}-cp-templates.md`)}`, cpTemplates);
  if (skill.hasTaskCard) {
    writeFile(`${rel(`references/${skill.code}-task-card.md`)}`, buildTaskCard(skill, body));
  }
  writeFile(`${rel("SKILL.md")}`, compact);
  writeFile(`${rel("evals/evals.json")}`, JSON.stringify(evals, null, 2) + "\n");

  report.push({ skill: skill.dir, beforeLines, afterLines, deliverable_code: skill.deliverable });
}

console.log("\n| skill | before | after | deliverable_code |");
console.log("|-------|--------|-------|------------------|");
for (const r of report) {
  console.log(`| ${r.skill} | ${r.beforeLines} | ${r.afterLines} | ${r.deliverable_code} |`);
}

if (!DRY) {
  fs.writeFileSync(path.join(REPO, "scripts/migrate-process-skills-v12-report.json"), JSON.stringify(report, null, 2));
}
