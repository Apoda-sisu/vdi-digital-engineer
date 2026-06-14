#!/usr/bin/env node
/** 将 dashboard-data.json 同步到 dashboard-enhanced.html 内嵌快照 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data/dashboard-data.json");
const HTML = path.join(ROOT, "data/dashboard-enhanced.html");

const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
let html = fs.readFileSync(HTML, "utf8");
const re = /(const EMBEDDED_SNAPSHOT = )\{[\s\S]*?\n\};/;
if (!re.test(html)) {
  console.error("未找到 EMBEDDED_SNAPSHOT 块");
  process.exit(1);
}
html = html.replace(re, `$1${JSON.stringify(data, null, 2)};`);
fs.writeFileSync(HTML, html);
console.log("✅ dashboard-enhanced.html EMBEDDED_SNAPSHOT 已同步");
