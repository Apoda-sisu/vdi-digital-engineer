#!/usr/bin/env node
/** 门禁：禁止在仓库根目录创建 skills/ 或 vdi-*-workspace/ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fail = 0;

if (fs.existsSync(path.join(REPO, "skills"))) {
  console.error("❌ 禁止根目录 skills/ — 请使用 workspaces/{专业组}/skills/");
  fail++;
}

for (const name of fs.readdirSync(REPO)) {
  if (name.startsWith("vdi-") && name.endsWith("-workspace")) {
    console.error(`❌ 禁止根目录 ${name}/ — 请使用 workspaces/{专业组}/skill-workspaces/`);
    fail++;
  }
}

if (fail) process.exit(1);
console.log("✅ 根目录无违规 Skill 路径");
