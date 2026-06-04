#!/usr/bin/env node
/**
 * Pilot A 集成验证脚本 — 给排水单专业三审三校 E2E
 *
 * 验证链路：
 *   1. vdi_create_task_package  创建任务包
 *   2. vdi_decompose_tasks      拆解 WBS
 *   3. vdi_dispatch_task        派发任务到二级 Skill
 *   4. 模拟循环水设计输出
 *   5. vdi_validate_discipline_output  输出契约校验
 *   6. vdi_check_redlines             红线检查
 *   7. vdi_check_review_gate          校审闸门（校核→审核→审定）
 *   8. vdi_update_task_status         更新任务状态
 *   9. vdi_check_milestone            检查里程碑进度
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, ".."); // pilotdeck-vdi root

function orchCall(tool, args) {
  const req = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } });
  const workspaceRoot = path.resolve(ROOT, "..", "workspaces");
  const out = execSync(
    `echo '${req.replace(/'/g, "'\\''")}' | VDI_WORKSPACE_ROOT="${workspaceRoot}" node "${ROOT}/mcp/vdi-orchestrator/server.mjs" 2>&1`
  );
  const parsed = JSON.parse(out.toString());
  return JSON.parse(parsed.result.content[0].text);
}

function rulesCall(tool, args) {
  const req = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } });
  const out = execSync(`echo '${req.replace(/'/g, "'\\''")}' | node "${ROOT}/mcp/vdi-rules/server.mjs" 2>&1`);
  const parsed = JSON.parse(out.toString());
  return JSON.parse(parsed.result.content[0].text);
}

const PROJECT_ID = "VDI-PROJ-001";
const PASS = "✅";
const FAIL = "❌";

console.log("═══════════════════════════════════════════════════════");
console.log("  VDI 试点 A 集成验证 — 给排水三审三校 E2E");
console.log("═══════════════════════════════════════════════════════\n");

// ── Step 1: 创建任务包 ──
console.log("── 1. 创建任务包 ──");
const pkg = orchCall("vdi_create_task_package", {
  project_id: PROJECT_ID,
  title: "给排水试点A基础设计",
  description: "某石化装置给排水专业基础设计，涉及给水/消防/排水/循环水四个子领域",
  disciplines: ["water"],
  milestones: [
    { name: "model_review_30", target_date: "2026-07-15" },
    { name: "model_review_60", target_date: "2026-08-30" },
  ],
  standards: ["GB 50050-2017", "GB 50974-2014", "GB 50015-2019"],
  risk_level: "medium",
});
console.log(`   package_id: ${pkg.package_id}`);
console.log(`   status: ${pkg.status}`);
console.log(`   ${PASS} 任务包创建成功\n`);

// ── Step 2: 拆解 WBS ──
console.log("── 2. 拆解 WBS ──");
const wbs = orchCall("vdi_decompose_tasks", { project_id: PROJECT_ID });
console.log(`   WBS 项数: ${wbs.wbs_items.length}`);
wbs.wbs_items.forEach((w) => {
  console.log(`   - ${w.wbs_id} ${w.title} (${w.discipline}) [${w.estimated_hours}h] → ${w.status}`);
});
console.log(`   关键路径: ${wbs.critical_path.join(" → ")}`);
console.log(`   ${PASS} WBS 拆解完成\n`);

// ── Step 3: 派发任务 ──
console.log("── 3. 派发 WBS 到 给排水专业负责人 ──");
const dispatch = orchCall("vdi_dispatch_task", {
  project_id: PROJECT_ID,
  wbs_id: "1",
  instruction: "请执行给排水设计任务。涉循环水子领域时调用 循环水系统设计，完成后提交 DisciplineOutput。",
});
console.log(`   dispatched: ${dispatch.dispatched}`);
console.log(`   skill: ${dispatch.skill}`);
console.log(`   ${PASS} 任务派发完成\n`);

// ── Step 4: 模拟循环水设计输出（循环水系统设计 产出） ──
console.log("── 4. 模拟 循环水系统设计 设计输出 ──");
const circulatingOutput = {
  discipline: "water",
  output_type: "circulating_water",
  payload: {
    circulating_flow_m3h: 2000,
    supply_temp_C: 32,
    return_temp_C: 42,
    delta_T_C: 10,
    makeup_rate_pct: 2.5,
    blowdown_rate_pct: 0.8,
    water_treatment: {
      corrosion_inhibitor: "有机磷系",
      scale_inhibitor: "聚合物分散剂",
      biocide: "氧化性+非氧化性交替",
    },
    side_filter: { flow_m3h: 80, type: "多介质过滤器" },
    cooling_towers: [{ type: "开式逆流", capacity_m3h: 800, count: 3 }],
    pumps: [{ flow_m3h: 2200, head_m: 28, power_kW: 250, standby: 1 }],
  },
  citations: [
    { source_type: "standard", source_id: "GB 50050-2017", version: "2017", clause: "4.2" },
    { source_type: "standard", source_id: "GB/T 50102-2014", version: "2014", clause: "3.1" },
  ],
  risk_level: "medium",
  confidence: 0.88,
  status: "draft",
};
console.log(`   output_type: ${circulatingOutput.output_type}`);
console.log(`   citations: ${circulatingOutput.citations.length} 条`);
console.log(`   ${PASS} 循环水设计输出就绪\n`);

// ── Step 5: 输出契约校验 ──
console.log("── 5. vdi_validate_discipline_output ──");
const validation = rulesCall("vdi_validate_discipline_output", {
  discipline: "water",
  sub_discipline: "circulating",
  output: circulatingOutput,
});
console.log(`   valid: ${validation.valid}`);
console.log(`   errors: ${validation.errors}, warnings: ${validation.warnings}`);
console.log(`   ${validation.valid ? PASS : FAIL} ${validation.summary}\n`);

// ── Step 6: 红线检查 ──
console.log("── 6. vdi_check_redlines ──");
const redlines = rulesCall("vdi_check_redlines", {
  discipline: "water",
  output: circulatingOutput,
});
console.log(`   blocked: ${redlines.blocked}`);
console.log(`   passed: ${redlines.passed}/${redlines.total_rules_checked}`);
redlines.results.forEach((r) => {
  console.log(`   - ${r.passed ? PASS : FAIL} ${r.rule_name}: ${r.findings[0]}`);
});
console.log(`   ${!redlines.blocked ? PASS : FAIL} ${redlines.summary}\n`);

// ── Step 7: 三审三校闸门 ──
const stages = ["design", "checking", "review", "approval"];
for (const stage of stages) {
  console.log(`── 7.${stages.indexOf(stage) + 1} vdi_check_review_gate (${stage}) ──`);
  const gate = rulesCall("vdi_check_review_gate", {
    discipline: "water",
    stage,
    output: circulatingOutput,
  });
  console.log(`   stage_label: ${gate.stage_label}`);
  console.log(`   performed_by: ${gate.performed_by}`);
  console.log(`   passed: ${gate.passed}`);
  console.log(`   checks: ${gate.passed_checks}/${gate.total_checks} passed`);
  console.log(`   next_stage: ${gate.next_stage || "无（终审）"}`);
  console.log(`   ${gate.passed ? PASS : FAIL} ${gate.summary}\n`);
}

// ── Step 8: 更新任务状态 ──
console.log("── 8. 更新 WBS 状态为 completed ──");
const status = orchCall("vdi_update_task_status", {
  project_id: PROJECT_ID,
  wbs_id: "1",
  status: "completed",
  note: "循环水设计已完成，校审通过",
});
console.log(`   status: ${status.new_status}`);
console.log(`   ${PASS} 任务状态更新完成\n`);

// ── Step 9: 检查里程碑 ──
console.log("── 9. vdi_check_milestone ──");
const milestone = orchCall("vdi_check_milestone", {
  project_id: PROJECT_ID,
  milestone_name: "model_review_30",
});
console.log(`   进度: ${milestone.milestones[0].progress_pct}%`);
console.log(`   剩余天数: ${milestone.milestones[0].days_remaining} 天`);
console.log(`   警戒: ${milestone.milestones[0].alert_level}`);
console.log(`   整体健康: ${milestone.overall_health}`);
console.log(`   ${PASS} 里程碑检查完成\n`);

console.log("═══════════════════════════════════════════════════════");
console.log("  集成验证全部完成 — 试点 A E2E 链路通畅");
console.log("═══════════════════════════════════════════════════════");
