#!/usr/bin/env node
/**
 * 从 knowledge-clauses-v2.json 同步 manifest 统计
 * 用法: node pilotdeck-vdi/scripts/sync-knowledge-manifest.mjs [--discipline piping|water|process] [--write]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const KNOWLEDGE = path.join(ROOT, "data/knowledge-clauses-v2.json");

function normSourceId(id) {
  return String(id || "")
    .toUpperCase()
    .replace(/[\s/·.-]/g, "")
    .replace(/GB50316|GB50369|GB50264|GB50268|GB50933/g, (m) => m);
}

function sourceMatches(clauseSource, manifestSource) {
  const a = normSourceId(clauseSource);
  const b = normSourceId(manifestSource);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a) || a.startsWith(b.slice(0, 6)) || b.startsWith(a.slice(0, 6));
}

export function syncManifest(manifest, clauses, { write = false, manifestPath = null } = {}) {
  const discipline = manifest.discipline;
  const discClauses = clauses.filter((c) => c.discipline === discipline);
  const total = discClauses.length;

  manifest.current_clauses = total;
  manifest.updated_at = new Date().toISOString().slice(0, 10);

  const skillCounts = {};
  for (const c of discClauses) {
    for (const tag of c.skill_tags || []) {
      skillCounts[tag] = (skillCounts[tag] || 0) + 1;
    }
  }

  const standardCounts = {};
  for (const std of manifest.standards || []) {
    const count = discClauses.filter((c) => sourceMatches(c.source_id, std.source_id)).length;
    std.current_clauses = count;
    standardCounts[std.source_id] = count;
  }

  const gaps = [];
  const minimums = manifest.skill_clause_minimums || {};
  for (const [tag, min] of Object.entries(minimums)) {
    const current = skillCounts[tag] || 0;
    const gap = min - current;
    gaps.push({ tag, current, minimum: min, gap: gap > 0 ? gap : 0, ok: current >= min });
  }

  if (write && manifestPath) {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  }

  return { discipline, total, skillCounts, standardCounts, gaps };
}

function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const discArg = args.find((a) => !a.startsWith("--")) || "all";
  const disciplines =
    discArg === "all" ? ["piping", "water", "process"] : [discArg.replace(/^--discipline=/, "")];

  const kb = JSON.parse(fs.readFileSync(KNOWLEDGE, "utf8"));
  const clauses = kb.clauses || [];

  console.log("═".repeat(60));
  console.log("  知识库 Manifest 同步" + (write ? " (写入)" : " (dry-run)"));
  console.log("═".repeat(60));

  for (const d of disciplines) {
    const manifestPath = path.join(ROOT, `data/${d}-knowledge-manifest.json`);
    if (!fs.existsSync(manifestPath)) {
      console.log(`\n⚠ 跳过 ${d}：无 manifest`);
      continue;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const report = syncManifest(manifest, clauses, { write, manifestPath });

    console.log(`\n## ${d} — ${report.total} 条`);
    console.log("\n标准统计:");
    for (const [src, n] of Object.entries(report.standardCounts)) {
      console.log(`  ${src}: ${n}`);
    }
    console.log("\nSkill 配额:");
    for (const g of report.gaps) {
      const icon = g.ok ? "✅" : "❌";
      console.log(`  ${icon} ${g.tag}: ${g.current}/${g.minimum}${g.gap ? ` (缺 ${g.gap})` : ""}`);
    }
  }
}

if (process.argv[1]?.endsWith("sync-knowledge-manifest.mjs")) {
  main();
}
