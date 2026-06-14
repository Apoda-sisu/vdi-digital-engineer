#!/usr/bin/env node
/** IN-D01 Deep1b — HG/T 20507 选型条款种子（+12） */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "pilotdeck-vdi/data/seeds/instrument-knowledge-phase1b-hg20507.json");
const SUFFIX = "in1b";

function mk(clause, content, keywords, skill_tags) {
  return {
    clause_id: `IN-HG20507-${clause.replace(/\./g, "-")}-${SUFFIX}`,
    source_type: "standard",
    source_id: "HG/T 20507",
    version: "2014",
    discipline: "instrument",
    clause,
    content,
    keywords,
    mandatory: true,
    skill_tags,
    category: "selection",
  };
}

const clauses = [
  mk("4.2.1", "变送器量程应使正常操作值位于满量程的50%～70%范围内，并兼顾最大、最小工况。", ["变送器", "量程", "50%", "70%"], ["IN-D01", "IN-T02"]),
  mk("4.2.2", "压力变送器选型应考虑介质腐蚀性、温度及取压点位置，接液材质应与工艺相容。", ["压力变送器", "接液材质", "腐蚀性"], ["IN-D01"]),
  mk("4.3.1", "差压式流量计适用于清洁液体、气体和蒸汽；粘稠、腐蚀或含固体介质应选用其他型式。", ["差压流量计", "选型", "蒸汽"], ["IN-D01"]),
  mk("4.3.2", "涡街流量计适用于洁净气体、蒸汽及低粘度液体，不适用于高粘度或脉动大的工况。", ["涡街", "流量计", "蒸汽"], ["IN-D01"]),
  mk("4.3.3", "电磁流量计适用于导电液体，不适用于气体、蒸汽及非导电介质。", ["电磁流量计", "导电", "液体"], ["IN-D01"]),
  mk("4.4.1", "液位测量应根据容器型式、介质特性选择差压、雷达、磁翻板或浮力式仪表。", ["液位", "雷达", "差压"], ["IN-D01"]),
  mk("4.4.2", "储罐液位宜优先选用非接触式雷达液位计；塔釜液位可采用差压液位计。", ["雷达液位", "储罐", "塔釜"], ["IN-D01"]),
  mk("4.5.1", "温度测量元件应根据温度范围、精度及响应时间选择 RTD 或热电偶，高温区宜设套管。", ["温度", "RTD", "热电偶", "套管"], ["IN-D01"]),
  mk("4.6.1", "爆炸危险场所仪表防爆型式应与区域分级一致：Zone 0/1 宜本安或隔爆，并满足温度组别。", ["防爆", "本安", "隔爆", "Zone"], ["IN-D01"]),
  mk("4.6.2", "本安回路仪表及电缆参数应进行匹配校核，避免超过关联设备允许值。", ["本安", "电缆", "参数匹配"], ["IN-D01", "IN-D05"]),
  mk("4.7.1", "压力取压接口型式、尺寸及材质应符合 HG/T 20507 及工艺管道等级要求。", ["取压", "引压", "接口"], ["IN-D01"]),
  mk("4.8.1", "开关类仪表设定值应依据工艺操作范围及联锁要求确定，安全开关应满足 SIL 要求。", ["开关", "设定值", "SIL"], ["IN-D01", "IN-D03"]),
  mk("4.9.1", "远传仪表供电及信号制式（4-20mA、HART、FF 等）应与 DCS I/O 类型一致。", ["供电", "HART", "4-20mA", "DCS"], ["IN-D01", "IN-D04"]),
  mk("4.10.1", "脉动或振动工况下压力/流量测量应设阻尼或缓冲元件，防止示值波动。", ["脉动", "阻尼", "振动"], ["IN-D01"]),
];

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  seed_version: "in-phase1b-hg20507",
  discipline: "instrument",
  description: "IN-D01 Deep1b HG/T 20507 选型条款",
  clauses,
}, null, 2) + "\n");
console.log(`Wrote ${clauses.length} clauses → ${OUT}`);
