#!/usr/bin/env node
/** Sprint 11 — 管道知识库 Phase1 种子 ~120 条 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "pilotdeck-vdi/data/seeds/piping-knowledge-phase1.json");
const SUFFIX = "pi1";

function mk(source_id, version, clause, content, keywords, skill_tags, category) {
  return {
    clause_id: `PI-${source_id.replace(/[^A-Z0-9]/gi, "")}-${clause.replace(/\./g, "-")}-${SUFFIX}`,
    source_type: "standard",
    source_id,
    version,
    discipline: "piping",
    clause,
    content,
    keywords,
    mandatory: true,
    skill_tags,
    category,
  };
}

function pushRows(clauses, source_id, version, rows, category, defaultTags) {
  for (const [clause, content, keywords, tags] of rows) {
    clauses.push(mk(source_id, version, clause, content, keywords, tags || defaultTags, category));
  }
}

const clauses = [];

const sh3059 = [
  ["4.1.1", "管道材料等级应根据设计温度、设计压力、介质特性及腐蚀条件确定。", ["材料等级", "设计温度", "设计压力"], ["PI-D01"]],
  ["4.1.2", "碳钢管道适用于设计温度不高于 425℃ 且介质无强腐蚀性的场合。", ["碳钢", "425", "腐蚀性"], ["PI-D01"]],
  ["4.2.1", "管道壁厚应满足设计压力、设计温度及腐蚀裕量要求。", ["壁厚", "腐蚀裕量"], ["PI-D01"]],
  ["4.3.1", "阀门型式应根据介质特性、操作频率及密封要求选用。", ["阀门型式", "密封"], ["PI-D11"]],
  ["4.3.2", "高温高压工况宜选用截止阀或闸阀，并满足 SH/T 3059 表要求。", ["截止阀", "闸阀", "高温"], ["PI-D11"]],
  ["4.4.1", "法兰型式应与管道等级匹配，高压管道宜选用对焊法兰。", ["法兰", "对焊"], ["PI-D01", "PI-D11"]],
  ["5.1.1", "管道等级表应列出等级号、适用介质、最高 T/P、材质及壁厚系列。", ["等级表", "最高温度"], ["PI-D01"]],
  ["5.2.1", "特殊件选用应注明标准号、压力等级及端面型式。", ["特殊件", "压力等级"], ["PI-D11"]],
  ["6.1.1", "埋地管道应选用耐腐蚀材料或加强外防腐。", ["埋地", "防腐"], ["PI-D12"]],
  ["6.2.1", "不锈钢管道用于腐蚀性介质时，应控制氯离子含量。", ["不锈钢", "氯离子"], ["PI-D01"]],
];
for (let i = 0; i < 15; i++) {
  sh3059.push([`7.${i + 1}.1`, `管道器材选用补充条款 ${i + 1}：材质应与工艺介质相容并满足设计寿命。`, ["器材选用", "设计寿命"], ["PI-D01", "PI-D11"]]);
}
pushRows(clauses, "SH/T 3059", "2018", sh3059, "SH3059");

const hg20519 = [
  ["3.1.1", "管道平面布置图应表示主要设备、管架及管道走向。", ["平面布置", "管架", "走向"], ["PI-D03"]],
  ["3.1.2", "管道立面图应标注管段标高及坡度。", ["立面", "标高", "坡度"], ["PI-D03"]],
  ["3.2.1", "管廊布置应满足工艺管道、电缆桥架及检修通道要求。", ["管廊", "检修通道"], ["PI-D05", "PI-D03"]],
  ["3.3.1", "设备接管应满足设备管口方位及检修空间。", ["设备接管", "管口方位"], ["PI-D04"]],
  ["4.1.1", "管道综合设计应协调各专业碰撞并编制设计说明。", ["综合设计", "碰撞"], ["PI-D06"]],
  ["4.2.1", "地下管道应标注埋深、覆土及与建构筑物净距。", ["地下", "埋深", "净距"], ["PI-D12"]],
];
for (let i = 0; i < 20; i++) {
  hg20519.push([`5.${i + 1}.1`, `管道布置深度规定 ${i + 1}：施工图应达到可采购、可施工深度。`, ["施工图", "布置"], ["PI-D03", "PI-D06"]]);
}
pushRows(clauses, "HG/T 20519-4", "2009", hg20519, "HG20519");

const hg20645 = [
  ["3.1.1", "管道应力分析应识别临界管系并编制临界管系表。", ["应力分析", "临界管系"], ["PI-D08"]],
  ["3.2.1", "管道支架选型应满足管道荷载、位移及振动要求。", ["支架", "荷载", "位移"], ["PI-D07"]],
  ["4.1.1", "配管专业应向管道机械专业提供管线轴测及支承条件。", ["配管", "轴测", "支承"], ["PI-D03", "PI-D08"]],
  ["4.2.1", "管道机械专业应向配管返回应力分析结论及支架修改建议。", ["应力结论", "支架修改"], ["PI-D08", "PI-D07"]],
];
for (let i = 0; i < 18; i++) {
  hg20645.push([`5.${i + 1}.1`, `管道机械设计规定 ${i + 1}：柔性分析应满足规范允许应力范围。`, ["柔性分析", "允许应力"], ["PI-D08"]]);
}
pushRows(clauses, "HG/T 20645", "2008", hg20645, "HG20645");

const gb50933 = [
  ["5.3.1", "详细设计文件应包含管道表及管道材料等级表。", ["管道表", "材料等级"], ["PI-D02", "PI-D01"]],
  ["5.3.2", "管道表应含管线号、起止点、介质、设计/操作 T·P、材质、绝热。", ["管线号", "Line List"], ["PI-D02"]],
  ["5.4.1", "装置布置及配管专篇应说明布置原则及管廊划分。", ["装置布置", "配管"], ["PI-D03"]],
];
for (let i = 0; i < 12; i++) {
  gb50933.push([`6.${i + 1}.1`, `设计文件编制 ${i + 1}：管道专业交付物清单应完整。`, ["交付物", "管道专业"], ["PI-D02"]]);
}
pushRows(clauses, "GB/T 50933", "2013", gb50933, "GB50933");

const sh3503 = [
  ["4.1.1", "工艺管道试压应按试压包进行，试压包应含轴测图索引。", ["试压包", "轴测图"], ["PI-D10", "PI-T06"]],
  ["4.2.1", "管道轴测图应标注焊口、支架及阀门位置。", ["轴测", "焊口", "支架"], ["PI-D10"]],
  ["5.1.1", "交工资料应含管道等级表、管道表及支架记录。", ["交工", "支架记录"], ["PI-D10", "PI-D07"]],
];
for (let i = 0; i < 10; i++) {
  sh3503.push([`6.${i + 1}.1`, `施工验收 ${i + 1}：ISO 图号与 Line List 应一一对应。`, ["ISO", "Line List"], ["PI-D10"]]);
}
pushRows(clauses, "SH/T 3503", "2017", sh3503, "SH3503");

const gb50316 = [
  ["4.1.1", "工业金属管道设计应满足强度、刚度和稳定性要求。", ["强度", "刚度"], ["PI-D01", "PI-D08"]],
  ["5.1.1", "管道布置应便于操作、检修并减少应力集中。", ["布置", "检修", "应力"], ["PI-D03"]],
];
for (let i = 0; i < 8; i++) {
  gb50316.push([`6.${i + 1}.1`, `金属管道设计 ${i + 1}：设计压力不应超过材料许用应力对应值。`, ["设计压力", "许用应力"], ["PI-D08"]]);
}
pushRows(clauses, "GB 50316", "2000", gb50316, "GB50316");

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  seed_version: "pi-phase1",
  discipline: "piping",
  description: "Sprint 11-14 管道 Phase1",
  clauses,
}, null, 2) + "\n");
console.log(`Wrote ${clauses.length} clauses → ${OUT}`);
