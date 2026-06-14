#!/usr/bin/env node
/** 知识库 clause.discipline：slug → CFIHOS 两字母码 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SLUG_TO_CFIHOS = {
  process: "PX",
  piping: "MP",
  water: "CI",
  instrument: "IN",
  electrical: "EA",
  equipment: "MX",
  hs: "HS",
  hse: "HS",
  fire: "HX",
  hazop: "HX",
  structural: "CS",
  architectural: "CB",
  material: "RA",
  hvac: "MH",
  management: "AA",
  quality: "QA",
  procurement: "VA",
  system: "JA",
};

function migrateFile(fp) {
  const data = JSON.parse(fs.readFileSync(fp, "utf8"));
  let n = 0;
  const clauses = data.clauses || data;
  const list = Array.isArray(clauses) ? clauses : null;
  if (!list) return 0;
  for (const c of list) {
    if (!c.discipline) continue;
    const key = c.discipline.toLowerCase();
    const cfihos = SLUG_TO_CFIHOS[key];
    if (cfihos && c.discipline !== cfihos) {
      c.discipline = cfihos;
      n++;
    }
  }
  if (n) fs.writeFileSync(fp, JSON.stringify(data, null, 2) + "\n");
  return n;
}

const targets = [
  "data/knowledge-clauses-v2.json",
  "data/seeds/piping-knowledge-phase1.json",
  "data/seeds/piping-knowledge-phase2.json",
  "data/seeds/process-knowledge-phase1.json",
  "data/seeds/process-knowledge-phase2.json",
  "data/seeds/process-knowledge-phase2f.json",
  "data/seeds/water-knowledge-phase1.json",
  "data/seeds/water-knowledge-phase2.json",
].map((p) => path.join(ROOT, p)).filter((p) => fs.existsSync(p));

let total = 0;
for (const fp of targets) {
  const n = migrateFile(fp);
  total += n;
  console.log(`✅ ${path.relative(ROOT, fp)}: ${n} 条`);
}
console.log(`\n🎉 知识库 discipline → CFIHOS 合计 ${total} 条`);
