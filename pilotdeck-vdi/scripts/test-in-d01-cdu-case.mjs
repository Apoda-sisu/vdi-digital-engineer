#!/usr/bin/env node
/**
 * IN-D01 常减压塔区工程案例自动验收
 * 用法: node pilotdeck-vdi/scripts/test-in-d01-cdu-case.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateInstrumentIndexPayload,
  calcTransmitterRange,
  checkCp0Completeness,
  checkSelectionRationale,
} from "./lib/instrument-index-validator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const MUST_DATA = path.join(REPO, "workspaces/仪控组/pilot/plant-base/design-basis/must-data.json");
const GOLDEN = path.join(REPO, "workspaces/仪控组/pilot/plant-base/cases/cdu-tower/golden-instrument_index.json");
const RULES = path.join(__dirname, "../mcp/vdi-rules/vdi-rules.json");

let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
  const icon = ok ? "✅" : "❌";
  console.log(`  ${icon} ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) passed++;
  else failed++;
}

console.log("═".repeat(60));
console.log("  IN-D01 工程案例验收 — CDU-TOWER (C-101)");
console.log("═".repeat(60));

const mustData = JSON.parse(fs.readFileSync(MUST_DATA, "utf8"));
const golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
const rules = JSON.parse(fs.readFileSync(RULES, "utf8"));
const payload = golden.payload;

// 1. CP-0 数据完整性
const cp0 = checkCp0Completeness(mustData);
check("CP-0 MUST 数据齐全", cp0.ok, cp0.missing.join(", ") || "OK");
check("pid_instrument_seed ≥ 9 位号", (mustData.pid_instrument_seed || []).length >= 9, `${mustData.pid_instrument_seed?.length} 条`);
check("fce_seed 登记", (mustData.fce_seed || []).length >= 3, `${mustData.fce_seed?.length} 个 FCE`);

// 2. vdi-rules 子契约
const inSub = rules.output_contracts?.IN?.sub_discipline_contracts?.I;
check("vdi-rules IN.I 子契约", !!inSub && inSub.output_type === "instrument_index");
const missingContract = (inSub?.required_payload_fields || []).filter((f) => !(f in payload));
check("子契约 required_payload_fields", missingContract.length === 0, missingContract.join(", ") || "OK");

// 3. Golden payload 结构校验
const validation = validateInstrumentIndexPayload(payload);
check("golden payload 结构校验", validation.valid, validation.issues.filter((i) => i.severity === "error").map((i) => i.field).join(", ") || "OK");
if (!validation.valid) {
  for (const issue of validation.issues.filter((i) => i.severity === "error").slice(0, 5)) {
    console.log(`       ↳ ${issue.field}: ${issue.error}`);
  }
}

// 4. 种子位号 ⊆ 索引表
const seedTags = new Set((mustData.pid_instrument_seed || []).map((s) => s.tag));
const indexTags = new Set((payload.index_table || []).map((r) => r.tag));
const missingSeed = [...seedTags].filter((t) => !indexTags.has(t));
check("种子位号全部进入索引表", missingSeed.length === 0, missingSeed.join(", ") || "OK");

// 5. 选型型式（工程关键决策）
const selection = checkSelectionRationale(payload.instruments, [
  { tag: "FT-1003", meter_type: "涡街流量计" },
  { tag: "FT-1007", meter_type: "差压+孔板" },
  { tag: "LT-1004", meter_type: "差压液位计" },
]);
check("流量计/液位型式选型", selection.ok, selection.issues.map((i) => `${i.tag}:${i.error}`).join("; ") || "OK");

// 6. IN-SEL-001 量程演算（PT-1001）
const ptSeed = mustData.pid_instrument_seed.find((s) => s.tag === "PT-1001");
const ptInst = payload.instruments.find((i) => i.tag === "PT-1001");
if (ptSeed && ptInst) {
  const calcRange = calcTransmitterRange(ptSeed.max_pressure_MPaG, ptSeed.min_pressure_MPaG, 1.2);
  check("PT-1001 IN-SEL-001 量程演算", Math.abs(calcRange - 0.336) < 0.01, `计算 ${calcRange.toFixed(3)} MPaG`);
  check("PT-1001 range_basis 引用", ptInst.range_basis === "IN-SEL-001");
  check("PT-1001 数据表含防爆", /Zone 1|Ex ia/i.test(ptInst.hazardous_area || ""));
}

// 7. SIS 开关
const lsh = payload.index_table.find((r) => r.tag === "LSH-1008");
check("LSH-1008 SIS io_type", lsh?.io_type === "SDI");
check("LSH-1008 SIL2 标注", lsh?.sil_required === "SIL2");

// 8. FCE 不写 Cv
const fceJson = JSON.stringify(payload.fce_tags);
check("fce_tags 无 Cv", !/Cv|cv_required/i.test(fceJson));

// 9. IO 统计
check("BPCS AI=7", payload.io_summary?.bpcs?.AI === 7);
check("SIS DI=2", payload.io_summary?.sis?.DI === 2);

// 10. 案例文件存在
check("case-brief.md", fs.existsSync(path.join(REPO, "workspaces/仪控组/pilot/plant-base/cases/cdu-tower/case-brief.md")));
check("selection-rationale.md", fs.existsSync(path.join(REPO, "workspaces/仪控组/pilot/plant-base/cases/cdu-tower/selection-rationale.md")));

console.log("\n" + "─".repeat(60));
console.log(`  通过: ${passed}/${passed + failed}  失败: ${failed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
