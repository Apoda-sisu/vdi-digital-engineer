#!/usr/bin/env node
/**
 * 全面适配学科代码体系：
 * 1. 更新 SKILL.md 的 sub_discipline 字段为单字母代码
 * 2. 更新 vdi-rules.json 的 discipline/sub_discipline 键为代码
 * 3. 更新 MCP 服务器中的工具描述
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

// ============================================================
// 子专业英文→单字母代码映射（按学科）
// ============================================================
const SUB_DISCIPLINE_MAP = {
  // 给排水
  supply: "S",
  fire: "F",
  drainage: "D",
  stormwater: "R",
  wastewater: "W",
  circulating: "C",
  equipment: "E",
  hydraulics: "H",
  // 工艺
  route: "R",
  balance: "B",
  pfd_pid: "P",
  safety: "F",
  utilities: "U",
  calc: "C",
  simulation: "S",
};

// 学科英文→代码映射
const DISCIPLINE_MAP = {
  water: "WA",
  process: "PR",
  piping: "PI",
  instrument: "IN",
  electrical: "EL",
  equipment: "EQ",
  hvac: "HV",
  fire: "FI",
  hse: "HS",
  structure: "ST",
  architecture: "AR",
  site: "SI",
  thermal: "TH",
  telecom: "TC",
  qa: "QA",
  scheduler: "MG",
  design_management: "MG",
};

let totalChanges = 0;

// ============================================================
// Step 1: 更新 SKILL.md 的 sub_discipline 字段
// ============================================================
console.log("=== Step 1: 更新 SKILL.md sub_discipline 字段 ===\n");
const SKILLS_DIR = join(ROOT, "skills");

for (const entry of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
  const mdPath = join(SKILLS_DIR, entry.name, "SKILL.md");
  let content = readFileSync(mdPath, "utf8");
  let changed = false;

  // 替换 sub_discipline: xxx
  for (const [old, code] of Object.entries(SUB_DISCIPLINE_MAP)) {
    const pattern = new RegExp(`^(\\s+sub_discipline:\\s*)${old}\\s*$`, "m");
    if (pattern.test(content)) {
      content = content.replace(pattern, `$1${code}`);
      console.log(`  ${entry.name}: sub_discipline ${old} → ${code}`);
      changed = true;
      totalChanges++;
    }
  }

  // 替换 discipline: xxx（仅非 water/process 的才会匹配，因为 DISCIPLINE_MAP 包含它们）
  for (const [old, code] of Object.entries(DISCIPLINE_MAP)) {
    const pattern = new RegExp(`^(\\s+discipline:\\s*)${old}\\s*$`, "m");
    if (pattern.test(content)) {
      content = content.replace(pattern, `$1${code}`);
      console.log(`  ${entry.name}: discipline ${old} → ${code}`);
      changed = true;
      totalChanges++;
    }
  }

  if (changed) {
    writeFileSync(mdPath, content, "utf8");
  }
}

// ============================================================
// Step 2: 更新 vdi-rules.json
// ============================================================
console.log("\n=== Step 2: 更新 vdi-rules.json ===\n");
const RULES_PATH = join(ROOT, "pilotdeck-vdi", "mcp", "vdi-rules", "vdi-rules.json");
let rules = JSON.parse(readFileSync(RULES_PATH, "utf8"));

// 2a: 更新 redlines 中的 discipline 数组
for (const rule of rules.redlines || []) {
  const newDisc = rule.discipline.map((d) => DISCIPLINE_MAP[d] || d);
  if (JSON.stringify(newDisc) !== JSON.stringify(rule.discipline)) {
    console.log(`  RL ${rule.id}: discipline ${rule.discipline} → ${newDisc}`);
    rule.discipline = newDisc;
    totalChanges++;
  }
}

// 2b: 更新 output_contracts 的键
if (rules.output_contracts) {
  const newContracts = {};
  for (const [disc, contract] of Object.entries(rules.output_contracts)) {
    const code = DISCIPLINE_MAP[disc] || disc;
    console.log(`  output_contracts: ${disc} → ${code}`);
    newContracts[code] = contract;
    totalChanges++;

    // 更新子专业键
    if (contract.sub_discipline_contracts) {
      const newSubContracts = {};
      for (const [sub, subContract] of Object.entries(contract.sub_discipline_contracts)) {
        const subCode = SUB_DISCIPLINE_MAP[sub] || sub;
        newSubContracts[subCode] = subContract;
        if (subCode !== sub) {
          console.log(`    sub_contract: ${sub} → ${subCode}`);
          totalChanges++;
        }
      }
      contract.sub_discipline_contracts = newSubContracts;
    }
  }
  rules.output_contracts = newContracts;
}

// 2c: 更新 data_contracts 的键
if (rules.data_contracts) {
  const newDataContracts = {};
  for (const [disc, contract] of Object.entries(rules.data_contracts)) {
    const code = DISCIPLINE_MAP[disc] || disc;
    console.log(`  data_contracts: ${disc} → ${code}`);
    totalChanges++;

    // 更新子专业键
    const newSubContracts = {};
    for (const [sub, subContract] of Object.entries(contract)) {
      const subCode = SUB_DISCIPLINE_MAP[sub] || sub;
      newSubContracts[subCode] = subContract;
      if (subCode !== sub) {
        console.log(`    sub_data: ${sub} → ${subCode}`);
        totalChanges++;
      }
    }
    newDataContracts[code] = newSubContracts;
  }
  rules.data_contracts = newDataContracts;
}

writeFileSync(RULES_PATH, JSON.stringify(rules, null, 2) + "\n", "utf8");

// ============================================================
// Step 3: 更新 MCP 服务器工具描述中的示例
// ============================================================
console.log("\n=== Step 3: 更新 MCP 服务器工具描述 ===\n");

// vdi-events/server.mjs
const EVENTS_PATH = join(ROOT, "pilotdeck-vdi", "mcp", "vdi-events", "server.mjs");
let eventsContent = readFileSync(EVENTS_PATH, "utf8");

// 更新 producer 描述
eventsContent = eventsContent.replace(
  /producer: z\.string\(\)\.describe\("生产者专业标识，如 .+?"\)/,
  'producer: z.string().describe("生产者专业标识（学科码），如 PR / WA / PI")'
);
// 更新 discipline 描述（多处）
eventsContent = eventsContent.replace(
  /discipline: z\.string\(\)\.describe\("消费者专业标识，如 .+?"\)/,
  'discipline: z.string().describe("消费者专业标识（学科码），如 PI / IN / WA")'
);
eventsContent = eventsContent.replace(
  /discipline: z\.string\(\)\.describe\("确认者专业标识"\)/,
  'discipline: z.string().describe("确认者专业标识（学科码）")'
);
eventsContent = eventsContent.replace(
  /discipline: z\.string\(\)\.optional\(\)\.describe\("按专业过滤，如 water \/ piping"\)/,
  'discipline: z.string().optional().describe("按学科码过滤，如 WA / PR / PI")'
);

writeFileSync(EVENTS_PATH, eventsContent, "utf8");
console.log("  vdi-events/server.mjs 已更新");

// vdi-rules/server.mjs
const RULES_SERVER_PATH = join(ROOT, "pilotdeck-vdi", "mcp", "vdi-rules", "server.mjs");
let rulesServerContent = readFileSync(RULES_SERVER_PATH, "utf8");

rulesServerContent = rulesServerContent.replace(
  /discipline: z\.string\(\)\.describe\("专业标识，如 water \/ process \/ piping"\)/,
  'discipline: z.string().describe("专业标识（学科码），如 WA / PR / PI")'
);
rulesServerContent = rulesServerContent.replace(
  /discipline: z\.string\(\)\.describe\("专业标识"\),/,
  'discipline: z.string().describe("专业标识（学科码），如 WA / PR"),'
);
rulesServerContent = rulesServerContent.replace(
  /sub_discipline: z\.string\(\)\.optional\(\)\.describe\("子领域标识（如 supply \/ fire \/ circulating）"\)/,
  'sub_discipline: z.string().optional().describe("子领域码（如 S=给水 / F=消防 / C=循环水）")'
);
rulesServerContent = rulesServerContent.replace(
  /sub_discipline: z\.string\(\)\.describe\("子领域标识，如 supply \/ fire \/ drainage"\)/,
  'sub_discipline: z.string().describe("子领域码（如 S / F / D）")'
);

writeFileSync(RULES_SERVER_PATH, rulesServerContent, "utf8");
console.log("  vdi-rules/server.mjs 已更新");

// vdi-knowledge/server-v2.mjs
const KNOWLEDGE_PATH = join(ROOT, "pilotdeck-vdi", "mcp", "vdi-knowledge", "server-v2.mjs");
let knowledgeContent = readFileSync(KNOWLEDGE_PATH, "utf8");

knowledgeContent = knowledgeContent.replace(
  /discipline: z\.string\(\)\.optional\(\)\.describe\("专业过滤：water\/process\/piping\/instrument\/electrical\/equipment\/fire\/hse"\)/,
  'discipline: z.string().optional().describe("学科码过滤：WA=给排水 / PR=工艺 / PI=管道 / IN=仪控 / EL=电气 / EQ=设备 / FI=消防 / HS=HSE")'
);

writeFileSync(KNOWLEDGE_PATH, knowledgeContent, "utf8");
console.log("  vdi-knowledge/server-v2.mjs 已更新");

console.log(`\n========== 完成：共 ${totalChanges} 处更改 ==========`);
