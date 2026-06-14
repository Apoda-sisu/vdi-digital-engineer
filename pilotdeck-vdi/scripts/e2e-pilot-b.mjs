#!/usr/bin/env node
/**
 * 试点 B E2E 验收 — 工艺→管道→仪控跨专业提资全链路
 *
 * 验证链路（对应 跨专业提资事件链设计）：
 *
 *   【编排层】vdi-orchestrator
 *     1. 创建任务包 → 2. 拆解 WBS → 3. 派发到工艺专业
 *
 *   【工艺层】工艺专业负责人
 *     4. 工艺路线设计 → 5. 物料热量平衡 → 6. PFD-PID设计
 *     7. 发布 design_basis.updated 事件
 *
 *   【管道层】管道设计
 *     8. 接收 design_basis.updated → 9. 确认 design_basis.acknowledged
 *     10. 材料等级确定 → 11. 管道布置设计
 *     12. 发布 discipline_output.published
 *
 *   【仪控层】仪控设计
 *     13. 接收 design_basis.updated → 14. 确认 design_basis.acknowledged
 *     15. 仪表选型 → 16. 联锁逻辑设计
 *     17. 发布 discipline_output.published
 *
 *   【事件层】vdi-events
 *     18. 验证事件链完整性 → 19. 验证事件状态
 *
 *   【进度层】vdi-orchestrator
 *     20. 更新任务状态 → 21. 检查里程碑
 */

import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(ROOT, "..", "workspaces");

