/**
 * IN-D01 instrument_index payload 结构校验（无外部 JSON Schema 依赖）
 */
const TAG_PATTERN = /^[A-Z]{1,4}-[0-9]{3,5}$/;
const FCE_PATTERN = /^[A-Z]{1,3}V-[0-9]{3,5}$/;

const REQUIRED_PAYLOAD = ["pid_revision", "index_table", "instruments", "fce_tags", "io_summary"];
const REQUIRED_INDEX_ROW = ["tag", "service", "instrument_type", "io_type", "hazardous_area", "datasheet_status"];
const REQUIRED_INSTRUMENT = ["tag", "service", "datasheet_type", "fluid", "hazardous_area", "output_signal"];

export function validateInstrumentIndexPayload(payload) {
  const issues = [];
  if (!payload || typeof payload !== "object") {
    return { valid: false, issues: [{ field: "payload", error: "payload 缺失或非对象", severity: "error" }] };
  }

  for (const f of REQUIRED_PAYLOAD) {
    if (payload[f] === undefined) {
      issues.push({ field: `payload.${f}`, error: `缺少必填字段 '${f}'`, severity: "error" });
    }
  }

  if (!Array.isArray(payload.index_table) || payload.index_table.length === 0) {
    issues.push({ field: "payload.index_table", error: "index_table 须为非空数组", severity: "error" });
  }

  const indexTags = new Set();
  for (const [i, row] of (payload.index_table || []).entries()) {
    for (const f of REQUIRED_INDEX_ROW) {
      if (row[f] === undefined || row[f] === "") {
        issues.push({ field: `index_table[${i}].${f}`, error: "索引行缺必填列", severity: "error" });
      }
    }
    if (row.tag && !TAG_PATTERN.test(row.tag)) {
      issues.push({ field: `index_table[${i}].tag`, error: `位号格式不符: ${row.tag}`, severity: "warning" });
    }
    if (row.tag) indexTags.add(row.tag);
  }

  const instrumentTags = new Set();
  for (const [i, inst] of (payload.instruments || []).entries()) {
    for (const f of REQUIRED_INSTRUMENT) {
      if (inst[f] === undefined || inst[f] === "") {
        issues.push({ field: `instruments[${i}].${f}`, error: "数据表缺必填字段", severity: "error" });
      }
    }
    if (inst.tag) instrumentTags.add(inst.tag);
    const body = JSON.stringify(inst);
    if (/cv_required|"Cv"|Cv=/i.test(body)) {
      issues.push({ field: `instruments[${i}]`, error: "D01 禁止出现 Cv", severity: "error" });
    }
  }

  for (const tag of indexTags) {
    if (!instrumentTags.has(tag)) {
      issues.push({ field: "instruments", error: `索引位号 ${tag} 无对应数据表`, severity: "error" });
    }
  }

  for (const [i, fce] of (payload.fce_tags || []).entries()) {
    if (fce.spec_owner !== "IN-D06") {
      issues.push({ field: `fce_tags[${i}].spec_owner`, error: "须为 IN-D06", severity: "error" });
    }
    if (fce.tag && !FCE_PATTERN.test(fce.tag)) {
      issues.push({ field: `fce_tags[${i}].tag`, error: `FCE 位号格式: ${fce.tag}`, severity: "warning" });
    }
    if (fce.cv_required !== undefined || fce.Cv !== undefined) {
      issues.push({ field: `fce_tags[${i}]`, error: "FCE 登记禁止 Cv", severity: "error" });
    }
  }

  const ioCounts = countIoTypes(payload.index_table || []);
  const summary = payload.io_summary || {};
  for (const [system, expected] of Object.entries(ioCounts)) {
    const actual = summary[system] || {};
    for (const [k, v] of Object.entries(expected)) {
      if ((actual[k] ?? 0) !== v) {
        issues.push({
          field: `io_summary.${system}.${k}`,
          error: `IO 计数不一致：索引 ${v} vs summary ${actual[k] ?? 0}`,
          severity: "error",
        });
      }
    }
  }

  return { valid: issues.filter((x) => x.severity === "error").length === 0, issues };
}

function countIoTypes(indexTable) {
  const bpcs = { AI: 0, AO: 0, DI: 0, DO: 0 };
  const sis = { AI: 0, AO: 0, DI: 0, DO: 0 };
  for (const row of indexTable) {
    const t = row.io_type;
    if (!t) continue;
    if (t.startsWith("S")) {
      const base = t.slice(1);
      if (base in sis) sis[base]++;
    } else if (t in bpcs) {
      bpcs[t]++;
    }
  }
  return { bpcs, sis };
}

/** IN-SEL-001 变送器量程 */
export function calcTransmitterRange(max, min, safetyFactor = 1.2) {
  return (max - min) * safetyFactor;
}

export function checkCp0Completeness(mustData) {
  const inst = mustData.instrument || {};
  const required = ["pid_revision", "control_philosophy_ref", "hazardous_area_classification"];
  const missing = required.filter((k) => !inst[k]);
  return { ok: missing.length === 0, missing };
}

export function checkSelectionRationale(instruments, expectations) {
  const issues = [];
  for (const { tag, meter_type, source_id } of expectations) {
    const inst = instruments.find((i) => i.tag === tag);
    if (!inst) {
      issues.push({ tag, error: "instruments 中未找到位号" });
      continue;
    }
    if (meter_type && inst.meter_type !== meter_type) {
      issues.push({ tag, error: `meter_type 期望 '${meter_type}'，实际 '${inst.meter_type || "—"}'` });
    }
    if (source_id && !JSON.stringify(inst).includes(source_id)) {
      // soft check only at instrument level; citations are output-level
    }
  }
  return { ok: issues.length === 0, issues };
}
