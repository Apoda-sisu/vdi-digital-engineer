import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, Footer, AlignmentType, LevelFormat,
        TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType,
        PageNumber, PageBreak, TabStopType, TabStopPosition } from 'docx';
import fs from 'fs';

// Helper functions
const createTextRun = (text, options = {}) => new TextRun({ text, ...options });
const createParagraph = (children, options = {}) => new Paragraph({ children, ...options });
const createHeading = (text, level) => new Paragraph({ heading: level, children: [createTextRun(text, { bold: true })] });

// Table helpers
const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const headerShading = { fill: "2E75B6", type: ShadingType.CLEAR };
const altRowShading = { fill: "F2F7FB", type: ShadingType.CLEAR };

const createTableCell = (content, options = {}) => {
  const { isHeader = false, width, shading } = options;
  return new TableCell({
    borders,
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: isHeader ? headerShading : shading,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [createParagraph([createTextRun(content, { 
      bold: isHeader, 
      color: isHeader ? "FFFFFF" : undefined,
      size: 20 
    })], { spacing: { before: 40, after: 40 } })]
  });
};

const createTable = (headers, rows, columnWidths) => {
  const totalWidth = columnWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths,
    rows: [
      new TableRow({
        children: headers.map((h, i) => createTableCell(h, { isHeader: true, width: columnWidths[i] }))
      }),
      ...rows.map((row, rowIndex) => new TableRow({
        children: row.map((cell, i) => createTableCell(cell, { 
          width: columnWidths[i],
          shading: rowIndex % 2 === 1 ? altRowShading : undefined
        }))
      }))
    ]
  });
};

// Bullet list helper
const createBulletItem = (text, level = 0) => new Paragraph({
  numbering: { reference: "bullets", level },
  children: [createTextRun(text, { size: 22 })],
  spacing: { before: 60, after: 60 }
});

// Numbered list helper
const createNumberedItem = (text, level = 0) => new Paragraph({
  numbering: { reference: "numbers", level },
  children: [createTextRun(text, { size: 22 })],
  spacing: { before: 60, after: 60 }
});

// Note/placeholder for diagrams
const createDiagramPlaceholder = (title) => new Paragraph({
  children: [createTextRun(`[图表: ${title}]`, { italics: true, color: "666666", size: 20 })],
  spacing: { before: 120, after: 120 },
  alignment: AlignmentType.CENTER,
  border: { 
    top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC", space: 8 },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC", space: 8 },
    left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC", space: 8 },
    right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC", space: 8 }
  }
});

