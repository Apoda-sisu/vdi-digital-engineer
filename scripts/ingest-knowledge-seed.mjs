#!/usr/bin/env node
/**
 * 导入种子条文到 knowledge-clauses-v2.json（按 seed.discipline 统计）
 * 用法: node scripts/ingest-knowledge-seed.mjs <seed.json> [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const V2_PATH = path.join(ROOT, "pilotdeck-vdi/data/knowledge-clauses-v2.json");
const SEED_PATH = process.argv[2] ? path.resolve(process.argv[2]) : null;
const dryRun = process.argv.includes("--dry-run");

if (!SEED_PATH) {
  console.error("用法: node scripts/ingest-knowledge-seed.mjs <seed.json> [--dry-run]");
  process.exit(1);
}

const seedBasename = path.basename(SEED_PATH);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\u4e00-\u9fff\w\s/.-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function enrich(clause) {
  const id = clause.clause_id || crypto.createHash("md5").update(`${clause.source_id}-${clause.clause}-${clause.content}`).digest("hex").slice(0, 12);
  const parts = String(clause.clause || "0").split(".");
  return {
    ...clause,
    clause_id: id,
    tokens: tokenize(`${clause.source_id} ${clause.clause} ${clause.content} ${(clause.keywords || []).join(" ")}`),
    hierarchy: {
      chapter: parts[0] || "0",
      section: parts.slice(0, 2).join(".") || clause.clause,
      article: clause.clause,
    },
    file: `seeds/${seedBasename}`,
  };
}

const knowledge = JSON.parse(fs.readFileSync(V2_PATH, "utf8"));
const seed = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
const discipline = seed.discipline || seed.clauses[0]?.discipline || "unknown";
const existingIds = new Set((knowledge.clauses || []).map((c) => c.clause_id));

let added = 0;
let skipped = 0;

for (const raw of seed.clauses) {
  const clause = enrich(raw);
  if (existingIds.has(clause.clause_id)) {
    skipped++;
    continue;
  }
  knowledge.clauses.push(clause);
  existingIds.add(clause.clause_id);
  added++;
}

const discCount = knowledge.clauses.filter((c) => c.discipline === discipline).length;
knowledge.stats = knowledge.stats || {};
knowledge.stats.total_clauses = knowledge.clauses.length;
knowledge.stats.disciplines = knowledge.stats.disciplines || {};
knowledge.stats.disciplines[discipline] = discCount;
knowledge.built_at = new Date().toISOString();

console.log(`${discipline} 种子导入: 新增 ${added}, 跳过 ${skipped}, ${discipline} 总计 ${discCount}, 全库 ${knowledge.clauses.length}`);

if (!dryRun) {
  fs.writeFileSync(V2_PATH, JSON.stringify(knowledge, null, 2) + "\n", "utf8");
  console.log(`已写入 ${V2_PATH}`);
} else {
  console.log("(dry-run，未写入)");
}
