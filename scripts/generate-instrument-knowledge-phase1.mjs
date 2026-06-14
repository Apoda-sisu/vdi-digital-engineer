#!/usr/bin/env node
/** 仪控知识库 Phase1 种子 — 补齐至 40 条 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "pilotdeck-vdi/data/seeds/instrument-knowledge-phase1.json");
const SUFFIX = "in1";

function mk(source_id, version, clause, content, keywords, skill_tags, category) {
  return {
    clause_id: `IN-${source_id.replace(/[^A-Z0-9]/gi, "")}-${clause.replace(/\./g, "-")}-${SUFFIX}`,
    source_type: "standard",
    source_id,
    version,
    discipline: "instrument",
    clause,
    content,
    keywords,
    mandatory: true,
    skill_tags,
    category,
  };
}

const clauses = [
  mk("HG/T 20509", "2014", "6.1.1", "仪表信号电缆应采用铜芯绝缘电缆，本安回路电缆应满足本安参数匹配要求。", ["仪表电缆", "本安", "信号电缆"], ["IN-D05"], "cable"),
  mk("HG/T 20509", "2014", "6.2.1", "仪表电缆应分本安与非本安、屏蔽与非屏蔽回路分开敷设，避免混敷。", ["电缆敷设", "本安", "屏蔽"], ["IN-D05"], "cable"),
  mk("HG/T 20509", "2014", "6.3.1", "接线箱应设置在便于维护、接近仪表集中区域，并满足防爆分区要求。", ["接线箱", "JB", "防爆"], ["IN-D05"], "installation"),
  mk("HG/T 20509", "2014", "7.1.1", "仪表气源管应选用不锈钢或镀锌钢管，管径应满足执行机构耗气量要求。", ["气源管", "执行机构"], ["IN-D05"], "installation"),
  mk("HG/T 20636", "2013", "4.1.1", "仪表安装支架应满足仪表重量及振动要求，取源部件应便于检修。", ["仪表安装", "支架", "取源"], ["IN-D05"], "installation"),
  mk("GB/T 50770", "2013", "8.1.1", "在线分析仪表取样点应设置在具有代表性的工艺位置，并便于维护。", ["在线分析", "取样点"], ["IN-D07"], "analytical"),
  mk("GB/T 50770", "2013", "8.2.1", "对在线分析仪表应明确样品条件（温度、压力、过滤）及排放去向。", ["样品条件", "在线分析", "排放"], ["IN-D07"], "analytical"),
  mk("SH/T 3005", "2016", "5.3.1", "在线分析仪数据表应注明测量组分、量程、精度及校准方法。", ["分析仪", "数据表", "在线分析"], ["IN-D07", "IN-D01"], "analytical"),
  mk("GB/T 50770", "2013", "9.1.1", "DCS 与上位系统通信宜采用 OPC UA 等标准协议，接口应独立划分安全域。", ["OPC UA", "上位", "通信"], ["IN-D08"], "network"),
  mk("GB/T 50770", "2013", "9.2.1", "无线仪表网络应评估覆盖、干扰及供电方式，网关数量应满足冗余要求。", ["无线仪表", "网关", "网络"], ["IN-D08"], "network"),
  mk("HG/T 20507", "2014", "8.1.1", "仪表电缆长度估算应考虑水平垂直距离及布线系数，留有安装裕量。", ["电缆长度", "布线系数", "MTO"], ["IN-D05", "IN-T04"], "cable"),
  mk("HG/T 20509", "2014", "6.4.1", "本质安全回路电缆屏蔽层应在安全区一侧单点接地。", ["本安", "屏蔽", "接地"], ["IN-D05"], "cable"),
  mk("GB/T 50770", "2013", "9.3.1", "历史站与操作站网络应与控制网分区，OPC 服务器宜置于 DMZ。", ["历史站", "DMZ", "OPC"], ["IN-D08", "IN-D04"], "network"),
  mk("SH/T 3005", "2016", "6.2.1", "分析小屋应满足环境温度、通风及防爆要求，并配置样品排放收集。", ["分析小屋", "shelter", "防爆"], ["IN-D07"], "analytical"),
];

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  seed_version: "in-phase1",
  discipline: "instrument",
  description: "仪控 Phase1 补齐种子（D05/D07/D08）",
  clauses,
}, null, 2) + "\n");
console.log(`Wrote ${clauses.length} clauses → ${OUT}`);
