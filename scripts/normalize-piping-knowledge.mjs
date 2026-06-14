#!/usr/bin/env node
/**
 * 统一管道条文 category / skill_tags，清理 legacy 入库条目
 * 用法: node scripts/normalize-piping-knowledge.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const V2_PATH = path.join(__dirname, "..", "pilotdeck-vdi/data/knowledge-clauses-v2.json");
const dryRun = process.argv.includes("--dry-run");

const CATEGORY_MAP = {
  "GB/T 20801-2020": "GB20801",
  "GB 50369-2014": "GB50369",
  "SH/T 3059-2012": "SH3059",
  "SH/T 3073-2016": "SH3073",
  "SH/T 3012-2011": "SH3012",
};

const SOURCE_UNIFY = {
  "SH/T 3059-2012": "SH/T 3059",
};

function tagForLegacy(clause) {
  const src = clause.source_id || "";
  const text = `${clause.content || ""} ${clause.category || ""}`;

  if (src.includes("50369")) {
    if (/埋|下沟|覆土|警示/.test(text)) return ["PI-D12"];
    if (/试压/.test(text)) return ["PI-D10", "PI-T06"];
    return ["PI-D10"];
  }
  if (src.includes("3012")) {
    if (/布置|检修|管廊/.test(text)) return ["PI-D03", "PI-D05"];
    if (/材料等级|介质/.test(text)) return ["PI-D01"];
    if (/补偿|高温/.test(text)) return ["PI-D03", "PI-D08"];
    return ["PI-D03"];
  }
  if (src.includes("3059")) return ["PI-D01", "PI-D11"];
  if (src.includes("3073")) return ["PI-D07"];
  if (src.includes("20801")) {
    const cat = clause.category || "";
    if (/材料|许用应力|冲击/.test(text) || cat.includes("材料")) return ["PI-D01"];
    if (/壁厚|设计压力|设计温度|腐蚀裕量|焊接接头/.test(text)) return ["PI-D01", "PI-D08"];
    if (/制造|焊接|无损/.test(text) || cat.includes("制造")) return ["PI-D10"];
    if (/检验|试验|气密|定期/.test(text) || cat.includes("检验")) return ["PI-D10", "PI-T06"];
    if (/安装/.test(text) || cat.includes("安装")) return ["PI-D12"];
    if (/使用/.test(text) || cat.includes("使用")) return ["PI-D10"];
    return ["PI-D08"];
  }
  return ["PI-D01"];
}

function isLegacyPiping(clause) {
  return clause.discipline === "piping" && !clause.file?.includes("phase1") && !clause.file?.includes("phase2");
}

const kb = JSON.parse(fs.readFileSync(V2_PATH, "utf8"));
let updated = 0;
const changes = [];

for (const c of kb.clauses) {
  if (c.discipline !== "piping") continue;

  const before = { category: c.category, tags: [...(c.skill_tags || [])], source: c.source_id };
  let touched = false;

  if (SOURCE_UNIFY[c.source_id]) {
    c.source_id = SOURCE_UNIFY[c.source_id];
    touched = true;
  }

  const normCat = CATEGORY_MAP[c.source_id] || CATEGORY_MAP[before.source];
  if (normCat && c.category !== normCat) {
    c.category = normCat;
    touched = true;
  } else if (!c.category && normCat) {
    c.category = normCat;
    touched = true;
  }

  if (isLegacyPiping(c) || (!c.skill_tags?.length && c.discipline === "piping")) {
    const tags = tagForLegacy(c);
    if (JSON.stringify(c.skill_tags || []) !== JSON.stringify(tags)) {
      c.skill_tags = tags;
      touched = true;
    }
    if (!c.mandatory && c.mandatory !== false) {
      c.mandatory = /应|不得|禁止|必须/.test(c.content || "");
      touched = true;
    }
  }

  if (touched) {
    updated++;
    changes.push({ id: c.clause_id, before, after: { category: c.category, tags: c.skill_tags, source: c.source_id } });
  }
}

const piping = kb.clauses.filter((c) => c.discipline === "piping");
const noTags = piping.filter((c) => !c.skill_tags?.length).length;
kb.stats = kb.stats || {};
kb.stats.disciplines = kb.stats.disciplines || {};
kb.stats.disciplines.piping = piping.length;
kb.stats.total_clauses = kb.clauses.length;
kb.built_at = new Date().toISOString();

console.log(`管道 normalize: 更新 ${updated} 条, 无 tag 剩余 ${noTags}, 管道总计 ${piping.length}`);

if (!dryRun) {
  fs.writeFileSync(V2_PATH, JSON.stringify(kb, null, 2) + "\n", "utf8");
  console.log(`已写入 ${V2_PATH}`);
} else {
  console.log("(dry-run，未写入)");
  changes.slice(0, 5).forEach((c) => console.log(JSON.stringify(c)));
}