// Build document
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: "1F4E79" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: "Arial", color: "2E75B6" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: "4A90D9" },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [
      { reference: "bullets",
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.BULLET, text: "\u25CB", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1080, hanging: 360 } } } }
        ] },
      { reference: "numbers",
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.DECIMAL, text: "%2)", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1080, hanging: 360 } } } }
        ] },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 }, // A4
        margin: { top: 1440, right: 1260, bottom: 1440, left: 1260 }
      }
    },
    headers: {
      default: new Header({
        children: [createParagraph([createTextRun("虚拟设计院数字工程师平台项目规划书", { size: 18, color: "999999" })], {
          alignment: AlignmentType.RIGHT,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "2E75B6", space: 4 } }
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [createParagraph([
          createTextRun("第 ", { size: 18, color: "999999" }),
          createTextRun({ children: [PageNumber.CURRENT], size: 18, color: "999999" }),
          createTextRun(" 页", { size: 18, color: "999999" })
        ], {
          alignment: AlignmentType.CENTER,
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: "2E75B6", space: 4 } }
        })]
      })
    },
    children: [
      // Title page
      createParagraph([], { spacing: { before: 2400 } }),
      createParagraph([createTextRun("虚拟设计院数字工程师平台", { size: 52, bold: true, color: "1F4E79" })], {
        alignment: AlignmentType.CENTER, spacing: { after: 200 }
      }),
      createParagraph([createTextRun("项目规划书", { size: 44, bold: true, color: "2E75B6" })], {
        alignment: AlignmentType.CENTER, spacing: { after: 600 }
      }),
      createParagraph([createTextRun("版本：V3.3", { size: 24, color: "666666" })], {
        alignment: AlignmentType.CENTER, spacing: { after: 120 }
      }),
      createParagraph([createTextRun("（试点A E2E 准备就绪 — MCP/Skills/Schema 全面对齐）", { size: 22, color: "666666" })], {
        alignment: AlignmentType.CENTER, spacing: { after: 120 }
      }),
      createParagraph([createTextRun("日期：2026-05-31", { size: 22, color: "666666" })], {
        alignment: AlignmentType.CENTER, spacing: { after: 120 }
      }),
      createParagraph([createTextRun("状态：PilotDeck 运行时；4 MCP 全部上线", { size: 22, color: "666666" })], {
        alignment: AlignmentType.CENTER, spacing: { after: 2400 }
      }),
      
      // Page break before TOC
      new Paragraph({ children: [new PageBreak()] }),
      
      // Table of Contents
      createHeading("目录", HeadingLevel.HEADING_1),
      new TableOfContents("目录", { hyperlink: true, headingStyleRange: "1-3" }),
      new Paragraph({ children: [new PageBreak()] }),
      
      // Section 1
      createHeading("1. 建设目标", HeadingLevel.HEADING_1),
      createHeading("1.1 总体目标", HeadingLevel.HEADING_2),
      createParagraph([createTextRun("建设一家"), createTextRun("虚拟工程设计公司（Virtual Design Institute, VDI）", { bold: true }), createTextRun("：以 PilotDeck 为智能体操作系统，用 "), createTextRun("WorkSpace（项目工作舱）+ 岗位 Skill（专业数字工程师）+ VDI 插件（知识/规则/事件/编排）", { bold: true }), createTextRun(" 映射工程建设领域各专业与职能岗位，实现从任务下发、专业协同、三审三校、跨专业提资到知识沉淀的"), createTextRun("自动化与智能化", { bold: true }), createTextRun("，并坚持「人机协同、规则优先、证据可追溯、签章责任在人」。")], { spacing: { after: 200 } }),
      
      createParagraph([createTextRun("与公司形态的对应关系：", { bold: true })], { spacing: { before: 200, after: 120 } }),
      createTable(
        ["传统企业要素", "VDI 数字映射"],
        [
          ["项目部 / 项目组", "PilotDeck WorkSpace（按项目隔离文件、记忆、技能）"],
          ["专业科室（工艺、管道、仪控…）", "vdi-*-agent Skill（内含负责人/设计/校核/审核/审定五角色）"],
          ["设计经理、文控、费控等职能岗", "设计经理、vdi-document-engineer 等职能 Skill"],
          ["技术标准与知识库", "vdi-knowledge MCP（pilotdeck-vdi/data/knowledge-clauses.json）"],
          ["质量红线与校审制度", "vdi-rules MCP + 三审三校流程"],
          ["协同与提资流程", "vdi-events + vdi-orchestrator + 数据线程契约"]
        ],
        [4000, 5400]
      ),
      
      createHeading("1.2 年度目标", HeadingLevel.HEADING_2),
      createBulletItem("设计效率提升率达到 ≥30%（挑战 ≥50%）"),
      createBulletItem("提资响应时效提升率达到 ≥40%（挑战 ≥50%）"),
      createBulletItem("返工率下降率达到 ≥20%（挑战 ≥30%）"),
      createBulletItem("规范符合率达到 ≥95%"),
      createBulletItem("可复用知识资产新增 ≥500 条"),
      
      new Paragraph({ children: [new PageBreak()] }),
      
      // Section 2
      createHeading("2. 建设范围与边界", HeadingLevel.HEADING_1),
      createHeading("2.1 建设范围", HeadingLevel.HEADING_2),
      createBulletItem("运行时：PilotDeck（Gateway + Web UI + WorkSpace + 白盒记忆 + 智能路由 + MCP 原生）"),
      createBulletItem("岗位层：26 个 VDI Skills（13 设计专业 + 1 设计管理 + 12 职能，每专业 Skill 内含五角色与三审三校）"),
      createBulletItem("平台层：VDI 深集成插件（vdi-knowledge / vdi-rules / vdi-events / vdi-orchestrator）"),
      createBulletItem("数据层：数据线程对象与事件模型（PilotDeck 插件强制执行）"),
      createBulletItem("知识层：法规/国标/行标/公司规定/案例（YAML → 检索索引，已试点 360+ 条文）"),
      createBulletItem("集成层（分期）：文控、项目管理、PDM/PLM、消息总线；二期 CAD/ERP/OA/BI"),
      createBulletItem("治理层：权限、审计、红线、证据链、质量度量"),
      
      createHeading("2.2 边界说明", HeadingLevel.HEADING_2),
      createBulletItem("AI 不替代法定签章与最终技术责任"),
      createBulletItem("未授权规范不纳入可分发知识库"),
      createBulletItem("敏感项目数据必须脱敏和分级授权"),
      
      new Paragraph({ children: [new PageBreak()] }),
      
      // Section 3
      createHeading("3. 总体架构", HeadingLevel.HEADING_1),
      createParagraph([createTextRun("平台在"), createTextRun("逻辑上", { bold: true }), createTextRun("仍采用六层架构，在"), createTextRun("物理上", { bold: true }), createTextRun("以 "), createTextRun("PilotDeck 为唯一智能体运行时", { bold: true }), createTextRun("，VDI 插件承载全部中台能力。")], { spacing: { after: 200 } }),
      
      createNumberedItem("业务应用层：PilotDeck Web UI（对话/文件/Skills/记忆）+ 分期企业门户对接"),
      createNumberedItem("协同编排层：vdi-orchestrator + vdi-events + 计划调度 / 设计经理"),
      createNumberedItem("智能体执行层：26× vdi-* Skills（斜杠命令 /vdi-xxx-agent 启用岗位能力）"),
      createNumberedItem("能力中台层：VDI 插件（知识检索、规则校核、事件总线）+ PilotDeck 智能路由与 MCP"),
      createNumberedItem("数据与知识层：WorkSpace 项目目录 + knowledge-clauses 索引 + 数据对象 JSON Schema"),
      createNumberedItem("治理与安全层：红线规则、证据链、权限与审计（分期对接 IAM）"),
      
      createHeading("3.1 六层总体架构图", HeadingLevel.HEADING_2),
      createDiagramPlaceholder("六层总体架构图（Mermaid）"),
      
      createHeading("3.2 平台逻辑组件图（PilotDeck + VDI）", HeadingLevel.HEADING_2),
      createDiagramPlaceholder("平台逻辑组件图（Mermaid）"),
      
      createHeading("3.3 PilotDeck 运行时架构（实施落地）", HeadingLevel.HEADING_2),
      createDiagramPlaceholder("PilotDeck 运行时架构图（Mermaid）"),
      
      createParagraph([createTextRun("已落地能力（2026-05-31）：", { bold: true })], { spacing: { before: 200, after: 120 } }),
      createBulletItem("PilotDeck 容器部署，/workspace 挂载本仓库"),
      createBulletItem("26 个 Skills 迁入 ~/.pilotdeck/skills；process 三级体系（8 Skills）就绪"),
      createBulletItem("4 个 MCP 全部上线：vdi-knowledge（2 工具）/ vdi-orchestrator（7 工具）/ vdi-rules（3 工具）/ vdi-events（5 工具）= 17 工具"),
      createBulletItem("双试点 WorkSpace 目录就绪；VDI-PILOT-A TaskPackage 已创建"),
      createBulletItem("P0 Schema 对齐完成：6 个 water 子领域 Skill 输出契约与 vdi-rules.json 校验字段一致"),
      createBulletItem("离线 E2E 脚本 26/26 通过；docs/试点A-E2E操作手册.md 就绪"),
      
      createHeading("3.4 应用集成架构图（分期）", HeadingLevel.HEADING_2),
      createDiagramPlaceholder("应用集成架构图（Mermaid）"),
      
      createParagraph([createTextRun("MVP 阶段优先在 WorkSpace 内跑通专业闭环与插件化事件；企业系统通过 MCP/Adapter 分期接入，不阻塞 PilotDeck 试点。", { italics: true })], { spacing: { before: 120, after: 200 } }),
      
      createHeading("3.5 技术选型说明", HeadingLevel.HEADING_2),
      createTable(
        ["层级", "选型", "说明"],
        [
          ["智能体 OS", "PilotDeck（开源）", "WorkSpace 隔离、MCP 原生、白盒记忆、智能路由"],
          ["岗位定义", "Agent Skills（workspaces/{组}/skills/vdi-*）", "一专业一 Skill，内含五角色工作流"],
          ["知识检索", "vdi-knowledge MCP", "YAML 知识库 → JSON 索引，禁止无工具编造条款"],
          ["质量规则", "vdi-rules MCP（建设）", "红线 + DisciplineOutput 契约 + 三审闸门"],
          ["协同编排", "vdi-events + vdi-orchestrator（建设）", "承接 agent-routing.yaml"],
          ["契约与回归", "pilotdeck-vdi/mcp/", "Schema 已内置于各 MCP 插件；事件模型由 vdi-events 管理"],
          ["部署", "Docker Compose", "代码仓 /Users/apoda/GitHub/PilotDeck，VDI 仓挂载为 /workspace"]
        ],
        [2000, 3200, 4200]
      ),
      
      new Paragraph({ children: [new PageBreak()] }),
      
      // Section 4
      createHeading("4. 核心业务闭环", HeadingLevel.HEADING_1),
      createNumberedItem("项目经理创建任务包并定义里程碑"),
      createNumberedItem("编排引擎拆解任务并派发到专业智能体/工程师"),
      createNumberedItem("智能体基于知识检索 + 规则校核生成建议与草案"),
      createNumberedItem("质控智能体执行三审三校规则，形成问题清单"),
      createNumberedItem("专业负责人校审决策（通过/退回）"),
      createNumberedItem("结果回写业务系统并归档"),
      createNumberedItem("沉淀案例与规则优化，反哺后续项目"),
      
      createHeading("4.1 核心业务闭环时序图", HeadingLevel.HEADING_2),
      createDiagramPlaceholder("核心业务闭环时序图（Mermaid）"),
      
      new Paragraph({ children: [new PageBreak()] }),
      
      // Section 5
      createHeading("5. 全专业数字工程师体系（Skills + PilotDeck）", HeadingLevel.HEADING_1),
      createHeading("5.0 架构原则（V3）", HeadingLevel.HEADING_2),
      createBulletItem("一专业一 Skill：每个设计专业一个 vdi-{discipline}-agent，内含专业负责人、设计人、校核人、审核人、审定人五角色；校审在专业内闭环。"),
      createBulletItem("职能岗独立 Skill：HSE/质控、采购、施工、文控等独立协作；不设独立「设计校审」「现场代表」Skill（职责并入专业负责人角色）。"),
      createBulletItem("工具强制：规范结论须经 vdi_search_knowledge / vdi_get_citation；输出须经 vdi-rules（建设）校验。"),
      createBulletItem("启用方式：WorkSpace 选定项目 → 对话 /vdi-xxx-agent → 工具显示为 mcp__vdi-knowledge__* 即 MCP 已接通。"),
      
      createHeading("5.1 建设完成情况", HeadingLevel.HEADING_2),
      createTable(
        ["类别", "数量", "状态"],
        [
          ["P0 设计专业 Skills", "21（含 water 三级体系 9 个）", "✅ water 三级体系已完成"],
          ["P1 设计管理与编排", "2", "✅ design-manager L2、scheduler-agent L2"],
          ["P2 职能 Skills", "12", "✅"],
          ["平台辅助", "2", "✅ agent-router、data-thread"],
          ["VDI 插件", "4", "🔄 knowledge ✅；orchestrator ✅；rules/events 建设中"]
        ],
        [3000, 3200, 3200]
      ),
      
      createHeading("5.2 P0 设计专业（13）", HeadingLevel.HEADING_2),
      createTable(
        ["Skill", "核心职责", "MVP"],
        [
          ["工艺专业负责人", "工艺路线、PFD/P&ID、设计基础", "试点 B"],
          ["管道设计", "管道、材料等级、应力", "试点 B"],
          ["仪控设计", "仪表、联锁、DCS/PLC", "试点 B"],
          ["给排水专业负责人 + 子领域", "给排水三级指挥体系（1 lead + 6 sub + 2 util = 9 Skills）", "试点 A ✅ L2+ 完成"],
          ["电气设计", "供配电、防爆、接地", "阶段二"],
          ["设备设计", "静动设备、布置", "阶段二"],
          ["暖通设计", "暖通空调", "阶段二"],
          ["消防设计", "消防专项", "阶段二"],
          ["热工设计", "热工", "阶段三"],
          ["结构设计", "结构", "阶段三"],
          ["建筑设计", "建筑", "阶段三"],
          ["总图设计", "总图", "阶段三"],
          ["电信设计", "电信", "阶段三"]
        ],
        [2800, 4000, 2600]
      ),
      
      createHeading("5.3 P1 与 P2", HeadingLevel.HEADING_2),
      createTable(
        ["类型", "Skills"],
        [
          ["P1", "设计经理、计划调度"],
          ["P2 职能", "HSE管理、质量管理、采购/施工/质量/HSE经理、试运行、费控、财务、进度、材控、vdi-document-engineer"]
        ],
        [2000, 7400]
      ),
      
      createHeading("5.4 能力矩阵（PilotDeck）", HeadingLevel.HEADING_2),
      createTable(
        ["岗位", "文档", "规则", "协同", "MCP 知识", "证据链"],
        [
          ["工艺/管道/仪控", "高", "高", "高", "分期", "强制"],
          ["给排水", "高", "高", "中", "已接通", "强制"],
          ["电气/设备/土建", "中", "中", "中", "建设", "强制"],
          ["质量管理", "低", "高", "高", "高", "强制"]
        ],
        [2000, 1200, 1200, 1200, 1600, 1200]
      ),
      
      createHeading("5.5 协同架构（V3）", HeadingLevel.HEADING_2),
      createDiagramPlaceholder("协同架构图（Mermaid）"),
      
      createHeading("5.6 Skills 深化", HeadingLevel.HEADING_2),
      createParagraph([createTextRun("各专业 Skill 须从「角色说明书」升级为「可执行岗位手册」。分阶段路线见 "), createTextRun("docs/VDI-专业Skills深化建议.md", { bold: true }), createTextRun("。")], { spacing: { after: 120 } }),
      
      createParagraph([createTextRun("阶段 1 完成（2026-05-30）：", { bold: true })], { spacing: { before: 120, after: 80 } }),
      createBulletItem("设计经理：L1→L2（PilotDeck 集成 + 工具调用协议 + TaskPackage Schema + 派发话术 + 3 任务卡）"),
      createBulletItem("计划调度：从 23 行骨架完整重建到 L2（WBS 拆解 + 依赖分析 + 里程碑管理 + 资源冲突检测 + 3 任务卡）"),
      createBulletItem("给排水专业负责人：L1→L2（工具调用协议 + 2 个 DisciplineOutput 样例 + 3 任务卡 + 跨专业事件表 + 知识查询索引）"),
      createBulletItem("vdi-orchestrator MCP 插件上线：7 个工具"),
      createBulletItem("TaskPackage JSON Schema + milestones.yaml 模板就绪"),
      
      createHeading("5.7 三级指挥体系（新架构）", HeadingLevel.HEADING_2),
      createParagraph([createTextRun("为解决单 Skill 过长问题（如 water-agent 达 1066 行），引入专业内三级指挥体系：")], { spacing: { after: 120 } }),
      createDiagramPlaceholder("三级指挥体系架构图"),
      
      createParagraph([createTextRun("给排水试点（2026-05-30 完成）：", { bold: true })], { spacing: { before: 120, after: 80 } }),
      createTable(
        ["级别", "数量", "Skills"],
        [
          ["一级（负责人）", "1", "给排水专业负责人 — 任务拆解派发、进度控制、校审组织、接口协调"],
          ["二级（分项领域）", "6", "supply（给水）/ fire（消防）/ drainage（排水）/ stormwater（雨水）/ wastewater（污水）/ circulating（循环水）"],
          ["三级（专项共享）", "2", "hydraulics（水力计算）/ equipment（设备选型）"]
        ],
        [2000, 1200, 6200]
      ),
      
      createParagraph([createTextRun("推广计划", { bold: true }), createTextRun("：给排水试点经验沉淀后，按以下优先级推广到全专业：")], { spacing: { before: 200, after: 80 } }),
      createNumberedItem("process（工艺）：lead + pfd/pid + material-balance + equipment-data + hazop"),
      createNumberedItem("piping（管道）：lead + material-grade + layout + stress + support"),
      createNumberedItem("instrument（仪控）：lead + index + loop + dcs-plc + safety"),
      createNumberedItem("其余专业按阶段二/三推进"),
      
      new Paragraph({ children: [new PageBreak()] }),
      
      // Section 6
      createHeading("6. 数据线程技术规范", HeadingLevel.HEADING_1),
      createHeading("6.1 架构原则", HeadingLevel.HEADING_2),
      createNumberedItem("对象优先：专业间交换结构化对象，不交换自由文本结论"),
      createNumberedItem("主数据锚定：以位号/管线号/设备号/回路号为跨专业锚点"),
      createNumberedItem("事件驱动：以事件推送替代轮询拉取"),
      createNumberedItem("增量优先：仅重算受影响对象"),
      createNumberedItem("证据强制：无依据结论不可入库、不可下游消费"),
      
      createHeading("6.2 核心数据对象", HeadingLevel.HEADING_2),
      createTable(
        ["对象", "用途", "主键"],
        [
          ["ProjectContext", "项目上下文与边界条件", "project_id"],
          ["EngineeringTag", "工程标签锚点（位号/管线号等）", "tag_id"],
          ["DesignBasis", "设计基础参数", "basis_id"],
          ["DisciplineOutput", "专业输出对象", "output_id"],
          ["ConstraintRule", "约束规则对象", "rule_id"],
          ["ValidationResult", "校核结果对象", "validation_id"],
          ["ChangeSet", "变更集合对象", "changeset_id"]
        ],
        [2800, 4000, 2600]
      ),
      
      createHeading("6.3 事件模型", HeadingLevel.HEADING_2),
      createTable(
        ["事件名", "触发时机", "生产者", "消费者"],
        [
          ["project_context.updated", "项目边界变化", "主数据服务", "全部专业智能体"],
          ["design_basis.updated", "设计基础变更", "工艺/主数据服务", "管道、仪控、HSE"],
          ["discipline_output.published", "专业成果发布", "各专业智能体", "下游专业 + 质控"],
          ["constraint_rule.updated", "规则版本更新", "规则服务", "全部校核类智能体"],
          ["validation.failed", "校核失败", "质控/HSE 智能体", "责任专业智能体"],
          ["changeset.approved", "变更审批通过", "变更服务", "全部受影响智能体"]
        ],
        [2800, 1800, 2200, 2600]
      ),
      
      createHeading("6.4 数据质量指标", HeadingLevel.HEADING_2),
      createBulletItem("完整性（必填字段齐全率）：100%"),
      createBulletItem("一致性（编码/单位/版本一致率）：≥95%"),
      createBulletItem("准确性（规则命中准确率）：≥85%"),
      createBulletItem("时效性（事件到消费延迟）：≤3s"),
      createBulletItem("证据链完整率：100%"),
      
      createHeading("6.5 数据线程与事件流图", HeadingLevel.HEADING_2),
      createDiagramPlaceholder("数据线程与事件流图（Mermaid）"),
      
      new Paragraph({ children: [new PageBreak()] }),
      
      // Section 7
      createHeading("7. 知识库体系", HeadingLevel.HEADING_1),
      createHeading("7.1 知识分类体系（L1-L3）", HeadingLevel.HEADING_2),
      createParagraph([createTextRun("L1 一级分类：", { bold: true })], { spacing: { after: 80 } }),
      createNumberedItem("法规与规范"),
      createNumberedItem("企业标准"),
      createNumberedItem("项目案例"),
      createNumberedItem("设计模板"),
      createNumberedItem("规则库"),
      createNumberedItem("主数据与字典"),
      
      createParagraph([createTextRun("L2 二级分类：", { bold: true })], { spacing: { before: 120, after: 80 } }),
      createBulletItem("法规与规范：国家标准/行业标准/地方法规"),
      createBulletItem("项目案例：工艺/管道/仪控/电气/土建/HSE"),
      createBulletItem("规则库：红线规则/告警规则/建议规则"),
      
      createHeading("7.2 知识库建设完成情况", HeadingLevel.HEADING_2),
      createTable(
        ["类别", "文件数量", "条款数量", "强制性条文"],
        [
          ["法律法规", "5", "85", "15"],
          ["国家标准", "11", "180", "25"],
          ["行业标准", "8", "120", "10"],
          ["公司规定", "8", "60", "5"],
          ["项目案例", "5", "25", "-"],
          ["合计", "37", "470", "55"]
        ],
        [2400, 2000, 2000, 2000]
      ),
      
      createHeading("7.3 核心规范清单", HeadingLevel.HEADING_2),
      createParagraph([createTextRun("法律法规：", { bold: true })], { spacing: { after: 80 } }),
      createBulletItem("安全生产法（2021）"),
      createBulletItem("消防法（2021）"),
      createBulletItem("特种设备安全法（2013）"),
      createBulletItem("环境保护法（2014）"),
      createBulletItem("职业病防治法（2018）"),
      
      createParagraph([createTextRun("国家标准：", { bold: true })], { spacing: { before: 120, after: 80 } }),
      createBulletItem("GB 50160-2008 石油化工企业设计防火规范（2018 年版）- 35 条"),
      createBulletItem("GB 50016-2014 建筑设计防火规范（2018 年版）- 52 条"),
      createBulletItem("GB 50058-2014 爆炸危险环境电力装置设计规范 - 42 条"),
      createBulletItem("GB 50187-2012 工业企业总平面设计规范"),
      createBulletItem("GB 50369-2014 油气长输管道工程施工及验收规范"),
      createBulletItem("GB 50493-2019 石油化工可燃气体和有毒气体检测报警设计标准"),
      createBulletItem("GB/T 50770-2013 石油化工安全仪表系统设计规范"),
      createBulletItem("GB 150-2011 压力容器"),
      createBulletItem("GB/T 151-2014 热交换器"),
      
      createParagraph([createTextRun("行业标准：", { bold: true })], { spacing: { before: 120, after: 80 } }),
      createBulletItem("SH/T 3006-2024 石油化工控制室设计规范（最新版）"),
      createBulletItem("SH/T 3007-2014 石油化工储运系统罐区设计规范"),
      createBulletItem("SH/T 3011-2017 石油化工企业工艺装置设计规范"),
      createBulletItem("SH/T 3012-2011 石油化工金属管道布置设计规范"),
      createBulletItem("SH/T 3059-2012 石油化工管道设计器材选用规范"),
      createBulletItem("SH/T 3073-2016 石油化工管道支吊架设计规范"),
      createBulletItem("HG/T 20507-2014 自动化仪表选型设计规范"),
      createBulletItem("HG/T 20508-2014 控制室设计规范"),
      createBulletItem("HG/T 20511-2014 信号报警及联锁系统设计规范"),
      
      createParagraph([createTextRun("公司规定（红线规则）：", { bold: true })], { spacing: { before: 120, after: 80 } }),
      createBulletItem("VDI-RED-001：高风险介质管线必须设置紧急切断阀（block 级）"),
      createBulletItem("VDI-RED-002：所有专业输出必须附证据链引用（block 级）"),
      createBulletItem("VDI-RED-003：防爆区域电气设备必须符合防爆等级要求（block 级）"),
      createBulletItem("VDI-RED-004：高风险输出需人工复核确认（warn 级）"),
      createBulletItem("VDI-RED-005：仪表数据表需核对量程与单位（suggest 级）"),
      
      createHeading("7.4 元数据标准", HeadingLevel.HEADING_2),
      createTable(
        ["字段", "类型", "必填", "说明"],
        [
          ["knowledge_id", "string", "是", "全局唯一 ID"],
          ["title", "string", "是", "条目标题"],
          ["category_l1", "enum", "是", "一级分类"],
          ["category_l2", "enum", "是", "二级分类"],
          ["discipline", "enum", "是", "专业标签"],
          ["source_type", "enum", "是", "standard/case/template/rule/masterdata"],
          ["source_ref", "string", "是", "来源编号（规范号/项目号）"],
          ["version", "string", "是", "版本号"],
          ["effective_date", "date", "是", "生效日期"],
          ["keywords", "array", "是", "关键词"],
          ["abstract", "string", "是", "摘要"],
          ["status", "enum", "是", "草稿/生效/冻结/退役"]
        ],
        [2000, 1200, 800, 5400]
      ),
      
      createHeading("7.5 知识库运营闭环图", HeadingLevel.HEADING_2),
      createDiagramPlaceholder("知识库运营闭环图（Mermaid）"),
      
      new Paragraph({ children: [new PageBreak()] }),
      
      // Section 8
      createHeading("8. 实施策略", HeadingLevel.HEADING_1),
      createHeading("8.1 分期建设", HeadingLevel.HEADING_2),
      createBulletItem("阶段一（0~3 个月）：MVP，聚焦工艺/管道/仪控/HSE 关键场景"),
      createBulletItem("阶段二（4~8 个月）：扩展至设备、电气、结构，强化跨专业协同"),
      createBulletItem("阶段三（9~12 个月）：企业级治理固化与规模复制"),
      
      createHeading("8.2 技术策略（PilotDeck 深集成）", HeadingLevel.HEADING_2),
      createBulletItem("运行时统一：PilotDeck 为唯一智能体 OS"),
      createBulletItem("规则优先：红线与契约由 vdi-rules 判定，模型仅作解释与编排"),
      createBulletItem("工具强制检索：专业结论必须经 vdi-knowledge MCP，禁止无 citations 的规范编造"),
      createBulletItem("模型路由：PilotDeck 智能路由 — 检索/格式化走轻模型，设计推理走主模型"),
      createBulletItem("WorkSpace 隔离：一项目一舱，记忆与成果不串项目"),
      createBulletItem("事件驱动协同：vdi-events + agent-routing.yaml，对象交换遵循数据线程 Schema"),
      createBulletItem("分期集成：API + 事件 + WorkSpace 文件回写；企业 PMS/DMS/PDM 二期接入"),
      
      createHeading("8.3 组织策略", HeadingLevel.HEADING_2),
      createBulletItem("设立架构评审委员会（业务 + 技术 + 专业总工）"),
      createBulletItem("建立\u201C月度评审 + 季度规划\u201D节奏"),
      createBulletItem("明确 AI 建议责任边界：建议可追溯，审批可追责"),
      
      new Paragraph({ children: [new PageBreak()] }),
      
      // Section 9
      createHeading("9. 90 天 MVP 实施路线图", HeadingLevel.HEADING_1),
      createHeading("9.0 路线图总览（甘特图）", HeadingLevel.HEADING_2),
      createDiagramPlaceholder("90天MVP实施路线图甘特图（Mermaid）"),
      
      createHeading("9.0.1 里程碑图", HeadingLevel.HEADING_2),
      createDiagramPlaceholder("里程碑图（Mermaid）"),
      
      createHeading("9.0.2 PilotDeck 深集成路线图（2026-05 起，16 周）", HeadingLevel.HEADING_2),
      createParagraph([createTextRun("与 "), createTextRun("docs/PilotDeck-VDI-深集成建设规划.md", { bold: true }), createTextRun(" 对齐，在 90 天 MVP 之上叠加：")], { spacing: { after: 120 } }),
      createTable(
        ["阶段", "周期", "目标", "状态"],
        [
          ["0 基座", "1–2 周", "Docker、Skills 迁移、vdi-knowledge MCP", "✅ 已完成"],
          ["1 试点 A", "3–6 周", "给排水三审三校 + vdi-rules", "✅ 编排层就绪"],
          ["2 试点 B", "7–10 周", "工艺→管道→仪控提资 + events/orchestrator", "待启动"],
          ["3 扩展", "11–16 周", "其余专业索引、企业系统 Adapter", "待启动"]
        ],
        [1600, 1600, 4000, 2200]
      ),
      
      createHeading("阶段 1 启动与基准确认（周 1-2）", HeadingLevel.HEADING_3),
      createParagraph([createTextRun("目标", { bold: true }), createTextRun("：完成项目启动、团队组建、需求确认、技术选型")], { spacing: { after: 80 } }),
      createParagraph([createTextRun("关键任务：", { bold: true })], { spacing: { before: 80, after: 60 } }),
      createBulletItem("周 1：项目启动会、团队组建、角色分工"),
      createBulletItem("周 1：需求调研、场景优先级确认"),
      createBulletItem("周 2：技术架构设计、技术选型确认"),
      createBulletItem("周 2：开发环境搭建、CI/CD 流程建立"),
      createParagraph([createTextRun("交付物：", { bold: true })], { spacing: { before: 80, after: 60 } }),
      createBulletItem("项目章程"),
      createBulletItem("需求规格说明书"),
      createBulletItem("技术架构设计文档"),
      createBulletItem("开发环境就绪"),
      createParagraph([createTextRun("里程碑：M1 - 项目启动完成（周 2 末）", { bold: true })], { spacing: { before: 120 } }),
      
      createHeading("阶段 2 数据与规则准备（周 3-4）", HeadingLevel.HEADING_3),
      createParagraph([createTextRun("目标", { bold: true }), createTextRun("：完成知识库建设、规则体系建立、数据治理")], { spacing: { after: 80 } }),
      createParagraph([createTextRun("关键任务：", { bold: true })], { spacing: { before: 80, after: 60 } }),
      createBulletItem("周 3：规范标准收集与数字化（GB 50160、GB 50016 等）"),
      createBulletItem("周 3：红线规则定义与编码"),
      createBulletItem("周 4：案例库建设（历史项目案例整理）"),
      createBulletItem("周 4：主数据标准定义（位号、管线号编码规则）"),
      createParagraph([createTextRun("交付物：", { bold: true })], { spacing: { before: 80, after: 60 } }),
      createBulletItem("知识库 V1.0（≥300 条规范条款）"),
      createBulletItem("红线规则库（≥20 条）"),
      createBulletItem("案例库（≥20 个案例）"),
      createBulletItem("主数据标准 V1.0"),
      createParagraph([createTextRun("里程碑：M2 - 知识库就绪（周 4 末）", { bold: true })], { spacing: { before: 120 } }),
      
      createHeading("阶段 3 平台建设与智能体联调（周 5-8）", HeadingLevel.HEADING_3),
      createParagraph([createTextRun("目标", { bold: true }), createTextRun("：完成平台开发、智能体集成、端到端联调")], { spacing: { after: 80 } }),
      createParagraph([createTextRun("关键任务：", { bold: true })], { spacing: { before: 80, after: 60 } }),
      createBulletItem("周 5：数据线程实现（事件总线、对象模型）"),
      createBulletItem("周 5：RAG 服务集成、规则引擎集成"),
      createBulletItem("周 6：工艺智能体开发、管道智能体开发"),
      createBulletItem("周 6：仪控智能体开发、HSE 智能体开发"),
      createBulletItem("周 7：质控智能体开发、调度智能体开发"),
      createBulletItem("周 7：智能体间协同联调"),
      createBulletItem("周 8：端到端流程测试、性能优化"),
      createParagraph([createTextRun("交付物：", { bold: true })], { spacing: { before: 80, after: 60 } }),
      createBulletItem("PilotDeck + VDI 插件 V1.0"),
      createBulletItem("29 个 Skills 迁入 PilotDeck；试点 A/B WorkSpace 验收报告"),
      createBulletItem("数据线程 V1.0（Schema + 插件校验）"),
      createBulletItem("联调测试报告"),
      createParagraph([createTextRun("里程碑：M3 - PilotDeck 平台上线（周 8 末）", { bold: true })], { spacing: { before: 120 } }),
      
      createHeading("阶段 4 试点验证与验收推广（周 9-12）", HeadingLevel.HEADING_3),
      createParagraph([createTextRun("目标", { bold: true }), createTextRun("：完成试点项目验证、KPI 验收、推广准备")], { spacing: { after: 80 } }),
      createParagraph([createTextRun("关键任务：", { bold: true })], { spacing: { before: 80, after: 60 } }),
      createBulletItem("周 9：试点项目启动、用户培训"),
      createBulletItem("周 9-10：试点项目运行、问题收集与优化"),
      createBulletItem("周 11：KPI 数据采集、验收评估"),
      createBulletItem("周 12：项目总结、推广方案制定"),
      createParagraph([createTextRun("交付物：", { bold: true })], { spacing: { before: 80, after: 60 } }),
      createBulletItem("试点项目报告"),
      createBulletItem("KPI 验收报告"),
      createBulletItem("用户手册"),
      createBulletItem("推广方案"),
      createParagraph([createTextRun("里程碑：M4 - 试点验收（周 12 末）", { bold: true })], { spacing: { before: 120 } }),
      
      createHeading("阶段 5 复盘与扩展规划（周 13）", HeadingLevel.HEADING_3),
      createParagraph([createTextRun("目标", { bold: true }), createTextRun("：项目复盘、经验总结、下一阶段规划")], { spacing: { after: 80 } }),
      createParagraph([createTextRun("关键任务：", { bold: true })], { spacing: { before: 80, after: 60 } }),
      createBulletItem("项目复盘会"),
      createBulletItem("经验教训总结"),
      createBulletItem("下一阶段规划（P3 智能体、扩展功能）"),
      createParagraph([createTextRun("交付物：", { bold: true })], { spacing: { before: 80, after: 60 } }),
      createBulletItem("项目总结报告"),
      createBulletItem("经验教训库"),
      createBulletItem("第二阶段规划"),
      createParagraph([createTextRun("里程碑：M5 - 项目关闭（周 13 末）", { bold: true })], { spacing: { before: 120 } }),
      
      new Paragraph({ children: [new PageBreak()] }),
      
      // Section 10
      createHeading("10. 组织与职责", HeadingLevel.HEADING_1),
      createTable(
        ["角色", "核心职责", "关键交付"],
        [
          ["项目委员会", "战略决策与资源协调", "阶段决策与预算审批"],
          ["PMO", "范围/进度/风险管理", "周报、风险清单、里程碑报告"],
          ["专业总工", "专业规则与质量把关", "规则清单、校审结论"],
          ["AI 产品与平台组", "平台与能力中台建设", "版本发布、SLA 报告"],
          ["数据知识组", "数据治理与知识运营", "标签体系、知识质量报告"],
          ["试点项目组", "场景验证与推广复制", "试点评估报告、复制方案"]
        ],
        [2400, 3400, 3600]
      ),
      
      new Paragraph({ children: [new PageBreak()] }),
      
      // Section 11
      createHeading("11. 治理与安全", HeadingLevel.HEADING_1),
      createHeading("11.1 数据分级", HeadingLevel.HEADING_2),
      createBulletItem("公开：可对外分享"),
      createBulletItem("内部：公司内部使用"),
      createBulletItem("敏感：项目相关人可访问"),
      createBulletItem("受限：核心机密，最小范围授权"),
      
      createHeading("11.2 访问控制", HeadingLevel.HEADING_2),
      createBulletItem("项目 + 角色 + 专业三维授权"),
      createBulletItem("最小权限原则"),
      createBulletItem("敏感操作双人复核"),
      
      createHeading("11.3 审计留痕", HeadingLevel.HEADING_2),
      createBulletItem("提示词、引用来源、规则命中、审批结论全留痕"),
      createBulletItem("审计日志保存≥10 年"),
      createBulletItem("支持审计追溯查询"),
      
      createHeading("11.4 模型治理", HeadingLevel.HEADING_2),
      createBulletItem("版本冻结"),
      createBulletItem("灰度发布"),
      createBulletItem("回滚机制"),
      createBulletItem("性能监控"),
      
      createHeading("11.5 运维治理", HeadingLevel.HEADING_2),
      createBulletItem("可用性监控（SLA≥99%）"),
      createBulletItem("时延监控（≤3s）"),
      createBulletItem("错误率监控（≤1%）"),
      createBulletItem("成本监控（按项目核算）"),
      
      new Paragraph({ children: [new PageBreak()] }),
      
      // Section 12
      createHeading("12. 关键 KPI", HeadingLevel.HEADING_1),
      createHeading("12.1 业务 KPI", HeadingLevel.HEADING_2),
      createBulletItem("交付周期缩短率：≥30%"),
      createBulletItem("返工率下降率：≥20%"),
      createBulletItem("规范符合率：≥95%"),
      createBulletItem("专家工时节省率：≥25%"),
      
      createHeading("12.2 技术 KPI", HeadingLevel.HEADING_2),
      createBulletItem("智能体任务成功率：≥90%"),
      createBulletItem("规则命中准确率：≥85%"),
      createBulletItem("RAG 检索相关性：≥80%"),
      createBulletItem("平台 SLA：≥99%"),
      createBulletItem("平均响应时延：≤3s"),
      
      createHeading("12.3 数据质量 KPI", HeadingLevel.HEADING_2),
      createBulletItem("证据链完整率：100%"),
      createBulletItem("数据完整性：≥95%"),
      createBulletItem("数据一致性：≥95%"),
      createBulletItem("审计覆盖率：100%"),
      
      new Paragraph({ children: [new PageBreak()] }),
      
      // Section 13
      createHeading("13. 风险与应对", HeadingLevel.HEADING_1),
      createTable(
        ["风险", "表现", "应对措施"],
        [
          ["数据质量不足", "建议偏差大", "数据准入门槛 + 清洗流程"],
          ["规则不完备", "漏检/误检", "规则分级 + 持续复核机制"],
          ["组织协同阻力", "使用率不高", "试点示范 + 绩效联动"],
          ["集成复杂度高", "上线延期", "先核心接口后扩展接口"],
          ["安全与合规风险", "审计争议", "全链路留痕 + 最小权限控制"],
          ["技术风险", "性能不达标", "性能测试 + 优化预案"],
          ["人员风险", "关键人员流失", "AB 角备份 + 知识文档化"]
        ],
        [2400, 2000, 5000]
      ),
      
      new Paragraph({ children: [new PageBreak()] }),
      
      // Section 14
      createHeading("14. 预算与资源", HeadingLevel.HEADING_1),
      createHeading("14.1 人力资源", HeadingLevel.HEADING_2),
      createBulletItem("项目经理：1 人"),
      createBulletItem("产品经理：1 人"),
      createBulletItem("架构师：1 人"),
      createBulletItem("AI 工程师：3 人"),
      createBulletItem("后端工程师：2 人"),
      createBulletItem("前端工程师：1 人"),
      createBulletItem("数据工程师：1 人"),
      createBulletItem("专业顾问（工艺/管道/仪控/HSE）：4 人"),
      createBulletItem("测试工程师：1 人"),
      
      createHeading("14.2 技术资源", HeadingLevel.HEADING_2),
      createBulletItem("GPU 服务器：2 台（A100 或同等）"),
      createBulletItem("CPU 服务器：4 台（32 核 64G）"),
      createBulletItem("存储：10TB SSD"),
      createBulletItem("云服务预算：¥500,000/年"),
      
      createHeading("14.3 数据资源", HeadingLevel.HEADING_2),
      createBulletItem("规范标准采购：¥100,000"),
      createBulletItem("历史案例整理：¥200,000"),
      createBulletItem("主数据治理：¥150,000"),
      
      createHeading("14.4 总预算", HeadingLevel.HEADING_2),
      createBulletItem("人力成本：¥3,500,000"),
      createBulletItem("技术资源：¥500,000"),
      createBulletItem("数据资源：¥450,000"),
      createBulletItem("其他（培训/差旅）：¥200,000"),
      createParagraph([createTextRun("合计：¥4,650,000", { bold: true })], { spacing: { before: 120 } }),
      
      new Paragraph({ children: [new PageBreak()] }),
      
      // Section 15
      createHeading("15. 验收标准", HeadingLevel.HEADING_1),
      createHeading("15.1 功能验收", HeadingLevel.HEADING_2),
      createBulletItem("21 个智能体全部上线"),
      createBulletItem("数据线程端到端打通"),
      createBulletItem("校审闭环完整实现"),
      createBulletItem("知识库检索准确率≥80%"),
      
      createHeading("15.2 性能验收", HeadingLevel.HEADING_2),
      createBulletItem("平台 SLA≥99%"),
      createBulletItem("平均响应时延≤3s"),
      createBulletItem("并发用户数≥100"),
      createBulletItem("事件处理延迟≤3s"),
      
      createHeading("15.3 质量验收", HeadingLevel.HEADING_2),
      createBulletItem("智能体任务成功率≥90%"),
      createBulletItem("规则命中准确率≥85%"),
      createBulletItem("证据链完整率=100%"),
      createBulletItem("审计覆盖率=100%"),
      
      createHeading("15.4 业务验收", HeadingLevel.HEADING_2),
      createBulletItem("试点项目设计效率提升≥30%"),
      createBulletItem("返工率下降≥20%"),
      createBulletItem("用户满意度≥85%"),
      
      new Paragraph({ children: [new PageBreak()] }),
      
      // Section 16
      createHeading("16. 后续规划", HeadingLevel.HEADING_1),
      createHeading("16.1 P3 优先级智能体建设", HeadingLevel.HEADING_2),
      createBulletItem("数字化交付经理智能体"),
      createBulletItem("模型工程师智能体"),
      createBulletItem("智能 P&ID 工程师智能体"),
      createBulletItem("智能仪表工程师智能体"),
      createBulletItem("数据与文档管理工程师智能体"),
      createBulletItem("招标工程师智能体"),
      createBulletItem("合同工程师智能体"),
      createBulletItem("行政工程师智能体"),
      createBulletItem("IT 工程师智能体"),
      createBulletItem("仓储工程师智能体"),
      
      createHeading("16.2 功能扩展", HeadingLevel.HEADING_2),
      createBulletItem("图纸结构化与智能审查"),
      createBulletItem("三维模型智能审查"),
      createBulletItem("进度智能预测"),
      createBulletItem("成本智能估算"),
      createBulletItem("风险智能预警"),
      
      createHeading("16.3 规模推广", HeadingLevel.HEADING_2),
      createBulletItem("试点项目复盘优化"),
      createBulletItem("推广方案实施"),
      createBulletItem("培训体系建设"),
      createBulletItem("运营体系建立"),
      
      new Paragraph({ children: [new PageBreak()] }),
      
      // Section 17
      createHeading("17. 附录", HeadingLevel.HEADING_1),
      createHeading("17.1 文档清单", HeadingLevel.HEADING_2),
      createBulletItem("全专业智能体 SKILL 建设总报告"),
      createBulletItem("全专业智能体清单与能力矩阵"),
      createBulletItem("工程总承包项目角色清单"),
      createBulletItem("设计专业智能体 SKILL 完成清单"),
      createBulletItem("设计专业智能体 SKILL 建设完成报告"),
      createBulletItem("知识库建设完成报告"),
      createBulletItem("知识库增补报告"),
      createBulletItem("知识库规范完善报告"),
      createBulletItem("数据线程技术规范 V1"),
      createBulletItem("知识库分类与标签标准"),
      createBulletItem("虚拟设计院总体方案 V1"),
      createBulletItem("PilotDeck-VDI 深集成建设规划、VDI 专业 Skills 深化建议"),
      createBulletItem("实施配置清单 V1（已完全迁移至 PilotDeck）"),
      createBulletItem("试点项目验收标准与 KPI 看板定义"),
      createBulletItem("项目整体建设进度跟踪计划书 V1.0（2026-05-31）"),
      createBulletItem("试点A E2E操作手册（2026-05-31）"),
      
      createHeading("17.2 术语表", HeadingLevel.HEADING_2),
      createBulletItem("PilotDeck：WorkSpace 级智能体操作系统（VDI 运行时）"),
      createBulletItem("VDI：虚拟设计院（Virtual Design Institute），本项目建设目标形态"),
      createBulletItem("Skill：Agent 岗位技能包（SKILL.md），对话中 /vdi-xxx-agent 启用"),
      createBulletItem("MCP：Model Context Protocol；VDI 知识/规则等以 MCP 工具暴露"),
      createBulletItem("RAG：检索增强生成（Retrieval-Augmented Generation）"),
      createBulletItem("HAZOP：危险与可操作性分析"),
      createBulletItem("SIL：安全完整性等级"),
      createBulletItem("PFD：工艺流程图"),
      createBulletItem("P&ID：管道仪表流程图"),
      createBulletItem("DCS：分散控制系统"),
      createBulletItem("PLC：可编程逻辑控制器"),
      createBulletItem("SLA：服务等级协议"),
      
      new Paragraph({ children: [new PageBreak()] }),
      
      // Version history
      createHeading("版本历史", HeadingLevel.HEADING_2),
      createTable(
        ["版本", "日期", "修订内容", "修订人"],
        [
          ["V1.0", "2026-03-05", "初始版本", "-"],
          ["V2.0", "2026-03-07", "整合全部配套文档", "AI 助手"],
          ["V3.0", "2026-05-30", "运行时切换 PilotDeck 深集成；26+3 Skills V3 体系", "AI 助手"],
          ["V3.1", "2026-05-30", "阶段1编排层就绪：vdi-orchestrator MCP 上线", "AI 助手"],
          ["V3.2", "2026-05-30", "三级指挥体系：给排水试点完成", "AI 助手"],
          ["V3.3", "2026-05-31", "试点A E2E准备：4 MCP全部部署；P0 Schema对齐", "AI 助手"]
        ],
        [1200, 2000, 4200, 2000]
      ),
      
      createHeading("审批记录", HeadingLevel.HEADING_2),
      createTable(
        ["角色", "姓名", "日期", "意见"],
        [
          ["项目委员会", "-", "-", "-"],
          ["PMO", "-", "-", "-"],
          ["专业总工", "-", "-", "-"]
        ],
        [2400, 2000, 2000, 3000]
      ),
    ]
  }]
});

// Generate document
const buffer = await Packer.toBuffer(doc);
const outputPath = '/Users/apoda/Documents/Cursor/016-数字工程师/项目规划书-虚拟设计院数字工程师平台.docx';
fs.writeFileSync(outputPath, buffer);
console.log(`✅ Word 文档已生成: ${outputPath}`);
