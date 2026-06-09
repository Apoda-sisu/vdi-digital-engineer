#!/usr/bin/env node
/**
 * PilotDeck 治理仪表板构建器
 * ===========================
 * 读取最新报告数据，注入到 HTML 模板，生成可直接打开的仪表板。
 *
 * 用法:
 *   node pilotdeck-vdi/scripts/build-dashboard.mjs
 *
 * 输出:
 *   pilotdeck-vdi/data/governance-dashboard.html (已更新)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VDI = path.resolve(__dirname, "..");

const TEMPLATE_PATH = path.join(VDI, "data/governance-dashboard.html");
const GATE_PATH = path.join(VDI, "tests/gate-report.json");
const HEALTH_DIR = path.join(VDI, "tests");

function readJSON(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function findLatestHealthReport() {
  const files = fs.readdirSync(HEALTH_DIR)
    .filter(f => f.startsWith("health-report-") && f.endsWith(".json"))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  return readJSON(path.join(HEALTH_DIR, files[0]));
}

function main() {
  const gate = readJSON(GATE_PATH) || {};
  const health = findLatestHealthReport() || {};

  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error("模板文件不存在:", TEMPLATE_PATH);
    process.exit(1);
  }

  let html = fs.readFileSync(TEMPLATE_PATH, "utf8");

  // 注入数据
  html = html.replace("__GATE_REPORT__", JSON.stringify(gate));
  html = html.replace("__HEALTH_REPORT__", JSON.stringify(health));

  fs.writeFileSync(TEMPLATE_PATH, html);

  console.log("✅ 治理仪表板已更新:", TEMPLATE_PATH);
  console.log(`   门禁报告: ${gate.timestamp || "无"}`);
  console.log(`   健康报告: ${health.timestamp || "无"}`);
}

main();
