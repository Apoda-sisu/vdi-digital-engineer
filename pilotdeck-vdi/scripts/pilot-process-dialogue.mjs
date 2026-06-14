#!/usr/bin/env node
/**
 * 工艺组 CP-0 对话试点 — 常减压装置（ATFD-DEMO）
 *
 * 工作空间：workspaces/工艺组/pilot/atfd-demo
 * 用法: node pilotdeck-vdi/scripts/pilot-process-dialogue.mjs
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { ATFD_PILOT, ATFD_PROJECT_ID, WORKSPACE_ROOT } from "../config/pilot-paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PROJECT = ATFD_PROJECT_ID;
const WS = ATFD_PILOT;

const KNOWLEDGE = path.join(ROOT, "mcp/vdi-knowledge/server-v2.mjs");
const ORC = path.join(ROOT, "mcp/vdi-orchestrator/server.mjs");

const DEPRECATED = "PFD-PID设计";

function mcpCall(serverPath, tool, args) {
  const req = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: tool, arguments: args },
  });
  const tmpFile = path.join(os.tmpdir(), `vdi-pilot-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  try {
    writeFileSync(tmpFile, req + "\n", "utf8");
    const out = execSync(`node "${serverPath}" < "${tmpFile}"`, {
      timeout: 15000,
      maxBuffer: 2 * 1024 * 1024,
      shell: "/bin/bash",
      env: { ...process.env, VDI_WORKSPACE_ROOT: WORKSPACE_ROOT },
    });
    const parsed = JSON.parse(out.toString());
    const text = parsed.result?.content?.[0]?.text;
    if (!text) return { error: "empty response" };
    return JSON.parse(text);
  } catch (err) {
    const message = err.stdout?.toString() || err.stderr?.toString() || String(err);
    return { error: message.slice(0, 400) };
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {}
  }
}

function say(role, text) {
  const icon = role === "用户" ? "👤" : "🤖";
  console.log(`\n${icon} 【${role}】`);
  console.log(text);
}

function divider(title) {
  console.log("\n" + "─".repeat(56));
  console.log(`  ${title}`);
  console.log("─".repeat(56));
}

let passed = 0;
let failed = 0;
function check(label, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✅ ${label}${detail ? ": " + detail : ""}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}${detail ? ": " + detail : ""}`);
  }
}

divider("Turn 1 — 用户下达工艺任务");
say(
  "用户",
  `请读取 design-basis/basis-001.json，作为工艺专业负责人执行 CP-0：
检查数据完整性，给出 WBS 拆解方案（工艺包→路线→平衡→PFD→P&ID），
project_id: ${PROJECT}`
);

divider("Agent 动作 — 读取设计基础");
let basis;
try {
  basis = JSON.parse(readFileSync(path.join(WS, "design-basis/basis-001.json"), "utf8"));
  check("读取 basis-001.json", basis.basis_id === "BASIS-001", basis.basis_id);
  check("原料参数齐全", !!basis.feedstock?.flow_rate_kg_h, `${basis.feedstock.flow_rate_kg_h} kg/h`);
  check("产品参数齐全", !!basis.product?.flow_rate_kg_h, `${basis.product.name}`);
  check("citations 存在", basis.citations?.length >= 1, `${basis.citations?.length} 条`);
} catch (e) {
  check("读取 basis-001.json", false, String(e));
  basis = {};
}

divider("Agent 动作 — vdi_search_knowledge");
const kbPfd = mcpCall(KNOWLEDGE, "vdi_search_knowledge", {
  query: "工艺流程图 PFD 设计规范 SH/T",
  discipline: "process",
  top_k: 3,
});
check(
  "PFD 规范检索",
  !kbPfd.error && (kbPfd.results?.length > 0 || kbPfd.clauses?.length > 0),
  kbPfd.results?.length ? `${kbPfd.results.length} 条` : kbPfd.error
);

const kbPkg = mcpCall(KNOWLEDGE, "vdi_search_knowledge", {
  query: "工艺包 设计基础 编制要求",
  discipline: "process",
  top_k: 2,
});
check("工艺包规范检索", !kbPkg.error, kbPkg.error || "OK");

divider("Agent 动作 — vdi_create_task_package");
const pkg = mcpCall(ORC, "vdi_create_task_package", {
  project_id: PROJECT,
  title: "常减压蒸馏装置工艺基础设计（工艺组试点）",
  description: "CP-0 WBS 拆解验证：工艺包→路线→平衡→PFD→P&ID",
  disciplines: ["process"],
  milestones: [{ name: "cp0_wbs_approved", target_date: "2026-06-11" }],
  standards: ["SH/T 3011-2017", "GB 50160-2008"],
  risk_level: "high",
});
check("创建任务包", !pkg.error && pkg.package_id, pkg.package_id || pkg.error);

divider("Agent 动作 — vdi_calculate PR-COL-001（塔径试算）");
const colCalc = mcpCall(KNOWLEDGE, "vdi_calculate", {
  formula_id: "PR-COL-001",
  inputs: { V: 2.5, C: 0.08, ρL: 800, ρV: 2.5 },
});
const colD = colCalc.result?.D ?? colCalc.outputs?.D ?? colCalc.D;
check("塔器计算 PR-COL-001", !colCalc.error && colD != null, colD != null ? `D ≈ ${Number(colD).toFixed(2)} m` : colCalc.error);

divider("Turn 2 — Agent CP-0 回复");

const wbsRows = [
  ["1", "工艺包与设计基础", "工艺包与设计基础", "16h", "无", "basis-001 + 规范"],
  ["2", "工艺路线", "工艺路线设计基础", "24h", "#1", "原料/产品方案"],
  ["3", "物料/热量平衡", "物料热量平衡", "32h", "#2", "route_output"],
  ["4", "PFD", "工艺流程图 PFD", "24h", "#3", "material_balance"],
  ["5", "P&ID", "管道仪表流程图", "32h", "#4", "pfd_output"],
  ["6", "设备数据表", "工艺设备数据表", "24h", "#3+#4", "balance + pfd_tags"],
  ["7", "管道水力", "管道水力与管径", "16h", "#5", "pid_line_list"],
  ["8", "安全泄压", "安全泄压与火炬", "16h", "#5", "pid + 操作工况"],
  ["9", "控制方案", "控制方案与联锁", "16h", "#5", "pid_instruments"],
  ["10", "公用工程", "公用工程系统", "12h", "#3", "heat_balance + utilities"],
  ["11", "工艺安全", "工艺安全分析", "24h", "#5", "pid_document"],
];

const usesDeprecated = wbsRows.some((r) => r[2].includes(DEPRECATED));
check("WBS 未引用 deprecated PFD-PID", !usesDeprecated);
check("WBS 覆盖 V2 L2 核心交付物", wbsRows.length >= 9, `${wbsRows.length} 项`);

say(
  "Agent（工艺专业负责人 · CP-0）",
  `## 📋 CP-0 WBS 拆解方案

### 数据完整性检查
| 检查项 | 状态 | 说明 |
|--------|------|------|
| 设计能力/原料 | ✅ | 原油 ${basis.feedstock?.flow_rate_kg_h ?? "—"} kg/h |
| 产品规格 | ✅ | ${basis.product?.name ?? "—"} ${basis.product?.flow_rate_kg_h ?? "—"} kg/h |
| 界区条件 | ✅ | 进料 T=${basis.battery_limit?.feed_in?.T_C}°C P=${basis.battery_limit?.feed_in?.P_MPa} MPa |
| citations | ✅ | ${basis.citations?.length ?? 0} 条 |

### 子领域拆解（V2 路由）
| 序号 | 子领域 | Skill | 工时 | 依赖 |
|------|--------|-------|------|------|
${wbsRows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} | ${r[4]} |`).join("\n")}

> 请审核拆解方案，回复「确认」后进入 CP-1 派发子任务。

⛔ [CP-0 完成] — 等待人类响应`
);

divider("Turn 3 — 用户确认");
say("用户", "确认");

divider("Turn 4 — Agent CP-1 回复（首批派发）");
const wbs = mcpCall(ORC, "vdi_decompose_tasks", { project_id: PROJECT });
check("WBS 拆解", !wbs.error && (wbs.wbs_items?.length ?? 0) > 0, wbs.error || `${wbs.wbs_items?.length ?? 0} 项`);

const dispatch1 = mcpCall(ORC, "vdi_dispatch_task", {
  project_id: PROJECT,
  wbs_id: wbs.wbs_items?.[0]?.wbs_id,
  target_skill: "工艺包与设计基础",
});
check("派发工艺包任务", !dispatch1.error, dispatch1.status || dispatch1.error || "OK");

say(
  "Agent（工艺专业负责人 · CP-1）",
  `## 📤 CP-1 子任务派发（首批）

| 任务 | Skill | 状态 |
|------|-------|------|
| TASK-PKG-001 | 工艺包与设计基础 | 🟡 已派发 |

⛔ [CP-1 完成] — 等待人类响应`
);

console.log("\n" + "═".repeat(56));
console.log("  工艺组 CP-0 对话试点 — 验证总结");
console.log("═".repeat(56));
console.log(`  MCP 检查: ${passed} 通过 / ${failed} 失败`);
console.log(`  工作空间: ${WS}`);
console.log("═".repeat(56));

process.exit(failed > 0 ? 1 : 0);
