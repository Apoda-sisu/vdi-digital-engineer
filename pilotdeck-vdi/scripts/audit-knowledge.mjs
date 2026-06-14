#!/usr/bin/env node
/**
 * 全库知识库治理审计
 * 用法: node pilotdeck-vdi/scripts/audit-knowledge.mjs [--json]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncManifest } from "./sync-knowledge-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");
const KNOWLEDGE = path.join(DATA, "knowledge-clauses-v2.json");
const jsonOut = process.argv.includes("--json");

const kb = JSON.parse(fs.readFileSync(KNOWLEDGE, "utf8"));
const clauses = kb.clauses || [];

const manifestFiles = fs.readdirSync(DATA).filter((f) => f.endsWith("-knowledge-manifest.json"));
const manifestDisciplines = manifestFiles.map((f) => f.replace("-knowledge-manifest.json", ""));

const byDisc = {};
for (const c of clauses) {
  const d = c.discipline || "(empty)";
  if (!byDisc[d]) byDisc[d] = { total: 0, tagged: 0, short: 0 };
  byDisc[d].total++;
  if (c.skill_tags?.length) byDisc[d].tagged++;
  if ((c.content || "").length < 20) byDisc[d].short++;
}

const tagCoverage = Object.entries(byDisc).map(([d, s]) => ({
  discipline: d,
  total: s.total,
  tagged: s.tagged,
  untagged: s.total - s.tagged,
  coverage_pct: s.total ? Math.round((s.tagged / s.total) * 1000) / 10 : 0,
  short_content: s.short,
}));

const skillGaps = [];
for (const file of manifestFiles) {
  const manifestPath = path.join(DATA, file);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const report = syncManifest(manifest, clauses);
  for (const g of report.gaps.filter((x) => !x.ok)) {
    skillGaps.push({ manifest: manifest.discipline, ...g });
  }
}

const shortSamples = clauses
  .filter((c) => (c.content || "").length < 20)
  .slice(0, 10)
  .map((c) => ({ id: c.clause_id, discipline: c.discipline, content: c.content }));

const allDisciplines = [...new Set(clauses.map((c) => c.discipline).filter(Boolean))];
const noManifest = allDisciplines.filter((d) => !manifestDisciplines.includes(d));

const pipingCount = byDisc.piping?.total || 0;
const phase2Target = 300;
const issues = [];

if (pipingCount < phase2Target) issues.push(`piping 条文 ${pipingCount} < Phase2 目标 ${phase2Target}`);
for (const g of skillGaps.filter((g) => g.manifest === "piping")) {
  issues.push(`${g.tag}: ${g.current}/${g.minimum}`);
}
if ((byDisc.piping?.total || 0) - (byDisc.piping?.tagged || 0) > 0) {
  issues.push(`piping 仍有 ${byDisc.piping.total - byDisc.piping.tagged} 条无 skill_tags`);
}

const report = {
  built_at: kb.built_at,
  total_clauses: clauses.length,
  tag_coverage: tagCoverage,
  skill_gaps: skillGaps,
  short_content_total: clauses.filter((c) => (c.content || "").length < 20).length,
  short_samples: shortSamples,
  disciplines_without_manifest: noManifest.map((d) => ({
    discipline: d,
    clauses: byDisc[d]?.total || 0,
  })),
  issues,
};

if (jsonOut) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("═".repeat(60));
  console.log("  全库知识库治理审计");
  console.log("═".repeat(60));
  console.log(`\n全库 ${report.total_clauses} 条 · 短内容 ${report.short_content_total} 条\n`);

  console.log("## Tag 覆盖率");
  for (const t of tagCoverage.sort((a, b) => b.total - a.total)) {
    console.log(`  ${t.discipline}: ${t.tagged}/${t.total} (${t.coverage_pct}%) 短内容 ${t.short_content}`);
  }

  console.log("\n## Skill 缺口（manifest 对比）");
  if (skillGaps.length === 0) console.log("  ✅ 无缺口");
  else skillGaps.forEach((g) => console.log(`  ❌ [${g.manifest}] ${g.tag}: ${g.current}/${g.minimum}`));

  console.log("\n## 无 Manifest 专业");
  for (const d of report.disciplines_without_manifest) {
    console.log(`  ${d.discipline}: ${d.clauses} 条`);
  }

  if (issues.length) {
    console.log("\n## 问题");
    issues.forEach((i) => console.log(`  ❌ ${i}`));
  } else {
    console.log("\n✅ 管道 Phase2 与 tag 覆盖率检查通过");
  }
}

process.exit(issues.length > 0 ? 1 : 0);
