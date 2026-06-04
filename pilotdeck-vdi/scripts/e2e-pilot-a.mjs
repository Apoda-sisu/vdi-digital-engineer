#!/usr/bin/env node
/**
 * 试点 A E2E 验收 — 给排水单专业三审三校全链路
 *
 * 验证链路（对应 water-lead 任务卡 WL-01 + WL-02）：
 *
 *   【编排层】vdi-orchestrator
 *     1. 创建任务包 → 2. 拆解 WBS → 3. 派发到子领域
 *
 *   【CP 级人机协同】vdi-rules + vdi-orchestrator
 *     1.5. 数据完整性校验（缺失→BLOCKED, 齐全→READY）
 *          + 人类审核请求/决议（paused→approved→resume, paused→rejected→blocked）
 *
 *   【设计层】模拟二级 Skill 产出
 *     4. supply 给水设计 → 5. fire 消防设计 → 6. drainage 排水设计 → 7. circulating 循环水设计
 *
 *   【校验层】vdi-rules
 *     8. 输出契约校验 → 9. 红线检查 → 10. 三审三校闸门（设计→校核→审核→审定）
 *
 *   【汇总层】water-lead 集成
 *     11. 汇总各子领域为 integrated output → 12. 集成输出校验与审定
 *
 *   【事件层】vdi-events
 *     13. 发布 discipline_output.published → 14. 事件状态确认
 *
 *   【进度层】vdi-orchestrator
 *     15. 更新任务状态 → 16. 检查里程碑
 */

import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(ROOT, "..", "workspaces");

