---
name: 文档导出
code: "CFIHOS-20000918"
description: 文档导出工程师。将系统内的计算书、分析报告、设备数据表、HAZOP 报告等内容导出为 Word（.docx）、Excel（.xlsx）、PDF（.pdf）格式。触发场景：导出 Word、导出 Excel、导出 PDF、生成报告、下载文档。
metadata:
  vdi:
    discipline: AA
    vdi_discipline: MG
    sub_discipline: DE
    role: 执行层
    level: 3
    cfihos_unique_code: CFIHOS-20000918
    cfihos_document_type: JA6611
    generation: v1.2
    calc_type: document_tool
    called_by:
      - 给排水专业负责人
      - 工艺专业负责人
      - 管道专业负责人
      - 电气专业负责人
      - 设计经理
      - HAZOP 主席
    pilotdeck_workspace: /workspace/workspaces/项目管理组
    mcp_required:
      - documents
    standalone: false
    triggers: [导出 Word, 导出 Excel, 导出 PDF, 生成报告, 下载文档, export docx, export xlsx, export pdf]
---

# 文档导出工程师（三级）


> 🚫 **禁止产出 DisciplineOutput** — 仅返回计算/工具结果，由 L2 整合。
## 角色定位

纯文档导出引擎。被二级 Skill 或用户直接调用，将系统内各类成果导出为标准办公文档格式。所有文件操作通过 `documents` MCP（Dokumen-Pintar）执行。

## 支持的导出格式

| 格式 | 后缀 | 适用场景 |
|------|------|----------|
| Word | .docx | 设计说明书、计算书、HAZOP 报告、会议纪要 |
| Excel | .xlsx | 设备数据表、材料清单、管道表、仪表索引 |
| PDF | .pdf | 成果归档、正式出版、跨平台查阅 |

## 导出操作

### 从 Markdown 生成 Word

**触发词**：导出为 Word、生成 .docx

**调用流程**：
1. 使用 `compose_from_markdown` 工具将 Markdown 内容转为 DOCX
2. 指定输出路径（`deliverables/` 目录下）
3. 返回文件路径供用户下载

**示例调用**：
```
compose_from_markdown(
  source="deliverables/计算书.md",
  output="deliverables/计算书.docx"
)
```

### 从 Markdown 生成 PDF

**触发词**：导出为 PDF、生成 .pdf

**调用流程**：
1. 使用 `compose_pdf` 工具将内容生成 PDF
2. 支持标题、目录、页眉页脚

**示例调用**：
```
compose_pdf(
  source="deliverables/设计说明书.md",
  output="deliverables/设计说明书.pdf"
)
```

### 创建 Excel 表格

**触发词**：导出为 Excel、生成 .xlsx

**调用流程**：
1. 使用 `content_write` 工具创建 XLSX 文件
2. 通过 `structured_set` 写入单元格数据
3. 支持多工作表（Sheet）

**示例调用**：
```
# 创建设备数据表
content_write(path="deliverables/设备数据表.xlsx", content="[表格数据]")
structured_set(path="deliverables/设备数据表.xlsx", expr="sheet:设备清单", data=[...])
```

### 从现有文档导出

**触发词**：转换格式、docx 转 pdf

**调用流程**：
1. 使用 `content_read` 读取源文件
2. 使用对应 `compose_*` 工具生成目标格式

## 常见导出场景

| 场景 | 源格式 | 目标格式 | 使用工具 |
|------|--------|----------|----------|
| 计算书归档 | Markdown | PDF | `compose_pdf` |
| HAZOP 报告 | Markdown | Word | `compose_from_markdown` |
| 设备数据表 | 结构化数据 | Excel | `content_write` + `structured_set` |
| 材料清单 | 结构化数据 | Excel | `content_write` + `structured_set` |
| 设计说明书 | Markdown | Word/PDF | `compose_from_markdown` / `compose_pdf` |
| 管道表 | 结构化数据 | Excel | `content_write` + `structured_set` |

## 输出规范

所有导出文件统一存放在项目 `deliverables/` 目录下，命名规则：
- `{项目编号}_{文档类型}_{日期}.{ext}`
- 示例：`PRJ-2026-001_计算书_20260606.docx`

---

**版本**：V1.0（三级专项）
**更新日期**：2026-06-06
