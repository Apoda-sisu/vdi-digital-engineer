---
name: 文档解读
code: "CFIHOS-20000909"
description: 文档解读工程师。读取并解析 Word（.docx）、Excel（.xlsx）、PDF（.pdf）及图片（.png/.jpg）中的文字与表格，提取结构化数据供系统使用。触发场景：读取文档、解析 Excel、提取 PDF、解读图片、导入数据、解读报告。
metadata:
  vdi:
    discipline: AA
    vdi_discipline: MG
    sub_discipline: DI
    role: 执行层
    level: 3
    cfihos_unique_code: CFIHOS-20000909
    cfihos_document_type: JA4372
    generation: v1.2
    calc_type: document_tool
    called_by:
      - 给排水专业负责人
      - 工艺专业负责人
      - 管道专业负责人
      - 电气专业负责人
      - 设计经理
    pilotdeck_workspace: /workspace/workspaces/项目管理组
    mcp_required:
      - documents
      - vdi-vision
      - vdi-knowledge
    standalone: false
    triggers: [读取文档, 解析 Excel, 提取 PDF, 解读图片, 导入数据, 解读报告, 读取 Word, 读取 PDF, 读取 Excel, 图片表格, 截图解读]
---

# 文档解读工程师（三级）


> 🚫 **禁止产出 DisciplineOutput** — 仅返回计算/工具结果，由 L2 整合。
## 角色定位

文档解析引擎。被二级 Skill 或用户直接调用，读取外部文档并提取结构化数据。文本类文件通过 `documents` MCP（Dokumen-Pintar）执行；图片中的文字与表格通过 `vdi-vision` MCP 执行。提取的数据可写入知识库（通过 `vdi-knowledge`）。

## 支持的输入格式

| 格式 | 后缀 | 解析能力 |
|------|------|----------|
| Word | .docx | 段落、表格、标题结构、全文搜索 |
| Excel | .xlsx | 单元格、范围、工作表、结构化查询 |
| PDF | .pdf | 逐页提取、大纲、元数据、表格识别 |
| CSV | .csv | 行列解析、结构化访问 |
| 图片 | .png / .jpg / .jpeg / .webp | 文字块、表格、键值对（通过 vdi-vision） |

> 图片解读仅覆盖**文字与表格**类内容（截图、扫描页、照片内文档），不解读工程图纸符号。

## 解读操作

### 读取 Word 文档

**触发词**：读取 Word、解析 .docx

**调用流程**：
1. 使用 `content_read` 读取 DOCX 内容
2. 使用 `structured_get` 按段落或表格提取结构化数据
3. 返回文本内容供 AI 分析

**示例调用**：
```
# 读取全文
content_read(path="uploads/设计基础.docx")

# 提取第3段
structured_get(path="uploads/设计基础.docx", expr="paragraph:3")

# 提取第1个表格
structured_get(path="uploads/设计基础.docx", expr="table:1")
```

### 读取 Excel 表格

**触发词**：读取 Excel、解析 .xlsx、提取表格数据

**调用流程**：
1. 使用 `content_read` 读取 XLSX 内容概览
2. 使用 `structured_get` 按单元格/范围/工作表提取数据
3. 返回结构化数据供系统使用

**示例调用**：
```
# 读取整个工作表
structured_get(path="uploads/设备清单.xlsx", expr="sheet:设备清单")

# 读取特定单元格
structured_get(path="uploads/设备清单.xlsx", expr="cell:Sheet1!B2")

# 读取范围
structured_get(path="uploads/设备清单.xlsx", expr="range:Sheet1!A1:D20")
```

### 读取 PDF 文档

**触发词**：读取 PDF、提取 PDF 内容、解析 PDF

**调用流程**：
1. 使用 `content_read` 读取 PDF 文本内容
2. 使用 `structured_get` 按页或大纲提取
3. 返回文本供 AI 分析

**示例调用**：
```
# 读取全文
content_read(path="uploads/规范文件.pdf")

# 读取第5页
structured_get(path="uploads/规范文件.pdf", expr="page:5")

# 获取目录大纲
structured_get(path="uploads/规范文件.pdf", expr="outline")
```

### 全文搜索

**触发词**：在文档中搜索、查找关键词

