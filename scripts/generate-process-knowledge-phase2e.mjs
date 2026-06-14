#!/usr/bin/env node
/**
 * Sprint 5 Phase 2e — 补充条文至 Phase 2 中期目标（~350）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "pilotdeck-vdi/data/seeds/process-knowledge-phase2e.json");

function mk(source_id, version, clause, content, keywords, skill_tags, category) {
  return {
    clause_id: `${source_id.replace(/[^A-Z0-9]/gi, "")}-${clause.replace(/\./g, "-")}-e`,
    source_type: "standard",
    source_id,
    version,
    discipline: "process",
    clause,
    content,
    keywords,
    mandatory: true,
    skill_tags,
    category,
  };
}

const clauses = [];
const sht3121Extras = [
  ["4.5", "对催化反应装置，工艺设计应明确催化剂装填量、预期寿命及再生/更换周期。", ["催化剂", "寿命", "再生"], ["PR-D02", "PR-D05"]],
  ["4.6", "对分离序列设计，应评估热集成方案及对公用工程消耗的影响。", ["分离序列", "热集成"], ["PR-D02", "PR-D03"]],
  ["5.4", "流股表应给出各流股的质量流量、摩尔分率、温度、压力及相态。", ["流股表", "摩尔分率", "相态"], ["PR-D03"]],
  ["5.5", "对含腐蚀性介质，物料平衡应标注氯离子、硫化氢等关键杂质浓度。", ["腐蚀", "杂质", "H2S"], ["PR-D03", "PR-S01"]],
  ["7.6", "储罐设计应明确储存温度、呼吸损失、氮封要求及高低液位联锁。", ["储罐", "氮封", "液位联锁"], ["PR-D05", "PR-S05"]],
  ["7.7", "过滤器/筛网选型应满足 Startup 及正常操作固体颗粒控制要求。", ["过滤器", "Startup"], ["PR-D05"]],
  ["8.5", "对毒性介质 PSV 排放，应评估火炬燃烧效率及地面浓度影响。", ["毒性", "火炬燃烧"], ["PR-S03"]],
  ["8.6", "真空系统泄压应同时考虑正向超压及反向超压（ implosion ）保护。", ["真空", "超压", "implosion"], ["PR-S03"]],
  ["9.4", "串级控制方案应明确主副回路职责及防积分饱和措施。", ["串级", "积分饱和"], ["PR-S05"]],
  ["9.5", "分程控制及选择性控制应在控制哲学中单独说明应用场景。", ["分程", "选择性控制"], ["PR-S05"]],
  ["10.3", "工艺设计应对 VOCs 无组织排放源提出控制措施。", ["VOCs", "无组织排放"], ["PR-D02"]],
];
for (const [c, t, k, tags] of sht3121Extras) {
  clauses.push(mk("SH/T 3121-2022", "2022", c, t, k, tags, "SH/T3121-扩展"));
}

const pidExtras = [
  ["4.4", "P&ID 应标注管道编号、公称直径、管道等级、绝热要求及流向箭头。", ["管道编号", "管道等级", "绝热"], ["PR-S01"]],
  ["4.5", "P&ID 安全阀、爆破片、限流孔板应标注位号、整定压力及排放去向。", ["PSV标注", "排放去向"], ["PR-S01", "PR-S03"]],
  ["4.6", "P&ID 取样点、排凝点、放空点应使用标准符号并编号。", ["取样点", "排凝", "放空"], ["PR-S01", "PR-X02"]],
  ["4.7", "P&ID 版次记录应包含 HAZOP 审查版、配管会签版及 IFC 终版日期。", ["版次", "HAZOP", "IFC"], ["PR-S01"]],
  ["5.3", "管道表与 P&ID 管道编号应完全一致，作为配管 ISO 图唯一索引。", ["管道表", "ISO图"], ["PR-S01"]],
];
for (const [c, t, k, tags] of pidExtras) {
  clauses.push(mk("HG/T 20570-2015", "2015", c, t, k, tags, "HG20570-PID"));
}

const utilExtras = [
  ["6.2", "蒸汽平衡应区分不同压力等级，并标注各等级产汽/用汽装置。", ["蒸汽平衡", "压力等级"], ["PR-S04"]],
  ["6.3", "循环水系统应给出设计供回水温度、流量及用户清单。", ["循环水", "供回水"], ["PR-S04"]],
  ["6.4", "氮气/仪表风系统应区分连续消耗与间歇吹扫用量。", ["氮气", "仪表风"], ["PR-S04"]],
];
for (const [c, t, k, tags] of utilExtras) {
  clauses.push(mk("HG/T 20570-2015", "2015", c, t, k, tags, "HG20570-公用工程"));
}

const api520Extras = [
  ["7.1", "临界流动判定应基于下游压力与上游压力比值，选用正确泄放系数。", ["临界流动", "泄放系数"], ["PR-T07", "PR-S03"]],
  ["7.2", "蒸汽泄放应区分过热蒸汽与饱和蒸汽，采用对应 API 520 公式。", ["蒸汽泄放", "过热蒸汽"], ["PR-T07"]],
  ["8.1", "多组分混合物泄放应明确混合物性质计算方法（理想混合或实验数据）。", ["混合物", "泄放"], ["PR-S03"]],
];
for (const [c, t, k, tags] of api520Extras) {
  clauses.push(mk("API RP 520", "2020", c, t, k, tags, "API520-扩展"));
}

// 批量 VDI 规则（设备/界面/阶段）
const vdiBatch = [
  ["VDI-PR-EQP-001", "设备数据表应包含设计/正常/最大/最小流量及温度压力工况。", ["设备数据表", "工况"], ["PR-D05"]],
  ["VDI-PR-EQP-002", "长周期设备（压缩机、大型塔器）应标注工艺包阶段需冻结的参数。", ["长周期设备", "冻结参数"], ["PR-D01", "PR-D05"]],
  ["VDI-PR-INT-001", "与管道专业接口：工艺系统提供管道等级初稿及特殊管道清单。", ["管道等级", "专业接口"], ["PR-S01"]],
  ["VDI-PR-INT-002", "与仪控专业接口：工艺提供 C&E 及联锁矩阵，仪控提供 SIS 详细设计。", ["仪控接口", "SIS"], ["PR-S05"]],
  ["VDI-PR-INT-003", "与总图专业接口：提供设备清单及相对定位要求、风向及火炬方位。", ["总图接口", "设备定位"], ["PR-D04"]],
  ["VDI-PR-STG-001", "30% P&ID 深度应满足 HAZOP 节点划分及主要仪表识别。", ["30% P&ID", "HAZOP"], ["PR-S01", "PR-X01"]],
  ["VDI-PR-STG-002", "60% P&ID 深度应完成管道等级及主要管道尺寸。", ["60% P&ID", "管道等级"], ["PR-S01"]],
  ["VDI-PR-STG-003", "90% P&ID 深度应完成安全阀、控制阀及在线分析仪表选型。", ["90% P&ID", "选型"], ["PR-S01", "PR-S03"]],
];
for (const [id, content, keywords, tags] of vdiBatch) {
  clauses.push({
    clause_id: `${id}-e`,
    source_type: "rule",
    source_id: id,
    version: "2026",
    discipline: "process",
    clause: "1.0",
    content,
    keywords,
    mandatory: true,
    skill_tags: tags,
    category: "VDI工艺规则-扩展",
  });
}

// 补充 GB50933 阶段深度
const gbExtra = [
  ["5.3.6", "基础设计应提交分析化验手册目录及取样点汇总表。", ["化验手册", "基础设计"], ["PR-X02", "PR-D01"]],
  ["5.3.7", "基础设计应明确三废治理方向及主要排放指标（工艺侧源强）。", ["三废", "源强"], ["PR-D03"]],
  ["6.2.5", "详细设计应提交管道应力分析所需工艺条件（温度压力波动）。", ["管道应力", "工艺条件"], ["PR-S01"]],
];
for (const [c, t, k, tags] of gbExtra) {
  clauses.push(mk("GB/T 50933-2013", "2013", c, t, k, tags, "GB50933-扩展"));
}

fs.writeFileSync(
  OUT,
  JSON.stringify(
    { seed_version: "2e", discipline: "process", description: "Sprint 5 Phase 2e 扩展", clauses },
    null,
    2
  ) + "\n",
  "utf8"
);
console.log(`Generated ${clauses.length} phase2e clauses → ${OUT}`);
