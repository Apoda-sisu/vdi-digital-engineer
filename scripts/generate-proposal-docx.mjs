import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, PageBreak, LevelFormat, TableOfContents } from 'docx';
import fs from 'fs';

// 格式常量
const FONT = '仿宋简体';
const FONT_FALLBACK = 'FangSong';
const BODY_SIZE = 24; // 小四 = 12pt = 24 half-points
const LINE_SPACING = 500; // 25磅 = 500 twentieths of a point
const FIRST_LINE_INDENT = 480; // 2字符 ≈ 480 DXA (12pt字体)
const HEADING_FONT = '黑体简体';
const HEADING_FONT_FALLBACK = 'SimHei';

// 页面设置 (A4)
const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const MARGIN_TOP = 1440;
const MARGIN_BOTTOM = 1440;
const MARGIN_LEFT = 1800; // 约3.17cm
const MARGIN_RIGHT = 1800;

// 表格样式
const border = { style: BorderStyle.SINGLE, size: 1, color: '999999' };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

// 辅助函数：创建正文段落
function bodyPara(text, options = {}) {
  const { bold, indent, alignment, spacing } = options;
  return new Paragraph({
    alignment: alignment || AlignmentType.JUSTIFIED,
    spacing: { line: LINE_SPACING, ...(spacing || {}) },
    indent: indent !== false ? { firstLine: FIRST_LINE_INDENT } : undefined,
    children: [
      new TextRun({
        text,
        font: FONT,
        size: BODY_SIZE,
        bold: bold || false,
      }),
    ],
  });
}

// 辅助函数：创建标题段落
function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { before: 360, after: 240, line: LINE_SPACING },
    children: [
      new TextRun({
        text,
        font: HEADING_FONT,
        size: 36, // 小二 = 18pt
        bold: true,
      }),
    ],
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 180, line: LINE_SPACING },
    children: [
      new TextRun({
        text,
        font: HEADING_FONT,
        size: 32, // 三号 = 16pt
        bold: true,
      }),
    ],
  });
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 180, after: 120, line: LINE_SPACING },
    children: [
      new TextRun({
        text,
        font: HEADING_FONT,
        size: 28, // 小三 = 14pt
        bold: true,
      }),
    ],
  });
}

// 辅助函数：创建表格
function createTable(headers, rows, colWidths) {
  const totalWidth = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
  const widths = colWidths || headers.map(() => Math.floor(totalWidth / headers.length));

  const headerRow = new TableRow({
    children: headers.map((h, i) => new TableCell({
      borders,
      width: { size: widths[i], type: WidthType.DXA },
      shading: { fill: 'D5E8F0', type: ShadingType.CLEAR },
      margins: cellMargins,
      verticalAlign: 'center',
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: LINE_SPACING },
        children: [new TextRun({ text: h, font: FONT, size: BODY_SIZE, bold: true })],
      })],
    })),
  });

  const dataRows = rows.map(row => new TableRow({
    children: row.map((cell, i) => new TableCell({
      borders,
      width: { size: widths[i], type: WidthType.DXA },
      margins: cellMargins,
      children: [new Paragraph({
        spacing: { line: LINE_SPACING },
        children: [new TextRun({ text: String(cell), font: FONT, size: BODY_SIZE })],
      })],
    })),
  }));

  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: widths,
    rows: [headerRow, ...dataRows],
  });
}

// 辅助函数：空行
function emptyPara() {
  return new Paragraph({
    spacing: { line: LINE_SPACING },
    children: [new TextRun({ text: '', font: FONT, size: BODY_SIZE })],
  });
}

// 辅助函数：封面信息
function coverLine(label, value) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 120, line: LINE_SPACING },
    children: [
      new TextRun({ text: label, font: FONT, size: 32, bold: true }),
      new TextRun({ text: value, font: FONT, size: 32 }),
    ],
  });
}

// ==================== 文档内容 ====================

const children = [];

