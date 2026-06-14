#!/usr/bin/env node
/**
 * 给排水知识库检索回归测试
 * 用法: node pilotdeck-vdi/scripts/test-water-knowledge-retrieval.mjs
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const KNOWLEDGE = path.join(ROOT, "mcp/vdi-knowledge/server-v2.mjs");
const MANIFEST = path.join(ROOT, "data/water-knowledge-manifest.json");

function mcpSearch(query, discipline = "water") {
  const req = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "vdi_search_knowledge",
      arguments: { query, discipline, limit: 3 },
    },
  });
  const tmp = path.join(os.tmpdir(), `vdi-water-kb-${Date.now()}.json`);
  try {
    fs.writeFileSync(tmp, req + "\n");
    const out = execSync(`node "${KNOWLEDGE}" < "${tmp}"`, {
      timeout: 10000,
      maxBuffer: 1024 * 1024,
      encoding: "utf8",
    });
    const parsed = JSON.parse(out);
    const text = parsed.result?.content?.[0]?.text;
    if (!text) return { hits: 0, results: [] };
    const data = JSON.parse(text);
    return { hits: data.results?.length || 0, results: data.results || [] };
  } catch (e) {
    return { hits: 0, error: String(e.message || e).slice(0, 200) };
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

const queries = JSON.parse(fs.readFileSync(MANIFEST, "utf8")).retrieval_regression_queries;

console.log("═".repeat(60));
console.log("  给排水知识库检索回归测试");
console.log("═".repeat(60));

let pass = 0;
let fail = 0;

for (const q of queries) {
  const { hits, results, error } = mcpSearch(q);
  const ok = hits >= 1;
  if (ok) pass++;
  else fail++;
  const icon = ok ? "✅" : "❌";
  const top = results[0]?.source_id || results[0]?.standard || "—";
  console.log(`${icon} [${hits}] ${q}`);
  if (top !== "—") console.log(`     → ${top} ${results[0]?.clause || ""}`);
  if (error) console.log(`     ⚠ ${error}`);
}

console.log("\n" + "─".repeat(60));
console.log(`  通过: ${pass}/${queries.length}  失败: ${fail}/${queries.length}`);
process.exit(fail > 0 ? 1 : 0);
