/**
 * CFIHOS 专业代码解析 — 唯一真相源（v1.4.0：给排水 canonical = CI）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODES_PATH = path.join(__dirname, "discipline-codes.json");

let _cache = null;

export const VDI_RUNTIME_EXCEPTIONS = [];

export function loadDisciplineCodes() {
  if (_cache) return _cache;
  _cache = JSON.parse(fs.readFileSync(CODES_PATH, "utf8"));
  return _cache;
}

export function buildVdiToCfihos(codes = loadDisciplineCodes()) {
  const map = { system: "JA", WA: "CI" };
  for (const [vdi, entry] of Object.entries(codes.vdi_to_cfihos || {})) {
    if (vdi.startsWith("_")) continue;
    if (entry?.cfihos) map[vdi] = entry.cfihos;
  }
  return map;
}

export function buildCfihosToVdi(codes = loadDisciplineCodes()) {
  const map = {};
  const raw = codes.cfihos_to_vdi || {};
  for (const [cfihos, vdi] of Object.entries(raw)) {
    if (cfihos.startsWith("_")) continue;
    if (vdi == null) continue;
    if (Array.isArray(vdi)) {
      for (const v of vdi) map[cfihos] = v;
    } else {
      map[cfihos] = vdi;
    }
  }
  map.JA = "SY";
  map.AA = "MG";
  return map;
}

const SLUG_TO_CFIHOS = {
  process: "PX",
  piping: "MP",
  water: "CI",
  instrument: "IN",
  electrical: "EA",
  equipment: "MX",
  hse: "HS",
  hs: "HS",
  fire: "HX",
  structural: "CS",
  architectural: "CB",
  material: "RA",
  hvac: "MH",
  management: "AA",
  quality: "QA",
  procurement: "VA",
  hazop: "HX",
  system: "JA",
};

/** 归一化为 canonical CFIHOS discipline code */
export function resolveCanonicalDiscipline(input) {
  if (!input || typeof input !== "string") return input;
  const raw = input.trim();
  const upper = raw.toUpperCase();
  const vdiToCfihos = buildVdiToCfihos();

  if (upper === "WA" || raw === "water") return "CI";
  if (SLUG_TO_CFIHOS[raw.toLowerCase()]) return SLUG_TO_CFIHOS[raw.toLowerCase()];
  if (vdiToCfihos[upper]) return vdiToCfihos[upper];
  if (/^[A-Z]{2}$/.test(upper)) return upper;
  const codes = loadDisciplineCodes();
  if (codes.mappings?.[upper]?.cfihos_discipline_code) {
    return codes.mappings[upper].cfihos_discipline_code;
  }
  return upper;
}

export function resolveDiscipline(input) {
  return resolveCanonicalDiscipline(input);
}

export function isVdiRuntimeException() {
  return false;
}

export function migrateDisciplineToken(token) {
  if (!token || typeof token !== "string") return token;
  if (token === "*") return token;
  return resolveCanonicalDiscipline(token);
}

export function migrateDisciplineList(list) {
  if (!Array.isArray(list)) return list;
  return [...new Set(list.map(migrateDisciplineToken))];
}

export function migrateDeliverablePrefix(value, vdiToCfihos = buildVdiToCfihos()) {
  if (!value || typeof value !== "string") return value;
  const m = value.match(/^([A-Z]{2,5})-([A-Z0-9-]+)$/);
  if (!m) return value;
  const cfihos = vdiToCfihos[m[1]] || m[1];
  return `${cfihos}-${m[2]}`;
}

export function getDisciplineSlugMapping(codes = loadDisciplineCodes()) {
  return { ...SLUG_TO_CFIHOS, ...(codes.discipline_slug_mapping || {}) };
}

/** 知识库 / 公式过滤：slug、legacy、CFIHOS → canonical CFIHOS */
export function resolveKnowledgeDiscipline(input) {
  return resolveCanonicalDiscipline(input);
}
