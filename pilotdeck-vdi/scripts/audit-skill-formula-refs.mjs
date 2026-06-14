#!/usr/bin/env node
/**
 * Skill formula_ids 引用完整性审计（门禁）
 *
 * 「门禁」= 提交/合并前的自动检查：Skill 里写的公式 ID 必须在公式库中存在，
 * 否则 Agent 按 SKILL 调用 vdi_calculate 会得到 404。
 *
 * 用法:
 *   node pilotdeck-vdi/scripts/audit-skill-formula-refs.mjs
 * 退出码: 0 通过，1 有缺失引用
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listAllSkillSlugs, skillDir } from "../config/skills-layout.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FORMULA_INDEX = path.join(ROOT, "data/formulas/index.json");

function parseFormulaIdsFromYaml(yaml) {
  const ids = [];
  const inline = yaml.match(/formula_ids:\s*\[([^\]]+)\]/);
  if (inline) {
    ids.push(...inline[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")));
  }
  const block = yaml.match(/formula_ids:\n((?:\s+-\s+.+\n)+)/);
  if (block) {
    ids.push(
      ...(block[1].match(/-\s+(\S+)/g) || []).map((s) =>
        s.replace(/^-\s+/, "").replace(/^["']|["']$/g, "")
      )
    );
  }
  return [...new Set(ids.filter(Boolean))];
}

const idx = JSON.parse(fs.readFileSync(FORMULA_INDEX, "utf8"));
const formulaIds = new Set((idx.formulas || []).map((f) => f.formula_id));

const failures = [];
const passed = [];

for (const slug of listAllSkillSlugs()) {
  const p = path.join(skillDir(slug), "SKILL.md");
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, "utf8");
  const yaml = text.match(/^---\n([\s\S]*?)\n---/)?.[1] || "";
  if (!/formula_ids:/.test(yaml)) continue;

  for (const id of parseFormulaIdsFromYaml(yaml)) {
    if (formulaIds.has(id)) {
      passed.push(`${slug} → ${id}`);
    } else {
      failures.push({ slug, id });
    }
  }
}

console.log("═".repeat(60));
console.log("  Skill formula_ids 引用门禁");
console.log("═".repeat(60));
console.log(`\n✅ 通过: ${passed.length}`);
if (passed.length <= 8) passed.forEach((p) => console.log(`   · ${p}`));
else {
  passed.slice(0, 5).forEach((p) => console.log(`   · ${p}`));
  console.log(`   ... 及 ${passed.length - 5} 项`);
}

if (failures.length) {
  console.log(`\n❌ 缺失: ${failures.length}`);
  for (const f of failures) {
    console.log(`   · ${f.slug}: formula_ids 含 ${f.id}，公式库中不存在`);
  }
  console.log("\n修复方式: 改 SKILL.md 的 formula_ids 与正文 calc_type 表一致，或先在 data/formulas/ 补公式。");
  process.exit(1);
}

console.log("\n🎉 全部 Skill 公式引用有效");