// 封面
children.push(emptyPara(), emptyPara(), emptyPara(), emptyPara());
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 600, line: LINE_SPACING },
  children: [new TextRun({ text: '虚拟设计院数字工程师平台', font: HEADING_FONT, size: 52, bold: true })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 200, line: LINE_SPACING },
  children: [new TextRun({ text: '项 目 建 议 书', font: HEADING_FONT, size: 44, bold: true })],
}));
children.push(emptyPara(), emptyPara());
children.push(coverLine('编制单位：', '[公司名称]'));
children.push(coverLine('编制日期：', '2026年6月'));
children.push(coverLine('版    本：', 'V1.0'));
children.push(coverLine('密    级：', '内部'));
children.push(emptyPara(), emptyPara(), emptyPara(), emptyPara());

// 分页
children.push(new Paragraph({ children: [new PageBreak()] }));

// 目录
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 240, after: 360, line: LINE_SPACING },
  children: [new TextRun({ text: '目    录', font: HEADING_FONT, size: 36, bold: true })],
}));
children.push(new TableOfContents('目录', { hyperlink: true, headingStyleRange: '1-3' }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ==================== 一、项目概述 ====================
children.push(heading1('一、项目概述'));

children.push(heading2('1.1 项目名称'));
children.push(bodyPara('虚拟设计院数字工程师平台（Virtual Design Institute Digital Engineer Platform，简称 VDI Platform）'));

children.push(heading2('1.2 项目定位'));
children.push(bodyPara('本项目旨在建设一家虚拟工程设计公司：以 PilotDeck 为智能体操作系统，用 WorkSpace（项目工作舱）+ 岗位 Skill（专业数字工程师）+ VDI 插件（知识/规则/事件/编排）映射工程建设领域各专业与职能岗位，实现从任务下发、专业协同、三审三校、跨专业提资到知识沉淀的自动化与智能化。'));
children.push(bodyPara('核心理念：人机协同、规则优先、证据可追溯、签章责任在人。'));

children.push(heading2('1.3 项目背景'));

children.push(heading3('1.3.1 政策背景'));
children.push(bodyPara('2025年，国务院《关于深入实施"人工智能+"行动的意见》提出加快人工智能在设计、中试、生产、服务、运营全环节落地应用。2026年1月，工信部等八部门印发《"人工智能+制造"专项行动实施意见》，提出到2027年推动形成特色化、全覆盖的行业大模型，推广500个典型应用场景。'));

children.push(heading3('1.3.2 技术背景'));
children.push(bodyPara('AI Agent 时代到来：以对话为核心的"Chat"范式已告终结，AI竞争转向"能办事"的智能体时代。大模型成本断崖式下降：DeepSeek V4-Pro 永久降价后，10M output tokens/月仅需约 $87，较 Claude/GPT 节省 70%+。多Agent协作成熟：PilotDeck（清华/OpenBMB）等开源Agent操作系统已具备企业级部署能力。'));

children.push(heading3('1.3.3 行业背景'));
children.push(bodyPara('石油化工设计院面临人才断层：资深工程师退休，新人培养周期长（5-10年）。设计效率瓶颈：传统设计流程中，约45-55%的工作属于重复性、规则性任务。数字化转型迫切：行业从CAD（提升20%）→ BIM（提升30%）→ AI Agent（预计提升50%+）的智能化升级路径已清晰。'));

children.push(heading2('1.4 项目目标'));

children.push(heading3('1.4.1 总体目标'));
children.push(bodyPara('设计效率提升 ≥30%（挑战 ≥50%）；提资响应时效提升 ≥40%（挑战 ≥50%）；返工率下降 ≥20%（挑战 ≥30%）；规范符合率 ≥95%；可复用知识资产新增 ≥500 条。'));

children.push(heading3('1.4.2 阶段目标'));
children.push(createTable(
  ['阶段', '时间', '核心目标', '关键交付物'],
  [
    ['阶段1 试点A', '2026-Q2', '给排水单专业三审三校E2E', '9个Skill + 4个MCP + 知识库V2'],
    ['阶段2 试点B', '2026-Q3', '工艺→管道→仪控跨专业提资', '事件驱动协同验证'],
    ['阶段3 全专业扩展', '2026-Q4', '13设计专业全覆盖', '26个Skill + 全专业知识库'],
    ['阶段4 推广运营', '2027-Q1~Q2', '内部推广 + 行业标杆', '培训体系 + 实施方法论'],
  ],
  [2000, 1500, 3000, 3000]
));
children.push(emptyPara());

// ==================== 二、行业痛点与需求分析 ====================
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading1('二、行业痛点与需求分析'));

children.push(heading2('2.1 石化设计院现状'));

children.push(heading3('2.1.1 人才困境'));
children.push(createTable(
  ['问题', '现状', '影响'],
  [
    ['人才断层', '资深工程师集中退休，5年内预计流失30%+', '核心经验面临失传'],
    ['培养周期长', '新人成长为合格设计师需5-10年', '项目交付质量不稳定'],
    ['知识沉淀差', '经验散落在个人，缺乏系统化沉淀', '重复犯错，效率低下'],
  ],
  [2000, 4000, 3500]
));
children.push(emptyPara());

children.push(heading3('2.1.2 效率瓶颈'));
children.push(bodyPara('根据行业调研（McKinsey 2025、Hawk Ridge Systems），约45-55%的工作属于重复性、规则性任务，可被AI智能体有效替代。'));
children.push(createTable(
  ['工作类型', '人工日占比', '痛点'],
  [
    ['规范检索与理解', '15%', '360+条国标/行标，人工查阅耗时'],
    ['计算与选型', '20%', '公式套用、设备选型重复性高'],
    ['方案编制', '25%', '设计说明、方案比选需大量经验'],
    ['校审与修改', '20%', '三审三校流程长，返工率高'],
    ['提资与协同', '10%', '跨专业提资响应慢，信息丢失'],
    ['文档整理', '10%', '出图、归档、版本管理繁琐'],
  ],
  [2500, 2000, 5000]
));
children.push(emptyPara());

children.push(heading2('2.2 需求分析'));
children.push(bodyPara('核心需求包括：知识自动化——将360+条国标/行标/公司规定数字化，实现智能检索与引用；设计自动化——将重复性设计任务交给AI；校审自动化——三审三校流程数字化，红线规则自动检查；协同自动化——跨专业提资事件驱动，减少人工传递和信息丢失；知识沉淀——设计经验、案例、最佳实践系统化沉淀。'));

// ==================== 三、解决方案 ====================
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading1('三、解决方案'));