function mcpCall(serverPath, tool, args) {
  const req = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } });
  const tmpFile = path.join(os.tmpdir(), `vdi-e2e-b-${Date.now()}.json`);
  try {
    writeFileSync(tmpFile, req + "\n", "utf8");
    const cmd = `node "${serverPath}" < "${tmpFile}"`;
    const out = execSync(cmd, { 
      timeout: 8000, 
      maxBuffer: 1024 * 1024, 
      shell: "/bin/bash",
      env: { ...process.env, VDI_WORKSPACE_ROOT: WORKSPACE_ROOT }
    });
    const parsed = JSON.parse(out.toString());
    const text = parsed.result?.content?.[0]?.text;
    if (!text) {
      console.error(`  ⚠ Empty response for ${tool} (no content in result)`);
      return { error: "empty response" };
    }
    return JSON.parse(text);
  } catch (err) {
    const message = err.stdout?.toString() || err.stderr?.toString() || String(err);
    console.error(`  ⚠ mcpCall failed for ${tool}: ${message.slice(0, 500)}`);
    return { error: message.slice(0, 500) };
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

const ORC = path.join(ROOT, "mcp/vdi-orchestrator/server.mjs");
const RULES = path.join(ROOT, "mcp/vdi-rules/server.mjs");
const EVENTS = path.join(ROOT, "mcp/vdi-events/server.mjs");

const PROJECT = "VDI-PILOT-B";
const DIVIDER = "═".repeat(60);

// 清理上次残留
try { execSync(`rm -rf "${WORKSPACE_ROOT}/工艺组/${PROJECT}"`); } catch {}

// 创建 Workspace 目录结构
const wsDir = path.join(WORKSPACE_ROOT, "工艺组", PROJECT);
const pilotdeckDir = path.join(wsDir, ".pilotdeck", "projects", PROJECT);
mkdirSync(path.join(pilotdeckDir, "events", "inbox"), { recursive: true });
mkdirSync(path.join(pilotdeckDir, "events", "processed"), { recursive: true });
mkdirSync(path.join(pilotdeckDir, "events", "failed"), { recursive: true });
mkdirSync(path.join(pilotdeckDir, "outputs"), { recursive: true });
mkdirSync(path.join(pilotdeckDir, "reviews"), { recursive: true });
mkdirSync(path.join(wsDir, "knowledge"), { recursive: true });
mkdirSync(path.join(wsDir, "deliverables"), { recursive: true });

// 创建 context.json
writeFileSync(path.join(pilotdeckDir, "context.json"), JSON.stringify({
  project_id: PROJECT,
  project_name: "VDI跨专业提资试点B",
  description: "工艺→管道→仪控跨专业提资验证",
  pilot_type: "B",
  scope: {
    disciplines: ["process", "piping", "instrument"],
    workflow: "cross_discipline_handoff",
    event_driven: true
  }
}, null, 2), "utf8");

// 创建 design_basis.json
writeFileSync(path.join(pilotdeckDir, "design_basis.json"), JSON.stringify({
  project_id: PROJECT,
  document_id: "DB-2026-001",
  version: "1.0",
  status: "draft",
  process_data: {
    unit_name: "常减压蒸馏装置",
    unit_capacity: "500万吨/年",
    design_pressure_MPa: 0.5,
    design_temperature_C: 350,
    medium: "原油、常压渣油、减压渣油"
  },
  material_flow: {
    feed: { name: "原油", flow_rate_kg_h: 62500, temperature_C: 25, pressure_MPa: 0.3 },
    products: [
      { name: "石脑油", flow_rate_kg_h: 12500 },
      { name: "常压柴油", flow_rate_kg_h: 18750 },
      { name: "常压渣油", flow_rate_kg_h: 25000 }
    ]
  }
}, null, 2), "utf8");

console.log(DIVIDER);
console.log("  试点 B E2E — 工艺→管道→仪控跨专业提资全链路验证");
console.log(DIVIDER + "\n");

let passed = 0;
let failed = 0;
function check(label, ok, detail, data = null) {
  if (ok) { passed++; console.log(`  ✅ ${label}${detail ? ": " + detail : ""}`); }
  else     { 
    failed++; 
    console.log(`  ❌ ${label}${detail ? ": " + detail : ""}`);
    if (data) console.log(`     数据: ${JSON.stringify(data, null, 2).slice(0, 200)}`);
  }
}

// ════════════════════════════════════════════════════════
// 阶段 1：编排 — 任务包创建与 WBS 拆解
// ════════════════════════════════════════════════════════
console.log("── 阶段1：编排层（vdi-orchestrator）──\n");

console.log("1.1 创建任务包");
const pkg = mcpCall(ORC, "vdi_create_task_package", {
  project_id: PROJECT,
  title: "常减压蒸馏装置跨专业提资（试点B）",
  description: "工艺→管道→仪控跨专业提资验证，涉及工艺设计基础发布、管道材料等级确定、仪控联锁设计",
  disciplines: ["process", "piping", "instrument"],
  milestones: [
    { name: "design_basis_published", target_date: "2026-06-15" },
    { name: "piping_output", target_date: "2026-06-22" },
    { name: "instrument_output", target_date: "2026-06-22" },
    { name: "integration_review", target_date: "2026-06-29" }
  ],
  standards: ["SH/T 3011-2017", "GB/T 50316-2000", "SH/T 3005-2016", "GB 50160-2008"],
  risk_level: "high"
});
check("创建任务包", !pkg.error && pkg.package_id, pkg.package_id || pkg.error, pkg);

console.log("\n1.2 拆解 WBS");
const wbs = mcpCall(ORC, "vdi_decompose_tasks", {
  project_id: PROJECT
});
check("WBS 拆解", !wbs.error && wbs.wbs_items?.length > 0, `${wbs.wbs_items?.length || 0} 个任务`);

console.log("\n1.3 派发到工艺专业");
const dispatch = mcpCall(ORC, "vdi_dispatch_task", {
  project_id: PROJECT,
  wbs_id: wbs.wbs_items?.[0]?.wbs_id
});
check("派发任务", !dispatch.error && dispatch.status !== "failed", dispatch.status || dispatch.error);

// ════════════════════════════════════════════════════════
// 阶段 2：工艺层 — 设计基础发布
// ════════════════════════════════════════════════════════
console.log("\n── 阶段2：工艺层（设计基础发布）──\n");

console.log("2.1 发布 design_basis.updated 事件");
const dbEvent = mcpCall(EVENTS, "vdi_publish_event", {
  project_id: PROJECT,
  event_type: "design_basis.updated",
  producer: "PR",
  payload: {
    object_id: "BASIS-001",
    object_type: "DesignBasis",
    discipline: "PR",
    version: "1.0",
    basis_items: [
      {
        tag_id: "PROCESS-FEED",
        parameter: "feedstock_spec",
        value: { name: "原油", flow_rate_kg_h: 62500, temperature_C: 25, pressure_MPa: 0.3 }
      },
      {
        tag_id: "PROCESS-PRODUCT",
        parameter: "product_spec",
        value: { name: "石脑油", flow_rate_kg_h: 12500, purity_pct: 99.5 }
      },
      {
        tag_id: "PROCESS-BL",
        parameter: "battery_limit_conditions",
        value: { feed_in: { T_C: 25, P_MPa: 0.3 }, product_out: { T_C: 40, P_MPa: 0.15 } }
      }
    ],
    change_summary: "初始版本发布",
    impact_assessment: {
      affected_disciplines: ["PI", "IN"],
      requires_redesign: false
    }
  }
});
check("发布 design_basis.updated", !dbEvent.error && dbEvent.event_id, dbEvent.event_id || dbEvent.error);

console.log("\n2.2 检查事件状态");
const eventStatus = mcpCall(EVENTS, "vdi_get_event_status", {
  project_id: PROJECT
});
check("事件状态", !eventStatus.error && eventStatus.counts, eventStatus.counts ? JSON.stringify(eventStatus.counts) : eventStatus.error);

// ════════════════════════════════════════════════════════
// 阶段 3：管道层 — 接收条件并设计
// ════════════════════════════════════════════════════════
console.log("\n── 阶段3：管道层（接收条件并设计）──\n");

console.log("3.1 管道专业消费事件");
const piConsume = mcpCall(EVENTS, "vdi_consume_pending", {
  project_id: PROJECT,
  discipline: "PI",
  limit: 10
});
check("消费事件", !piConsume.error && piConsume.events?.length > 0, `${piConsume.events?.length || 0} 个事件`);

console.log("\n3.2 管道专业确认事件");
const piAck = mcpCall(EVENTS, "vdi_ack_event", {
  project_id: PROJECT,
  event_id: dbEvent.event_id,
  discipline: "PI",
  status: "acknowledged",
  comment: "已确认工艺条件，开始管道设计"
});
check("确认事件", !piAck.error, piAck.error || "OK");

console.log("\n3.3a 管道 D01 材料等级");
const piD01 = mcpCall(RULES, "vdi_validate_discipline_output", {
  discipline: "PI",
  output: {
    discipline: "PI",
    output_type: "material_class",
    payload: {
      classes: [
        { class_id: "A1", max_P_MPa: 1.0, max_T_C: 200, material: "20#", corrosion_mm: 1.5 },
        { class_id: "A2", max_P_MPa: 4.0, max_T_C: 350, material: "20#", corrosion_mm: 3.0 },
        { class_id: "B1", max_P_MPa: 4.0, max_T_C: 450, material: "Cr5Mo", corrosion_mm: 0 }
      ]
    },
    citations: [{ source_type: "standard", source_id: "SH/T 3059", version: "2018", clause: "5.1" }],
    risk_level: "high",
    confidence: 0.92,
    status: "draft"
  }
});
check("D01 材料等级校验", !piD01.error && piD01.valid !== false, piD01.valid ? "通过" : piD01.error || "失败");

console.log("\n3.3b 管道 D02 管道表");
const piD02 = mcpCall(RULES, "vdi_validate_discipline_output", {
  discipline: "PI",
  output: {
    discipline: "PI",
    output_type: "line_list",
    payload: {
      lines: [
        { line_id: "1001-P-001", from: "V-101", to: "P-101", dn: 100, design_T_C: 40, design_P_MPa: 0.6, material_class: "A1" },
        { line_id: "1002-P-001", from: "K-101", to: "R-101", dn: 150, design_T_C: 120, design_P_MPa: 3.5, material_class: "A2" }
      ]
    },
    citations: [{ source_type: "standard", source_id: "GB/T 50933", version: "2013", clause: "5.3" }],
    risk_level: "high",
    confidence: 0.90,
    status: "draft"
  }
});
check("D02 管道表校验", !piD02.error && piD02.valid !== false, piD02.valid ? "通过" : piD02.error || "失败");

console.log("\n3.3c 管道 D06 综合路由");
const piOutput = mcpCall(RULES, "vdi_validate_discipline_output", {
  discipline: "PI",
  output: {
    discipline: "PI",
    output_type: "piping_design",
    payload: {
      routing_summary: { line_count: 45, rack_levels: 3 },
      clash_report: { clashes_resolved: 2, pending: 0 }
    },
    citations: [
      { source_type: "standard", source_id: "HG/T 20519-4", version: "2009", clause: "4.1" }
    ],
    risk_level: "high",
    confidence: 0.90,
    status: "draft"
  }
});
check("D06 综合路由校验", !piOutput.error && piOutput.valid !== false, piOutput.valid ? "通过" : piOutput.error || "失败");

console.log("\n3.4 发布管道输出事件");
const piPublish = mcpCall(EVENTS, "vdi_publish_event", {
  project_id: PROJECT,
  event_type: "discipline_output.published",
  producer: "PI",
  payload: {
    discipline: "PI",
    output_type: "piping_design",
    output_id: "DO-PI-001",
    version: "1.0",
    status: "published",
    summary: { material_classes: 3, line_count: 45, drawing_count: 8 }
  }
});
check("发布管道输出", !piPublish.error && piPublish.event_id, piPublish.event_id || piPublish.error);

// ════════════════════════════════════════════════════════
// 阶段 4：仪控层 — 接收条件并设计
// ════════════════════════════════════════════════════════
// 阶段 4：仪控层 — L1 vdi-instrument-lead 汇总 8×L2（D01~D08）为 instrument_design
// 本段 mock 校验契约；全链 slug/benchmark 见 e2e-instrument-chain.mjs
console.log("\n── 阶段4：仪控层（接收条件并设计）──\n");

console.log("4.1 仪控专业消费事件");
const inConsume = mcpCall(EVENTS, "vdi_consume_pending", {
  project_id: PROJECT,
  discipline: "IN",
  limit: 10
});
check("消费事件", !inConsume.error && inConsume.events?.length > 0, `${inConsume.events?.length || 0} 个事件`);

console.log("\n4.2 仪控专业确认事件");
const inAck = mcpCall(EVENTS, "vdi_ack_event", {
  project_id: PROJECT,
  event_id: dbEvent.event_id,
  discipline: "IN",
  status: "acknowledged",
  comment: "已确认工艺条件，开始仪控设计"
});
check("确认事件", !inAck.error, inAck.error || "OK");

console.log("\n4.3 仪控专业输出");
const inOutput = mcpCall(RULES, "vdi_validate_discipline_output", {
  discipline: "IN",
  output: {
    discipline: "IN",
    output_type: "instrument_design",
    payload: {
      control_loops: [
        { loop_id: "LIC-001", description: "常压塔液位控制", type: "level", setpoint: "50%" },
        { loop_id: "PIC-001", description: "常压塔压力控制", type: "pressure", setpoint: "0.15 MPa" },
        { loop_id: "TIC-001", description: "常压炉出口温度控制", type: "temperature", setpoint: "350°C" }
      ],
      safety_interlocks: [
        { interlock_id: "PAHH-001", description: "常压塔高压联锁", type: "pressure_high_high", setpoint: "0.25 MPa", sil_rating: "SIL2" },
        { interlock_id: "TAHH-001", description: "常压炉出口高温联锁", type: "temperature_high_high", setpoint: "380°C", sil_rating: "SIL2" }
      ],
      instrument_count: 120,
      drawing_count: 15
    },
    citations: [
      { source_type: "standard", source_id: "SH/T 3005-2016", version: "2016", clause: "4.3" },
      { source_type: "standard", source_id: "GB/T 50770-2013", version: "2013", clause: "5.2" }
    ],
    risk_level: "high",
    confidence: 0.88,
    status: "draft"
  }
});
check("仪控输出校验", !inOutput.error && inOutput.valid !== false, inOutput.valid ? "通过" : inOutput.error || "失败");

console.log("\n4.4 发布仪控输出事件");
const inPublish = mcpCall(EVENTS, "vdi_publish_event", {
  project_id: PROJECT,
  event_type: "discipline_output.published",
  producer: "IN",
  payload: {
    discipline: "IN",
    output_type: "instrument_design",
    output_id: "DO-IN-001",
    version: "1.0",
    status: "published",
    summary: { control_loops: 3, safety_interlocks: 2, instrument_count: 120, drawing_count: 15 }
  }
});
check("发布仪控输出", !inPublish.error && inPublish.event_id, inPublish.event_id || inPublish.error);

// ════════════════════════════════════════════════════════
// 阶段 5：事件链验证
// ════════════════════════════════════════════════════════
console.log("\n── 阶段5：事件链验证──\n");

console.log("5.1 检查事件列表");
const eventList = mcpCall(EVENTS, "vdi_list_subscribers", {
  event_type: "design_basis.updated"
});
check("事件订阅者", !eventList.error && eventList.subscribers?.length > 0, `${eventList.subscribers?.length || 0} 个订阅者`);

console.log("\n5.2 验证事件链完整性");
const eventChainOk = dbEvent.event_id && piAck.status !== "error" && inAck.status !== "error";
check("事件链完整性", eventChainOk, eventChainOk ? "所有事件按顺序完成" : "事件链中断");

// ════════════════════════════════════════════════════════
// 阶段 6：进度跟踪
// ════════════════════════════════════════════════════════
console.log("\n── 阶段6：进度跟踪──\n");

console.log("6.1 更新任务状态");
const statusUpdate = mcpCall(ORC, "vdi_update_task_status", {
  project_id: PROJECT,
  wbs_id: wbs.wbs_items?.[0]?.wbs_id,
  status: "completed",
  progress_pct: 100,
  summary: "工艺设计基础已发布，管道和仪控专业已完成设计"
});
check("更新任务状态", !statusUpdate.error, statusUpdate.error || "OK");

console.log("\n6.2 检查里程碑");
const milestone = mcpCall(ORC, "vdi_check_milestone", {
  project_id: PROJECT,
  milestone_name: "design_basis_published"
});
check("里程碑检查", !milestone.error && milestone.achieved !== false, milestone.achieved ? "已达成" : milestone.error || "未达成");

// ════════════════════════════════════════════════════════
// 总结
// ════════════════════════════════════════════════════════
console.log("\n" + DIVIDER);
console.log(`  试点 B E2E 验证完成`);
console.log(`  通过: ${passed} / ${passed + failed}`);
console.log(`  失败: ${failed} / ${passed + failed}`);
console.log(DIVIDER);

if (failed > 0) {
  console.log("\n⚠️  存在失败项，请检查日志");
  process.exit(1);
} else {
  console.log("\n✅ 所有验证通过");
  process.exit(0);
}
