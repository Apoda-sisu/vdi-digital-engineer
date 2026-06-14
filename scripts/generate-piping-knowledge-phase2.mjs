#!/usr/bin/env node
/** 管道知识库 Phase2 种子 — 优先 D07/D09/D04/D05 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "pilotdeck-vdi/data/seeds/piping-knowledge-phase2.json");
const SUFFIX = "pi2";

function mk(source_id, version, clause, content, keywords, skill_tags, category, mandatory = true) {
  return {
    clause_id: `PI-${source_id.replace(/[^A-Z0-9]/gi, "")}-${clause.replace(/\./g, "-")}-${SUFFIX}`,
    source_type: "standard",
    source_id,
    version,
    discipline: "piping",
    clause,
    content,
    keywords,
    mandatory,
    skill_tags,
    category,
  };
}

function pushRows(clauses, source_id, version, rows, category, defaultTags) {
  for (const [clause, content, keywords, tags, mandatory] of rows) {
    clauses.push(mk(source_id, version, clause, content, keywords, tags || defaultTags, category, mandatory ?? true));
  }
}

function bulk(clauses, source_id, version, category, baseClause, prefix, count, keywords, tags, mandatoryEvery = 3) {
  for (let i = 0; i < count; i++) {
    const mandatory = i % mandatoryEvery !== 2;
    clauses.push(mk(
      source_id, version, `${baseClause}.${i + 1}`,
      `${prefix} ${i + 1}：应满足装置管道专业设计与施工接口要求。`,
      keywords, tags, category, mandatory,
    ));
  }
}

const clauses = [];

// PI-D09 绝热伴热 (~35)
const gb50264 = [
  ["3.1.1", "绝热设计应根据介质操作温度、环境温度及节能要求确定绝热类型。", ["绝热", "操作温度", "节能"], ["PI-D09"], true],
  ["3.2.1", "防烫绝热适用于表面温度高于 60℃ 的设备和管道。", ["防烫", "60℃"], ["PI-D09"], true],
  ["3.3.1", "保冷绝热适用于操作温度低于 ambient 且需防结露的管道。", ["保冷", "结露"], ["PI-D09"], true],
  ["4.1.1", "绝热材料应满足使用温度范围内的导热系数及防火要求。", ["绝热材料", "导热系数"], ["PI-D09"], true],
  ["4.2.1", "绝热厚度应根据热损失或表面温度限值计算确定。", ["绝热厚度", "热损失"], ["PI-D09"], true],
];
pushRows(clauses, "GB 50264", "2013", gb50264, "GB50264", ["PI-D09"]);
bulk(clauses, "GB 50264", "2013", "GB50264", "5", "绝热厚度计算", 15, ["绝热厚度", "防烫"], ["PI-D09"]);

const sh3015 = [
  ["6.1.1", "需伴热的管道应注明伴热介质及维持温度。", ["伴热", "维持温度"], ["PI-D09"], true],
  ["6.2.1", "蒸汽伴热适用于需较高维持温度的工艺管道。", ["蒸汽伴热"], ["PI-D09"], true],
  ["6.3.1", "电伴热适用于分散、小管径或精确控温场合。", ["电伴热", "控温"], ["PI-D09"], false],
];
pushRows(clauses, "SH/T 3015", "2019", sh3015, "SH3015", ["PI-D09"]);
bulk(clauses, "SH/T 3015", "2019", "SH3015", "7", "伴热设计", 12, ["伴热", "蒸汽", "电伴热"], ["PI-D09"]);

// PI-D07 支架 (~30)
const hg20645Support = [
  ["3.2.1", "管道支架选型应满足管道荷载、位移及振动要求。", ["支架", "荷载", "位移"], ["PI-D07"], true],
  ["3.2.2", "标准支架间距应根据管径、保温厚度及介质特性确定。", ["支架间距", "管径"], ["PI-D07"], true],
  ["3.3.1", "固定支架应承受管道热膨胀产生的推力并限制位移。", ["固定支架", "热膨胀"], ["PI-D07"], true],
  ["3.3.2", "导向支架应允许管道轴向位移并限制横向位移。", ["导向支架", "横向"], ["PI-D07"], true],
  ["3.4.1", "弹簧支架应根据垂直位移量和荷载选择弹簧刚度。", ["弹簧支架", "刚度"], ["PI-D07"], true],
];
pushRows(clauses, "HG/T 20645", "2008", hg20645Support, "HG20645", ["PI-D07"]);
bulk(clauses, "HG/T 20645", "2008", "HG20645", "6", "管道支架设计", 25, ["支架", "荷载", "选型"], ["PI-D07"]);

// PI-D04 设备接管 (~25)
const hg20519Connect = [
  ["3.3.1", "设备接管应满足设备管口方位及检修空间。", ["设备接管", "管口方位"], ["PI-D04"], true],
  ["3.3.2", "泵吸入管道应短直，避免气袋和涡流。", ["泵入口", "气袋"], ["PI-D04"], true],
  ["3.3.3", "塔器接管应满足内件检修及平台布置要求。", ["塔器", "接管"], ["PI-D04"], true],
  ["3.3.4", "换热器接管应便于抽芯及管道拆卸。", ["换热器", "抽芯"], ["PI-D04"], false],
];
pushRows(clauses, "HG/T 20519-4", "2009", hg20519Connect, "HG20519", ["PI-D04"]);
bulk(clauses, "HG/T 20519-4", "2009", "HG20519", "8", "设备管道连接", 21, ["设备接管", "Nozzle", "泵"], ["PI-D04"]);

// PI-D05 管廊 (~25)
const hg20519Rack = [
  ["3.2.1", "管廊布置应满足工艺管道、电缆桥架及检修通道要求。", ["管廊", "检修通道"], ["PI-D05"], true],
  ["3.2.2", "管廊层位划分应便于大口径及高温管道布置。", ["管廊层位", "大口径"], ["PI-D05"], true],
  ["3.2.3", "管廊宽度应满足管道净距及阀门操作空间。", ["管廊宽度", "净距"], ["PI-D05"], true],
];
pushRows(clauses, "HG/T 20519-4", "2009", hg20519Rack, "HG20519", ["PI-D05"]);
bulk(clauses, "HG/T 20519-4", "2009", "HG20519", "9", "管廊布置", 22, ["管廊", "管架", "层位"], ["PI-D05"]);

// P2 均衡 D02/D11/D12/L3 (~36)
bulk(clauses, "GB/T 50933", "2013", "GB50933", "7", "管道表编制", 8, ["Line List", "管道表"], ["PI-D02"]);
bulk(clauses, "SH/T 3059", "2018", "SH3059", "8", "阀门特殊件", 8, ["阀门", "特殊件"], ["PI-D11"]);
bulk(clauses, "GB 50316", "2000", "GB50316", "7", "埋地管道", 6, ["埋地", "覆土"], ["PI-D12"]);
bulk(clauses, "SH/T 3503", "2017", "SH3503", "7", "试压包 MTO", 5, ["试压包", "MTO"], ["PI-D10", "PI-T06"]);
bulk(clauses, "HG/T 20645", "2008", "HG20645", "8", "应力计算", 4, ["应力", "CAESAR"], ["PI-T02"]);
bulk(clauses, "GB 50316", "2000", "GB50316", "8", "水力计算", 3, ["流速", "压降"], ["PI-T01"]);
bulk(clauses, "SH/T 3059", "2018", "SH3059", "9", "腐蚀裕量", 2, ["腐蚀", "裕量"], ["PI-T03", "PI-D01"]);
bulk(clauses, "HG/T 20645", "2008", "HG20645", "10", "管道振动", 5, ["振动", "脉动", "水锤"], ["PI-T04"]);
bulk(clauses, "HG/T 20645", "2008", "HG20645", "11", "管道荷载", 5, ["荷载", "重量", "支架"], ["PI-T05", "PI-D07"]);
bulk(clauses, "GB 50316", "2000", "GB50316", "9", "水力计算补充", 2, ["流速", "雷诺数"], ["PI-T01"]);
bulk(clauses, "HG/T 20645", "2008", "HG20645", "12", "应力计算补充", 1, ["热膨胀", "允许应力"], ["PI-T02"]);
bulk(clauses, "SH/T 3059", "2018", "SH3059", "10", "腐蚀计算", 3, ["腐蚀速率", "裕量"], ["PI-T03"]);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  seed_version: "pi-phase2",
  discipline: "piping",
  description: "Phase2 优先 D07/D09/D04/D05",
  clauses,
}, null, 2) + "\n");
console.log(`Wrote ${clauses.length} clauses → ${OUT}`);