**调用流程**：
1. 使用 `search_in_format` 在文档中搜索关键词
2. 返回匹配结果及上下文

**示例调用**：
```
search_in_format(path="uploads/设计基础.xlsx", query="设计压力")
```

### 解读图片（文字/表格）

**触发词**：解读图片、图片表格、截图解读、读取 PNG/JPG

**调用流程**：
1. 确认图片已放入 `uploads/` 或 `workspaces/` 目录
2. 使用 `vdi_analyze_image` 提取文字块与表格
3. 可选：调用 `vdi_vision_status` 检查当前后端（本地 Ollama / 云端 API）
4. 将结构化结果供下游 Skill 或写入知识库

**后端切换**（环境变量 `VISION_PROVIDER`）：
- `openai` — 云端 OpenAI 兼容 API（需 `VISION_API_KEY`）
- `ollama` — 本地 Ollama（需 `ollama pull llava` 或配置 `VISION_MODEL_OLLAMA`）

**示例调用**：
```
# 检查 Vision 后端
vdi_vision_status()

# 解读图片（使用默认后端）
vdi_analyze_image(file_path="uploads/设备参数表.png")

# 指定本地 Ollama
vdi_analyze_image(file_path="uploads/扫描页.jpg", provider="ollama")

# 带关注重点
vdi_analyze_image(file_path="uploads/样本截图.png", focus="提取流量扬程表格")
```

**HTTP API**（Docker 部署）：
```
POST http://localhost:3004/api/analyze
Body: { "file_path": "uploads/设备参数表.png", "provider": "openai" }
```

## 典型应用场景

### 场景1：导入设计基础数据

```
用户：帮我读取这个 Excel 设备清单，提取所有设备的设计参数
流程：
1. structured_get(path="设备清单.xlsx", expr="sheet:设备清单")
2. 解析表头，识别列名（设备位号、设计压力、设计温度等）
3. 逐行提取结构化数据
4. 返回 JSON 格式的设备参数列表
```

### 场景2：解读厂家样本 PDF

```
用户：读取这个泵的厂家样本，提取性能曲线数据
流程：
1. content_read(path="泵样本.pdf")
2. 提取关键参数（流量、扬程、效率、功率）
3. 结构化为 JSON 输出
```

### 场景3：解析规范 PDF 录入知识库

```
用户：读取这个规范 PDF，提取相关条文
流程：
1. structured_get(path="规范.pdf", expr="outline")
2. 逐章节提取文本
3. 结构化为知识库条文格式
4. 通过 vdi-knowledge MCP 写入知识库
```

### 场景4：读取设计基础变更单

```
用户：读取这份 Word 变更单，提取变更内容
流程：
1. structured_get(path="变更单.docx", expr="table:1")
2. 解析变更条目（变更编号、变更内容、影响范围）
3. 返回结构化变更数据
```

### 场景5：解读截图或扫描页中的表格

```
用户：这张图片里是厂家样本的参数表，帮我提取出来
流程：
1. vdi_analyze_image(file_path="uploads/样本页.png", focus="设备参数表")
2. 从 result.tables 提取 headers 与 rows
3. 结构化为 JSON 输出
```

## 输出格式

所有解读结果以 JSON 格式返回，便于下游 Skill 消费：

```json
{
  "source_file": "uploads/设备清单.xlsx",
  "format": "xlsx",
  "sheets": [
    {
      "name": "设备清单",
      "headers": ["设备位号", "设备名称", "设计压力", "设计温度"],
      "rows": [
        ["R-101", "反应器", "6.0 MPa", "280 °C"],
        ["T-201", "精馏塔", "0.3 MPa", "150 °C"]
      ],
      "row_count": 15
    }
  ],
  "verdict": "解析成功，共提取 15 行数据"
}
```

图片解读结果示例：

```json
{
  "source_file": "uploads/参数表.png",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "result": {
    "content_type": "table",
    "tables": [{
      "title": "泵性能参数",
      "headers": ["流量 m³/h", "扬程 m", "效率 %"],
      "rows": [["100", "50", "78"]]
    }],
    "summary": "泵样本性能参数表",
    "confidence": "high"
  },
  "verdict": "解析成功"
}
```

---

**版本**：V1.1（新增图片解读）
**更新日期**：2026-06-09
