#!/usr/bin/env node
/**
 * PilotDeck 治理趋势分析
 * =======================
 * 对比历史门禁报告，检测退化和趋势。
 *
 * 用法:
 *   node pilotdeck-vdi/scripts/governance-trend.mjs              # 分析最近 7 天
 *   node pilotdeck-vdi/scripts/governance-trend.mjs --days 30   # 分析最近 30 天
 *   node pilotdeck-vdi/scripts/governance-trend.mjs --diff      # 与上次报告对比
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const VDI = path.resolve(__dirname, "..");
const REPORTS_DIR = path.join(VDI, "tests");

const args = process.argv.slice(2);
const diffIdx = args.indexOf("--days");
const DAYS = diffIdx >= 0 ? parseInt(args[diffIdx + 1]) : 7;
const DIFF = args.includes("--diff");

// ============================================================
// 收集报告文件
// ============================================================
function collectReports(days) {
  const reports = [];
  const files = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.startsWith("health-report-") && f.endsWith(".json"))
    .sort();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  for (const file of files) {
    const match = file.match(/health-report-(\d{4}-\d{2}-\d{2})\.json/);
    if (!match) continue;
    const date = new Date(match[1]);
    if (date >= cutoff) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, file), "utf8"));
        reports.push({ file, date: match[1], data });
      } catch { /* skip */ }
    }
  }

  // 也收集 gate-report.json
  const gatePath = path.join(REPORTS_DIR, "gate-report.json");
  if (fs.existsSync(gatePath)) {
    try {
      const gate = JSON.parse(fs.readFileSync(gatePath, "utf8"));
      reports.push({ file: "gate-report.json", date: gate.timestamp?.slice(0, 10) || "latest", data: gate });
    } catch { /* skip */ }
  }

  return reports;
}

// ============================================================
// 趋势分析
// ============================================================
function analyzeTrend(reports) {
  if (reports.length === 0) {
    console.log("  没有找到历史报告。");
    return;
  }

  console.log("\n" + "=".repeat(60));
  console.log("  PilotDeck 治理趋势分析");
  console.log(`  分析范围: 最近 ${DAYS} 天`);
  console.log(`  报告数量: ${reports.length}`);
  console.log("=".repeat(60));

  // 健康分数趋势
  const healthReports = reports.filter(r => r.data.summary?.health_score !== undefined);
  if (healthReports.length > 0) {
    console.log("\n  健康分数趋势:");
    for (const r of healthReports) {
      const score = r.data.summary.health_score;
      const bar = "█".repeat(Math.round(score / 5)) + "░".repeat(20 - Math.round(score / 5));
      const status = score >= 90 ? "✅" : score >= 70 ? "🟡" : "🔴";
      console.log(`    ${r.date} ${status} [${bar}] ${score}%`);
    }

    // 趋势方向
    if (healthReports.length >= 2) {
      const first = healthReports[0].data.summary.health_score;
      const last = healthReports[healthReports.length - 1].data.summary.health_score;
      const delta = last - first;
      if (delta > 0) console.log(`    📈 趋势: 上升 +${delta.toFixed(1)}%`);
      else if (delta < 0) console.log(`    📉 趋势: 下降 ${delta.toFixed(1)}%`);
      else console.log(`    ➡️  趋势: 稳定`);
    }
  }

  // 门禁报告趋势
  const gateReports = reports.filter(r => r.file === "gate-report.json" || r.data.blocked !== undefined);
  if (gateReports.length > 0) {
    console.log("\n  门禁状态:");
    for (const r of gateReports.slice(-5)) {
      const s = r.data.summary || {};
      const blocked = r.data.blocked ? "🔴 阻止" : "✅ 通过";
      console.log(`    ${r.date} ${blocked} | pass:${s.pass || 0} warn:${s.warn || 0} fail:${s.fail || 0} fixed:${s.fixed || 0}`);
    }
  }

  // 失败项退化检测
  const latestHealth = healthReports[healthReports.length - 1];
  if (latestHealth && healthReports.length >= 2) {
    const prev = healthReports[healthReports.length - 2];
    const latestFails = new Set(
      (latestHealth.data.checks || []).filter(c => c.status === "failed").map(c => c.id)
    );
    const prevFails = new Set(
      (prev.data.checks || []).filter(c => c.status === "failed").map(c => c.id)
    );

    const newFails = [...latestFails].filter(id => !prevFails.has(id));
    const resolvedFails = [...prevFails].filter(id => !latestFails.has(id));

    if (newFails.length > 0) {
      console.log("\n  ⚠️  新增失败项:");
      for (const id of newFails) {
        const check = latestHealth.data.checks.find(c => c.id === id);
        console.log(`    + ${id}: ${check?.name || "未知"} - ${check?.message || ""}`);
      }
    }

    if (resolvedFails.length > 0) {
      console.log("\n  ✅ 已解决的失败项:");
      for (const id of resolvedFails) {
        console.log(`    - ${id}`);
      }
    }

    if (newFails.length === 0 && resolvedFails.length === 0) {
      console.log("\n  ➡️  失败项无变化");
    }
  }

  // 统计摘要
  console.log("\n" + "=".repeat(60));
  const allChecks = healthReports.flatMap(r => r.data.checks || []);
  const totalPass = allChecks.filter(c => c.status === "passed").length;
  const totalFail = allChecks.filter(c => c.status === "failed").length;
  const totalWarn = allChecks.filter(c => c.status === "warning").length;
  console.log(`  累计统计 (${healthReports.length} 份报告):`);
  console.log(`    通过: ${totalPass}  失败: ${totalFail}  警告: ${totalWarn}`);
  console.log("=".repeat(60));
}

// ============================================================
// Diff 模式: 与上次报告对比
// ============================================================
function diffReports() {
  const gatePath = path.join(REPORTS_DIR, "gate-report.json");
  if (!fs.existsSync(gatePath)) {
    console.log("  gate-report.json 不存在，无法对比。");
    return;
  }

  const gate = JSON.parse(fs.readFileSync(gatePath, "utf8"));
  console.log("\n" + "=".repeat(60));
  console.log("  门禁报告详情 (最新)");
  console.log("=".repeat(60));
  console.log(`  时间: ${gate.timestamp}`);
  console.log(`  模式: ${gate.mode}`);
  console.log(`  阻止: ${gate.blocked ? "是" : "否"}`);
  console.log(`  通过: ${gate.summary?.pass || 0}`);
  console.log(`  警告: ${gate.summary?.warn || 0}`);
  console.log(`  失败: ${gate.summary?.fail || 0}`);
  console.log(`  修复: ${gate.summary?.fixed || 0}`);

  if (gate.details) {
    const fails = gate.details.filter(d => d.status === "fail");
    const warns = gate.details.filter(d => d.status === "warn");

    if (fails.length > 0) {
      console.log("\n  失败项:");
      for (const d of fails) {
        console.log(`    ✗ [${d.id}] ${d.msg}${d.fixable ? " (可修复)" : ""}`);
      }
    }

    if (warns.length > 0) {
      console.log("\n  警告项:");
      for (const d of warns) {
        console.log(`    ! [${d.id}] ${d.msg}`);
      }
    }
  }
}

// ============================================================
// 主流程
// ============================================================
function main() {
  if (DIFF) {
    diffReports();
    return;
  }

  const reports = collectReports(DAYS);
  analyzeTrend(reports);
}

main();
