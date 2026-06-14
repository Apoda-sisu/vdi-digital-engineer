#!/usr/bin/env node
/**
 * 批量导入工艺知识库种子
 * 用法: node scripts/ingest-all-process-knowledge.mjs
 */
import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SEEDS = path.join(ROOT, "pilotdeck-vdi/data/seeds");
const INGEST = path.join(ROOT, "scripts/ingest-process-knowledge.mjs");

const files = readdirSync(SEEDS)
  .filter((f) => f.startsWith("process-knowledge-") && f.endsWith(".json"))
  .sort();

for (const f of files) {
  console.log(`\n→ ${f}`);
  execSync(`node "${INGEST}" "${path.join(SEEDS, f)}"`, { stdio: "inherit", cwd: ROOT });
}