children.push(heading2('3.1 总体方案'));
children.push(bodyPara('构建"一个平台 + 两套体系 + 三个层次"的解决方案。一个平台：PilotDeck 智能体操作系统；两套体系：岗位Skill体系 + VDI插件体系；三个层次：知识层 → 规则层 → 协同层。'));

children.push(heading2('3.2 PilotDeck 运行时（基座）'));
children.push(createTable(
  ['能力', '说明'],
  [
    ['WorkSpace 隔离', '每个项目独立工作舱，文件/记忆/技能完全隔离'],
    ['白盒记忆', '记忆可追溯、可编辑、可回溯，Dream Mode自动整理'],
    ['智能路由', '子Agent级路由，复杂任务用旗舰模型，简单任务用轻量模型，省70%+ Token'],
    ['MCP 原生', 'Model Context Protocol 原生支持，插件化扩展'],
    ['Always-on', '后台持续运行，任务发现、监控、交付'],
  ],
  [2500, 7000]
));
children.push(emptyPara());

children.push(heading2('3.3 岗位 Skill 体系（26个数字工程师）'));
children.push(createTable(
  ['类别', '数量', '代表', '能力级别'],
  [
    ['设计专业', '13', '给排水、工艺、管道、仪控、电气等', 'L1-L2+'],
    ['设计管理', '2', '设计经理、计划调度', 'L2+'],
    ['职能岗位', '12', 'HSE、QA、采购、施工、费控等', 'L1'],
  ],
  [2000, 1200, 4000, 2300]
));
children.push(emptyPara());

children.push(heading2('3.4 VDI 插件体系（4个MCP插件）'));
children.push(createTable(
  ['插件', '工具数', '核心能力'],
  [
    ['vdi-knowledge', '5', '四层漏斗检索：查询解析→结构过滤→混合检索→精排+跨引用'],
    ['vdi-orchestrator', '9', '任务编排、WBS管理、状态跟踪、自动恢复'],
    ['vdi-rules', '3', '红线规则(7条)、校审闸门(4阶段20检查项)、输出契约'],
    ['vdi-events', '5', '事件发布/订阅、死信处理、审计日志'],
  ],
  [2500, 1200, 5800]
));
children.push(emptyPara());

// ==================== 四、核心能力与创新点 ====================
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading1('四、核心能力与创新点'));