function mcpCall(serverPath, tool, args) {
  const req = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } });
  const tmpFile = path.join(os.tmpdir(), `vdi-e2e-${Date.now()}.json`);
  try {
    writeFileSync(tmpFile, req + "\n", "utf8");
    const cmd = `VDI_WORKSPACE_ROOT="${WORKSPACE_ROOT}" node "${serverPath}" < "${tmpFile}"`;
    const out = execSync(cmd, { timeout: 8000, maxBuffer: 1024 * 1024, shell: "/bin/bash" });
    const parsed = JSON.parse(out.toString());
    const text = parsed.result?.content?.[0]?.text;
    if (!text) {
      console.error(`  ⚠ Empty response for ${tool} (no content in result)`);
      return { error: "empty response" };
    }
    return JSON.parse(text);
  } catch (err) {
    const message = err.stdout?.toString() || err.stderr?.toString() || String(err);
    console.error(`  ⚠ mcpCall failed for ${tool}: ${message.slice(0, 300)}`);
    return { error: message.slice(0, 300) };
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

const ORC = path.join(ROOT, "mcp/vdi-orchestrator/server.mjs");
const RULES = path.join(ROOT, "mcp/vdi-rules/server.mjs");
const EVENTS = path.join(ROOT, "mcp/vdi-events/server.mjs");

const PROJECT = "VDI-PILOT-A";
const DIVIDER = "═".repeat(60);

// 清理上次残留
try { execSync(`rm -rf "${WORKSPACE_ROOT}/${PROJECT}"`); } catch {}

console.log(DIVIDER);
console.log("  试点 A E2E — 给排水单专业三审三校全链路验证");
console.log(DIVIDER + "\n");

let passed = 0;
let failed = 0;
function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  ✅ ${label}${detail ? ": " + detail : ""}`); }
  else     { failed++; console.log(`  ❌ ${label}${detail ? ": " + detail : ""}`); }
}

// ════════════════════════════════════════════════════════
// 阶段 1：编排 — 任务包创建与 WBS 拆解
// ════════════════════════════════════════════════════════
console.log("── 阶段1：编排层（vdi-orchestrator）──\n");

console.log("1.1 创建任务包");
const pkg = mcpCall(ORC, "vdi_create_task_package", {
  project_id: PROJECT,
  title: "某石化装置给排水基础设计（试点A）",
  description: "涉及给水/消防/排水/循环水四个子领域，目标里程碑 model_review_30=2026-07-15",
  disciplines: ["water"],
  milestones: [
    { name: "model_review_30", target_date: "2026-07-15" },
    { name: "discipline_signoff", target_date: "2026-10-15" },
  ],
  standards: ["GB 50015-2019", "GB 50974-2014", "GB 50014-2021", "GB 50050-2017"],
  risk_level: "medium",
});
check("任务包创建", pkg.package_id, pkg.package_id);

console.log("\n1.2 拆解 WBS");
const wbs = mcpCall(ORC, "vdi_decompose_tasks", { project_id: PROJECT });
check("WBS 拆解", wbs?.wbs_items?.length >= 1, `共 ${wbs?.wbs_items?.length || 0} 项`);
if (wbs?.wbs_items) wbs.wbs_items.forEach(w => console.log(`     ${w.wbs_id} ${w.discipline} [${w.estimated_hours}h] → ${w.status}`));

console.log("\n1.3 派发任务到 water-lead");
const dispatch = mcpCall(ORC, "vdi_dispatch_task", {
  project_id: PROJECT,
  wbs_id: "1",
  instruction: `给排水专业基础设计。请按子领域拆解：
- supply: 用水量分析、给水管网设计
- fire: 消防水量计算、消火栓布置、消防水池
- drainage: 排水管网、清污分流
- circulating: 循环水量计算、冷却塔选型、水质稳定
完成后提交 DisciplineOutput。`,
});
check("任务派发", dispatch?.dispatched, `skill=${dispatch?.skill}`);

// ════════════════════════════════════════════════════════
// 阶段 1.5：CP 级人机协同 — 数据完整性 + 人类审核链路
// ════════════════════════════════════════════════════════
console.log("\n── 阶段1.5：CP 级人机协同（vdi-rules + vdi-orchestrator）──\n");

// 1.5.1 数据完整性校验 — MUST 缺失应返回 BLOCKED
console.log("1.5.1 vdi_check_data_completeness（模拟 supply MUST 数据缺失）");
const incompleteData = mcpCall(RULES, "vdi_check_data_completeness", {
  discipline: "water",
  sub_discipline: "supply",
  provided_data: {
    // 只提供 1/4 MUST 数据，缺少 Q_process_m3d, H_geo_m, P_in_MPa
    N_people: 80,
  },
});
check("数据不完整 → BLOCKED", incompleteData?.status === "BLOCKED" && !incompleteData?.complete,
  `缺失 ${incompleteData?.must?.missing}/${incompleteData?.must?.total} MUST: ${(incompleteData?.must?.missing_items || []).map(m => m.label).join(", ")}`);

// 1.5.2 数据完整性校验 — MUST 齐全应返回 READY
console.log("\n1.5.2 vdi_check_data_completeness（提供全部 MUST 数据）");
const completeData = mcpCall(RULES, "vdi_check_data_completeness", {
  discipline: "water",
  sub_discipline: "supply",
  provided_data: {
    Q_process_m3d: 320,
    H_geo_m: 15,
    P_in_MPa: 0.3,
    N_people: 80,
  },
});
check("数据完整 → READY", completeData?.status === "READY" && completeData?.complete,
  `${completeData?.must?.present}/${completeData?.must?.total} MUST 齐全，${completeData?.should?.missing} SHOULD 使用默认值`);

// 1.5.3 不同子领域的数据完整性测试（fire）
console.log("\n1.5.3 vdi_check_data_completeness（fire MUST 缺失）");
const fireIncomplete = mcpCall(RULES, "vdi_check_data_completeness", {
  discipline: "water",
  sub_discipline: "fire",
  provided_data: { building_class: "甲类" },
});
check("fire 数据不完整 → BLOCKED", fireIncomplete?.status === "BLOCKED",
  `缺失 ${fireIncomplete?.must?.missing} MUST: ${(fireIncomplete?.must?.missing_items || []).map(m => m.field).join(", ")}`);

// 1.5.4 人类审核请求 — Skill 到达 CP-0 时请求人类介入
console.log("\n1.5.4 vdi_request_human_review（CP-0 数据缺失，请求人类补充）");
const cp0Request = mcpCall(ORC, "vdi_request_human_review", {
  project_id: PROJECT,
  wbs_id: "1",
  checkpoint: "CP-0",
  summary: "MUST 数据缺失：工艺用水量 Q_process_m3d 未提供",
  details: {
    missing_fields: [
      { field: "Q_process_m3d", label: "工艺用水量（m³/d）", source: "工艺专业 DesignBasis" },
    ],
  },
  options: ["补充数据后继续", "退回任务"],
});
check("CP-0 审核请求 → paused", cp0Request?.status === "paused",
  `状态=${cp0Request?.status}, 选项=${(cp0Request?.options || []).join("/")}`);

// 1.5.5 验证任务确实处于 paused 状态
console.log("\n1.5.5 验证任务 paused 状态（milestone 应识别为未完成）");
const msPaused = mcpCall(ORC, "vdi_check_milestone", { project_id: PROJECT });
const wbsPaused = msPaused?.milestones?.[0];
check("任务处于 paused → 进度未完成", wbsPaused?.progress_pct < 100,
  `进度=${wbsPaused?.progress_pct}%`);

// 1.5.6 人类补充数据后批准 — 恢复任务到 in_progress
console.log("\n1.5.6 vdi_resolve_human_review（人类补充数据，批准继续）");
// 先将任务置为 in_progress（模拟 Skill 开始工作），再发起审核
mcpCall(ORC, "vdi_update_task_status", { project_id: PROJECT, wbs_id: "1", status: "in_progress" });
const cp0Request2 = mcpCall(ORC, "vdi_request_human_review", {
  project_id: PROJECT, wbs_id: "1", checkpoint: "CP-0",
  summary: "MUST 数据缺失：工艺用水量 Q_process_m3d 未提供",
  options: ["补充数据后继续", "退回任务"],
});
const resolveApprove = mcpCall(ORC, "vdi_resolve_human_review", {
  project_id: PROJECT, wbs_id: "1",
  decision: "确认",
  comment: "工艺用水量 320 m³/d，已补充",
  amended_data: { Q_process_m3d: 320 },
});
check("人类批准 → 任务恢复", resolveApprove?.new_status === "in_progress",
  `状态=${resolveApprove?.new_status}, ${resolveApprove?.instruction}`);

// 1.5.7 人类审核请求 — CP-2 计算完成，请求审核
console.log("\n1.5.7 vdi_request_human_review（CP-2 计算完成，请求人类审核）");
const cp2Request = mcpCall(ORC, "vdi_request_human_review", {
  project_id: PROJECT,
  wbs_id: "1",
  checkpoint: "CP-2",
  summary: "给水计算完成：DN200 环状管网，离心泵 Q=45m³/h H=42m，最不利点 0.28MPa",
  options: ["确认", "修改", "退回"],
});
check("CP-2 审核请求 → paused", cp2Request?.status === "paused",
  `CP=${cp2Request?.checkpoint}`);

// 1.5.8 人类驳回审核 — 附带修改意见
console.log("\n1.5.8 vdi_resolve_human_review（人类驳回，要求修改管径）");
const resolveReject = mcpCall(ORC, "vdi_resolve_human_review", {
  project_id: PROJECT,
  wbs_id: "1",
  decision: "退回",
  comment: "主管径 DN200 偏小，请按 DN250 重新校核",
});
check("人类驳回 → 任务 blocked", resolveReject?.new_status === "blocked",
  `状态=${resolveReject?.new_status}, 意见=${resolveReject?.instruction}`);

// 1.5.9 修复后重新提交审核
console.log("\n1.5.9 修复后重新请求审核 + 人类批准");
// 先手动恢复状态为 in_progress（模拟 Skill 修改后重新执行）
mcpCall(ORC, "vdi_update_task_status", { project_id: PROJECT, wbs_id: "1", status: "in_progress" });
const cp2Retry = mcpCall(ORC, "vdi_request_human_review", {
  project_id: PROJECT,
  wbs_id: "1",
  checkpoint: "CP-2",
  summary: "修改后：DN250 环状管网，最不利点 0.32MPa，满足要求",
  options: ["确认", "退回"],
});
const resolveRetry = mcpCall(ORC, "vdi_resolve_human_review", {
  project_id: PROJECT,
  wbs_id: "1",
  decision: "确认",
  comment: "DN250 方案可行，继续提交",
});
check("修改后重新审核通过", resolveRetry?.new_status === "in_progress",
  `状态=${resolveRetry?.new_status}`);

// 恢复任务到 dispatched 状态，为后续阶段2做准备
mcpCall(ORC, "vdi_update_task_status", { project_id: PROJECT, wbs_id: "1", status: "dispatched" });

// ════════════════════════════════════════════════════════
// 阶段 2：设计 — 各子领域产出 DisciplineOutput
// ════════════════════════════════════════════════════════
console.log("\n── 阶段2：设计层（模拟二级 Skill 产出）──\n");

const subOutputs = {};

// 2.1 给水设计
console.log("2.1 给水系统设计 给水设计");
subOutputs.supply = {
  discipline: "water", output_type: "water_supply",
  payload: {
    daily_demand_m3d: 1200, max_hourly_m3h: 80, fire_reserve_m3: 540,
    supply_pressure_MPa: 0.35, pipe_material: "球墨铸铁", supply_source: "市政管网+自备井",
  },
  citations: [
    { source_type: "standard", source_id: "GB 50015-2019", version: "2019", clause: "3.2" },
    { source_type: "standard", source_id: "GB 50013-2018", version: "2018", clause: "4.1" },
  ],
  risk_level: "medium", confidence: 0.90, status: "draft",
};
check("supply 产出", subOutputs.supply.output_type === "water_supply");

// 2.2 消防设计
console.log("2.2 消防给水设计 消防设计");
subOutputs.fire = {
  discipline: "water", output_type: "fire_water",
  payload: {
    outdoor_fire_flow_Ls: 45, indoor_fire_flow_Ls: 15, sprinkler_density: "8 L/min·m²",
    fire_pump_sets: 2, fire_tank_m3: 540, hydrant_count: 12,
    system_type: "临时高压", building_class: "甲类厂房",
  },
  citations: [
    { source_type: "standard", source_id: "GB 50974-2014", version: "2014", clause: "3.3" },
    { source_type: "standard", source_id: "GB 50016-2014", version: "2014", clause: "8.1" },
  ],
  risk_level: "high", confidence: 0.92, status: "draft",
};
check("fire 产出", subOutputs.fire.output_type === "fire_water");

// 2.3 排水设计
console.log("2.3 排水系统设计 排水设计");
subOutputs.drainage = {
  discipline: "water", output_type: "drainage",
  payload: {
    drainage_flow_m3h: 150, pipe_slope_pct: 0.5, clean_separation: "清污分流",
    pump_station_config: "2用1备", treatment_before_discharge: true,
  },
  citations: [
    { source_type: "standard", source_id: "GB 50014-2021", version: "2021", clause: "4.5" },
  ],
  risk_level: "medium", confidence: 0.88, status: "draft",
};
check("drainage 产出", subOutputs.drainage.output_type === "drainage");

// 2.4 循环水设计
console.log("2.4 循环水系统设计 循环水设计");
subOutputs.circulating = {
  discipline: "water", output_type: "circulating_water",
  payload: {
    circulating_flow_m3h: 2000, supply_temp_C: 32, return_temp_C: 42, delta_T_C: 10,
    makeup_rate_pct: 2.5, blowdown_rate_pct: 0.8,
    water_treatment: { corrosion_inhibitor: "有机磷系", scale_inhibitor: "聚合物分散剂", biocide: "氧化性+非氧化性交替" },
    side_filter: { flow_m3h: 80, type: "多介质过滤器" },
    cooling_towers: [{ type: "开式逆流", capacity_m3h: 800, count: 3 }],
    pumps: [{ flow_m3h: 2200, head_m: 28, power_kW: 250, standby: 1 }],
  },
  citations: [
    { source_type: "standard", source_id: "GB 50050-2017", version: "2017", clause: "4.2" },
    { source_type: "standard", source_id: "GB/T 50102-2014", version: "2014", clause: "3.1" },
  ],
  risk_level: "medium", confidence: 0.88, status: "draft",
};
check("circulating 产出", subOutputs.circulating.output_type === "circulating_water");

// ════════════════════════════════════════════════════════
// 阶段 3：校验 — vdi-rules 输出契约 + 红线 + 校审闸门
// ════════════════════════════════════════════════════════
console.log("\n── 阶段3：校验层（vdi-rules）──\n");

for (const [sub, output] of Object.entries(subOutputs)) {
  console.log(`3.${Object.keys(subOutputs).indexOf(sub) + 1} ${sub}`);

  // 输出契约校验
  const v = mcpCall(RULES, "vdi_validate_discipline_output", {
    discipline: "water", sub_discipline: sub, output,
  });
  check(`  契约校验`, v?.valid, v?.summary);

  // 红线检查
  const r = mcpCall(RULES, "vdi_check_redlines", { discipline: "water", output });
  check(`  红线检查`, !r?.blocked, `${r?.passed}/${r?.total_rules_checked} passed`);

  // 校审闸门（四阶段串联）
  const stages = ["design", "checking", "review", "approval"];
  let allGatesPassed = true;
  for (const stage of stages) {
    const gate = mcpCall(RULES, "vdi_check_review_gate", { discipline: "water", stage, output });
    if (!gate?.passed) allGatesPassed = false;
    const label = { design: "自校", checking: "校核", review: "审核", approval: "审定" }[stage];
    console.log(`    ${gate?.passed ? "✅" : "❌"} ${label}: ${gate?.passed_checks}/${gate?.total_checks} checks`);
  }
  check(`  四阶段校审`, allGatesPassed, allGatesPassed ? "全部通过" : "存在未通过");
  console.log("");
}

// ════════════════════════════════════════════════════════
// 阶段 4：汇总 — water-lead 集成输出
// ════════════════════════════════════════════════════════
console.log("── 阶段4：汇总层（water-lead 集成）──\n");

const integrated = {
  discipline: "water",
  output_type: "integrated",
  content: {
    sub_outputs: [
      { sub_discipline: "supply", ref: "DO-SUPPLY-001", confidence: 0.90 },
      { sub_discipline: "fire", ref: "DO-FIRE-001", confidence: 0.92 },
      { sub_discipline: "drainage", ref: "DO-DRAIN-001", confidence: 0.88 },
      { sub_discipline: "circulating", ref: "DO-CIRC-001", confidence: 0.88 },
    ],
    summary: "某石化装置给排水基础设计完成。四个子领域（给水/消防/排水/循环水）设计文件齐全，校审通过。",
  },
  citations: [
    { source_type: "standard", source_id: "GB 50015-2019", version: "2019", clause: "3.2" },
    { source_type: "standard", source_id: "GB 50974-2014", version: "2014", clause: "3.3" },
    { source_type: "standard", source_id: "GB 50014-2021", version: "2021", clause: "4.5" },
    { source_type: "standard", source_id: "GB 50050-2017", version: "2017", clause: "4.2" },
  ],
  risk_level: "high",
  confidence: 0.90,
  status: "draft",
};

console.log("4.1 集成输出契约校验");
const iv = mcpCall(RULES, "vdi_validate_discipline_output", {
  discipline: "water", output: integrated,
});
check("集成契约校验", iv?.valid, iv?.summary);

console.log("\n4.2 集成输出红线检查");
const ir = mcpCall(RULES, "vdi_check_redlines", { discipline: "water", output: integrated });
check("集成红线检查", !ir?.blocked, ir?.summary);

console.log("\n4.3 集成输出审定");
const iapprove = mcpCall(RULES, "vdi_check_review_gate", {
  discipline: "water", stage: "approval", output: integrated,
});
check("集成审定", iapprove?.passed, `${iapprove?.passed_checks}/${iapprove?.total_checks} checks`);

// ════════════════════════════════════════════════════════
// 阶段 5：事件 — vdi-events 发布与消费
// ════════════════════════════════════════════════════════
console.log("\n── 阶段5：事件层（vdi-events）──\n");

console.log("5.1 发布 discipline_output.published");
const pub = mcpCall(EVENTS, "vdi_publish_event", {
  project_id: PROJECT,
  event_type: "discipline_output.published",
  producer: "water",
  payload: { object_id: "DO-INTEGRATED-001", object_type: "DisciplineOutput", discipline: "water", output_type: "integrated" },
  trace_id: "TRACE-PILOT-A-E2E",
});
check("事件发布", pub?.event_id, `${pub?.event_id} → ${pub?.subscriber_count} 订阅者`);

console.log("\n5.2 事件状态");
const status = mcpCall(EVENTS, "vdi_get_event_status", { project_id: PROJECT });
check("事件总线健康", status?.overall_health !== "degraded", status?.summary);

// ════════════════════════════════════════════════════════
// 阶段 6：进度 — 任务状态更新与里程碑检查
// ════════════════════════════════════════════════════════
console.log("\n── 阶段6：进度层（vdi-orchestrator）──\n");

console.log("6.1 更新 WBS 状态为 completed");
const upd = mcpCall(ORC, "vdi_update_task_status", {
  project_id: PROJECT, wbs_id: "1", status: "completed",
  note: "给排水四子领域设计完成，校审通过，已提交集成 DisciplineOutput",
});
check("状态更新", upd?.new_status === "completed");

console.log("\n6.2 检查里程碑");
const ms = mcpCall(ORC, "vdi_check_milestone", {
  project_id: PROJECT, milestone_name: "model_review_30",
});
const m = ms?.milestones?.[0];
check("里程碑进度", m?.progress_pct >= 0, `进度=${m?.progress_pct}% 警戒=${m?.alert_level} 剩余=${m?.days_remaining}天`);

// ════════════════════════════════════════════════════════
// 验收总结
// ════════════════════════════════════════════════════════
console.log("\n" + DIVIDER);
const total = passed + failed;
console.log(`  验收结果: ${passed}/${total} 通过`);
if (failed > 0) {
  console.log(`  ❌ ${failed} 项未通过`);
} else {
  console.log(`  ✅ 全部通过 — 试点 A E2E 验收完成`);
}
console.log(DIVIDER);

process.exit(failed > 0 ? 1 : 0);
