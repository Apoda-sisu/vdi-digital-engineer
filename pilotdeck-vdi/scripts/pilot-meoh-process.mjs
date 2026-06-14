#!/usr/bin/env node
/**
 * MEOH-100 甲醇装置工艺试点 — 编排器 + 知识库 + PFD CP-1
 *
 * 用法:
 *   node pilotdeck-vdi/scripts/pilot-meoh-process.mjs
 *   node pilotdeck-vdi/scripts/pilot-meoh-process.mjs --cad-lite
 *   node pilotdeck-vdi/scripts/pilot-meoh-process.mjs --pid-cp2 --cad-lite
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

import { MEOH_PILOT, MEOH_PROJECT_ID, WORKSPACE_ROOT } from "../config/pilot-paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPO = path.resolve(ROOT, "..");
const PROJECT = MEOH_PROJECT_ID;

const ORC = path.join(ROOT, "mcp/vdi-orchestrator/server.mjs");
const KNOWLEDGE = path.join(ROOT, "mcp/vdi-knowledge/server-v2.mjs");

const cadLite = process.argv.includes("--cad-lite");
const runCad = cadLite || process.argv.includes("--cad");
const runPidCp2 = process.argv.includes("--pid-cp2");

function mcpCall(serverPath, tool, args) {
  const req = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: tool, arguments: args },
  });
  const tmpFile = path.join(os.tmpdir(), `meoh-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
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

console.log("═".repeat(56));
console.log("  MEOH-100 甲醇装置工艺试点");
console.log("═".repeat(56));

const testDataPath = path.join(MEOH_PILOT, "test-inputs/pid-01-must-data.json");
if (!existsSync(testDataPath)) {
  console.error("缺少测试数据:", testDataPath);
  process.exit(1);
}
const testData = JSON.parse(readFileSync(testDataPath, "utf8"));
check(
  "读取 pid-01-must-data.json",
  testData.material_balance?.stream_count > 0,
  `${testData.material_balance?.stream_count} 物流, ${testData.equipment_draft_datasheets?.count} 设备`
);

divider("1. 编排器 — 创建任务包");
const pkg = mcpCall(ORC, "vdi_create_task_package", {
  project_id: PROJECT,
  title: "甲醇合成装置工艺基础设计（MEOH-100）",
  description: "工艺包→PFD→P&ID→设备表 链路验证",
  disciplines: ["process"],
  milestones: [
    { name: "pfd_published", target_date: "2026-06-15" },
    { name: "pid_30pct", target_date: "2026-06-22" },
  ],
  standards: ["SH/T 3121-2022", "GB/T 50933-2013", "HG/T 20570-2015"],
  risk_level: "high",
});
check("创建任务包", !pkg.error && pkg.package_id, pkg.package_id || pkg.error);

divider("2. WBS 拆解 + 派发");
const wbs = mcpCall(ORC, "vdi_decompose_tasks", { project_id: PROJECT });
check("WBS 拆解", !wbs.error && (wbs.wbs_items?.length ?? 0) > 0, wbs.error || `${wbs.wbs_items?.length ?? 0} 项`);

const dispatch = mcpCall(ORC, "vdi_dispatch_task", {
  project_id: PROJECT,
  wbs_id: wbs.wbs_items?.[0]?.wbs_id,
  target_skill: "工艺流程图 PFD",
});
check("派发 PFD 任务", !dispatch.error, dispatch.status || dispatch.error || "OK");

divider("3. 知识库检索");
for (const q of ["甲醇合成 工艺设计", "PFD 设计深度", "精馏塔 设计"]) {
  const kb = mcpCall(KNOWLEDGE, "vdi_search_knowledge", { query: q, discipline: "process", top_k: 2 });
  const hit = kb.results?.[0]?.source_id || kb.clauses?.[0]?.source_id || "—";
  check(`检索「${q}」`, !kb.error && (kb.results?.length > 0 || kb.clauses?.length > 0), hit);
}

divider("4. 塔器试算 T-201（PR-COL-001）");
const col = mcpCall(KNOWLEDGE, "vdi_calculate", {
  formula_id: "PR-COL-001",
  inputs: { V: 1.8, C: 0.08, ρL: 750, ρV: 2.0 },
});
const d = col.result?.D ?? col.outputs?.D ?? col.D;
check("精馏塔塔径估算", !col.error && d != null, d != null ? `D ≈ ${Number(d).toFixed(2)} m` : col.error);

if (runPidCp2) {
  divider("5. P&ID CP-2");
  try {
    const cadArgs = cadLite ? "--lite" : "";
    execSync(`node "${path.join(ROOT, "mcp/vdi-cad/run-pid-cp2.mjs")}" ${cadArgs}`, {
      cwd: REPO,
      stdio: "inherit",
      env: { ...process.env, VDI_WORKSPACE_ROOT: WORKSPACE_ROOT },
    });
    check("P&ID CP-2 出图", true, cadLite ? "lite 模式" : "完整模式");
  } catch {
    check("P&ID CP-2 出图", false, "FreeCAD RPC 未启动");
  }
} else if (runCad) {
  divider("5. PFD CAD CP-1");
  try {
    const cadArgs = cadLite ? "--lite" : "";
    execSync(`node "${path.join(ROOT, "mcp/vdi-cad/run-pfd-cp1.mjs")}" ${cadArgs}`, {
      cwd: REPO,
      stdio: "inherit",
      env: { ...process.env, VDI_WORKSPACE_ROOT: WORKSPACE_ROOT },
    });
    check("PFD CAD 出图", true, cadLite ? "lite 模式" : "完整模式");
  } catch {
    check("PFD CAD 出图", false, "FreeCAD RPC 未启动");
  }
} else {
  divider("5. CAD（跳过，加 --pid-cp2 --cad-lite 或 --cad-lite）");
}

console.log("\n" + "═".repeat(56));
console.log(`  试点完成 — ${passed} 通过 / ${failed} 失败`);
console.log(`  工作空间: ${MEOH_PILOT}`);
console.log("═".repeat(56));

process.exit(failed > 0 ? 1 : 0);