children.push(heading2('4.1 多Agent协作能力'));
children.push(bodyPara('26个专业Skill协同工作，覆盖13设计专业 + 2管理 + 12职能。三级指挥体系：lead（负责人）→ sub（子领域）→ util（工具）。事件驱动协同：vdi-events 实现跨专业提资的实时、可靠传递。自动编排：vdi-orchestrator 实现任务包→WBS→派发→状态跟踪→自动恢复。'));

children.push(heading2('4.2 领域知识壁垒'));
children.push(bodyPara('360+条规范知识：GB/SH/行标/公司规定，结构化索引。四层漏斗检索：从查询解析到精排，召回率和准确率远超简单向量搜索。红线规则引擎：7条红线规则 + 4阶段校审闸门，确保设计合规。输出契约：DisciplineOutput JSON Schema，强制结构化输出。'));

children.push(heading2('4.3 人机协同机制'));
children.push(bodyPara('数据完整性校验：MUST/SHOULD/NICE三级数据分级，缺数据不开工。交互检查点：CP-0数据校验→CP-1方案确定→CP-2计算完成→CP-3输出提交。假设声明：使用默认值时必须显式声明并等待确认。禁止行为：不编造数据、不跳过检查点、不替代决策、不掩盖异常。'));

children.push(heading2('4.4 创新点'));
children.push(createTable(
  ['创新点', '说明', '行业意义'],
  [
    ['多Agent协作架构', '26个专业Skill协同工作，非单Agent', '国内首个石化设计院AI智能体集群'],
    ['领域知识壁垒', '360+条规范 + 四层漏斗检索 + 红线规则', '非通用AI套壳，深度垂直深耕'],
    ['人机协同协议', '数据校验+交互检查点+假设声明', 'AI辅助而非替代，符合工程伦理'],
    ['事件驱动协同', 'vdi-events实现跨专业实时提资', '突破传统邮件/会议协同模式'],
    ['白盒记忆+智能路由', '记忆可追溯，Token成本降70%+', '企业级可审计，成本可控'],
  ],
  [2200, 3500, 3800]
));
children.push(emptyPara());

// ==================== 五、竞品分析与先进性论证 ====================
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading1('五、竞品分析与先进性论证'));

children.push(heading2('5.1 vs OpenClaw（龙虾）'));
children.push(createTable(
  ['维度', 'OpenClaw', 'VDI平台（本项目）'],
  [
    ['定位', '通用个人AI助手', '石化设计院数字工程师'],
    ['领域深耕', '❌ 无', '✅ 石化设计全流程'],
    ['多Agent协作', '❌ 单Agent', '✅ 26个专业Skill'],
    ['知识库', '❌ 无', '✅ 360+条规范'],
    ['规则引擎', '❌ 无', '✅ 红线+校审闸门'],
    ['安全合规', '⚠️ 漏洞多', '✅ 企业级+人机协同'],
  ],
  [2000, 3750, 3750]
));
children.push(emptyPara());
children.push(bodyPara('结论：OpenClaw是通用玩具，VDI是专业生产力工具。'));

children.push(heading2('5.2 vs 行业竞品'));
children.push(createTable(
  ['竞品', '定位', '局限性'],
  [
    ['TransBIM', '施工图AI生成', '聚焦施工图，不覆盖基础设计/校审/协同'],
    ['中铁先锋', '施工方案AI', '单专业单场景，非多Agent协作'],
    ['中材国际"小艾"', '规范查询工具', '规范查询，非设计自动化'],
  ],
  [2500, 2500, 4500]
));
children.push(emptyPara());
children.push(bodyPara('结论：工程设计领域的AI Agent竞品极少，本项目具有显著先发优势。'));

children.push(heading2('5.3 行业首创'));
children.push(bodyPara('国内首个石化设计院AI智能体集群平台。首个实现26个专业Skill的多Agent协作。首个构建石化设计领域知识库+规则引擎+事件协同的完整体系。'));

// ==================== 六、价值分析与效益测算 ====================
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading1('六、价值分析与效益测算'));

children.push(heading2('6.1 效率提升测算'));
children.push(bodyPara('以50人设计团队为例，年人均工作日220天，年总人工日11,000天，可替代人工日（45-55%）约4,950-6,050天。'));
children.push(createTable(
  ['档位', '设计效率提升', '节省人工日/年', '年化节省金额', '投入产出比'],
  [
    ['保守', '25%', '2,750天', '374万元', '1:1.5'],
    ['中性', '40%', '4,400天', '598万元', '1:2.4'],
    ['乐观', '55%', '6,050天', '823万元', '1:3.3'],
  ],
  [1500, 2000, 2000, 2000, 2000]
));
children.push(emptyPara());

children.push(heading2('6.2 综合效益'));
children.push(createTable(
  ['档位', '直接节省', '间接效益', '总效益'],
  [
    ['保守', '374万/年', '100万/年', '474万/年'],
    ['中性', '598万/年', '200万/年', '798万/年'],
    ['乐观', '823万/年', '300万/年', '1,123万/年'],
  ],
  [2000, 2500, 2500, 2500]
));
children.push(emptyPara());

children.push(heading2('6.3 LLM API成本'));
children.push(bodyPara('基于DeepSeek V4-Pro永久降价后定价，全专业重度使用（500M tokens/月）约¥15,000/月，相比50人团队年薪¥1,500万/年，API成本占比<1.2%。'));

// ==================== 七、资源需求与投入规划 ====================
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading1('七、资源需求与投入规划'));

children.push(heading2('7.1 人力投入'));
children.push(createTable(
  ['阶段', '核心团队', '周期'],
  [
    ['试点A（给排水）', '3人（AI架构师+全栈开发+领域专家）', '3个月'],
    ['试点B（跨专业）', '5人（+工艺/管道/仪控专家）', '3个月'],
    ['全专业扩展', '8-10人（+Skill开发者×4）', '6个月'],
    ['推广运营', '6-8人（+产品经理+实施顾问）', '持续'],
  ],
  [2500, 4500, 2500]
));
children.push(emptyPara());

children.push(heading2('7.2 资金投入（18个月）'));
children.push(createTable(
  ['类别', '金额（万元）', '说明'],
  [
    ['人力成本', '150-250', '核心团队5-8人 × 18个月'],
    ['LLM API + 基础设施', '15-30/年', 'DeepSeek V4-Pro + Docker部署'],
    ['知识库建设', '20-40', '规范数字化、标注、评估'],
    ['培训与推广', '10-20', '内部培训、试点支持'],
    ['合计', '200-350', ''],
  ],
  [3000, 2500, 4000]
));
children.push(emptyPara());

children.push(heading2('7.3 投入产出'));
children.push(createTable(
  ['档位', '总投入', '年化效益', '回收期', '投入产出比'],
  [
    ['保守', '200万', '474万/年', '5个月', '1:2.4'],
    ['中性', '275万', '798万/年', '4个月', '1:2.9'],
    ['乐观', '350万', '1,123万/年', '4个月', '1:3.2'],
  ],
  [1500, 2000, 2000, 2000, 2000]
));
children.push(emptyPara());

// ==================== 八、风险分析与应对策略 ====================
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading1('八、风险分析与应对策略'));

children.push(createTable(
  ['风险', '概率', '影响', '应对策略', '止损点'],
  [
    ['LLM幻觉导致设计错误', '中', '高', '三审三校+红线规则+人工终审', '规范符合率<90%则暂停'],
    ['专业Skill质量参差', '中', '中', '分梯队推进，先核心后外围', '核心3专业不达标则收缩'],
    ['API成本超预期', '低', '低', '智能路由降本+本地模型备选', '月API费>5万则切换方案'],
    ['核心人员流失', '中', '高', '知识沉淀在Skill文档中', '核心人员流失>50%则暂停'],
    ['行业巨头自研替代', '低-中', '高', '先发优势+知识壁垒+快速迭代', '竞品覆盖>50%则转型'],
  ],
  [2000, 800, 800, 3200, 2700]
));
children.push(emptyPara());

children.push(heading2('8.1 退出机制'));
children.push(bodyPara('试点A验收失败→暂停，分析原因，重新评估技术路线。效率提升<15%→暂停推广，重新评估价值。年化效益<投入的1.5倍→暂停扩张，优化成本结构。'));

// ==================== 九、实施计划与里程碑 ====================
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading1('九、实施计划与里程碑'));

children.push(createTable(
  ['里程碑', '时间', '交付物', '验收标准'],
  [
    ['M1 试点A验收', '2026-Q2', '给排水E2E验证报告', '离线26/26通过，人工UI验收通过'],
    ['M2 试点B验收', '2026-Q3', '跨专业提资验证报告', '事件端到端延迟≤3s，锚点一致'],
    ['M3 全专业L2', '2026-Q4', '13专业Skill验收报告', '每专业≥3个任务卡，Schema对齐'],
    ['M4 内部推广', '2027-Q1', '培训手册+实施指南', '50人团队完成培训'],
    ['M5 全面推广', '2027-Q2', '行业标杆报告', '效率提升≥30%实测验证'],
  ],
  [2000, 1500, 3000, 3000]
));
children.push(emptyPara());

// ==================== 十、结论与建议 ====================
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading1('十、结论与建议'));

children.push(heading2('10.1 核心结论'));
children.push(bodyPara('行业首创：国内首个石化设计院AI智能体集群平台，填补行业空白。技术可行：基于PilotDeck（清华/OpenBMB）成熟基座，试点A E2E已验证。价值显著：中性预估年化效益798万元，投入产出比1:2.9。风险可控：分阶段推进，止损机制明确，退出路径清晰。政策契合：响应国资委"AI+制造"、工信部"行业大模型"政策。'));

children.push(heading2('10.2 行动建议'));
children.push(bodyPara('立即启动：批准项目立项，组建核心团队（3人）。快速验证：完成试点A人工UI验收（2周内）。稳步推进：按Q2→Q3→Q4→Q1时间表分阶段推进。持续迭代：基于用户反馈持续优化Skill和MCP。标杆输出：在效率提升实测达标后，输出行业标杆案例。'));

children.push(heading2('10.3 一句话总结'));
children.push(bodyPara('基于清华PilotDeck的石化设计院AI智能体集群平台，26个专业Skill协同工作，360+条规范知识库+红线规则引擎+三审三校流程，国内首创，技术可行，中性预估年化效益798万元，投入产出比1:2.9，建议立即立项。', { bold: true }));

// 签章区
children.push(emptyPara(), emptyPara());
children.push(new Paragraph({
  spacing: { line: LINE_SPACING },
  children: [
    new TextRun({ text: '编制人：', font: FONT, size: BODY_SIZE }),
    new TextRun({ text: '____________', font: FONT, size: BODY_SIZE }),
    new TextRun({ text: '    审核人：', font: FONT, size: BODY_SIZE }),
    new TextRun({ text: '____________', font: FONT, size: BODY_SIZE }),
    new TextRun({ text: '    批准人：', font: FONT, size: BODY_SIZE }),
    new TextRun({ text: '____________', font: FONT, size: BODY_SIZE }),
  ],
}));
children.push(emptyPara());
children.push(new Paragraph({
  spacing: { line: LINE_SPACING },
  children: [
    new TextRun({ text: '编制日期：2026年6月', font: FONT, size: BODY_SIZE }),
  ],
}));

// ==================== 构建文档 ====================
const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: FONT, size: BODY_SIZE },
        paragraph: { spacing: { line: LINE_SPACING } },
      },
    },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: HEADING_FONT },
        paragraph: { spacing: { before: 360, after: 240 }, outlineLevel: 0 },
      },
      {
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 32, bold: true, font: HEADING_FONT },
        paragraph: { spacing: { before: 240, after: 180 }, outlineLevel: 1 },
      },
      {
        id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: HEADING_FONT },
        paragraph: { spacing: { before: 180, after: 120 }, outlineLevel: 2 },
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
        margin: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT, right: MARGIN_RIGHT },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: '虚拟设计院数字工程师平台项目建议书', font: FONT, size: 18, color: '888888' })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: '— ', font: FONT, size: 18, color: '888888' }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: '888888' }),
            new TextRun({ text: ' —', font: FONT, size: 18, color: '888888' }),
          ],
        })],
      }),
    },
    children,
  }],
});

// 输出
const buffer = await Packer.toBuffer(doc);
const outputPath = '/Users/apoda/Documents/Cursor/016-数字工程师/docs/项目建议书-详细版.docx';
fs.writeFileSync(outputPath, buffer);
console.log(`✅ 已生成: ${outputPath}`);
