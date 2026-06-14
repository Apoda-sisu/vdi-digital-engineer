# CAD Intelligence 2.0 - 智能绘图模块

> ⚠️ **已弃用（Deprecated）** — 本模块不再维护。VDI 原生 CAD 能力已迁移至 `pilotdeck-vdi`：
>
> - **MCP 服务**：`pilotdeck-vdi/mcp/vdi-cad/`
> - **FreeCAD 插件**：`pilotdeck-vdi/freecad/vdi_cad_addon/`
> - **部署脚本**：`pilotdeck-vdi/freecad/deploy.sh`
> - **数据契约**：Skill `DisciplineOutput` → `CadCommand v1` → FreeCAD RPC
>
> 本目录仅保留作符号几何参数参考资料，请勿在新功能中引用。
>
> **FreeCAD 工作台**：若本机仍有「AI 智能绘图」，请执行卸载：
> `bash pilotdeck-vdi/freecad/uninstall-cadintelligence.sh`
> 安装新模块：`bash pilotdeck-vdi/freecad/install.sh`

---

> 基于FreeCAD的智能绘图模块，根据设计方案（JSON / 自然语言）自动生成 2D 工程图和 3D 模型。

## 模块定位

`cad-intelligence` 是智慧设计蜂群项目中的 **CAD 智能体模块**，专注于：

1. **二维工程图生成**：PFD、P&ID、设备布置图、等轴测图
2. **三维模型生成**：参数化工艺设备建模（泵/阀门/容器/换热器/反应器/塔/压缩机/风机）
3. **智能设计**：AI 自然语言绘图、智能布局、约束验证
4. **知识驱动**：工程知识图谱、标准规范库

## 核心特性（V2.0 新增）

### 智能化能力
- **AI 编排器**：需求理解 → 知识检索 → 方案生成 → 约束验证
- **知识图谱**：设备知识、工艺知识、标准规范
- **约束验证**：结构完整性、连接一致性、参数合理性、标准合规性

### 符号库（47+ 符号）
- **设备符号**：泵（5种）、阀（8种）、容器（5种）、换热器（4种）、塔器（2种）、旋转设备（3种）
- **仪表符号**：温度（3种）、压力（2种）、流量（2种）、液位（2种）、分析（2种）
- **管道配件**：弯头（2种）、三通、异径管、管帽、法兰（2种）

### 支持标准
- GB/T 2625-1981（过程检测和控制流程图用图形符号）
- HG/T 20559.2-1993（管道仪表流程图设备图形符号）
- ISA 5.1（过程测量和控制仪表符号）
- GB/T 12459（钢制对焊管件）
- GB/T 9115（对焊法兰）

## 目录结构

```
cad-intelligence/
├── README.md                    # 本文件
├── DEVELOPMENT_PLAN.md          # 开发计划
├── SKILL.md                     # 技能定义
├── config.json                  # 模块配置（V2.0）
├── cli.py                       # 命令行接口
│
├── core/                        # 核心引擎
│   ├── ai/                      # AI 子系统（新增）
│   │   ├── orchestrator.py      # AI 编排器
│   │   └── __init__.py
│   ├── knowledge/               # 知识子系统（新增）
│   │   ├── knowledge_graph.py   # 工程知识图谱
│   │   └── __init__.py
│   ├── symbol_manager.py        # 符号管理器（新增）
│   ├── constraint_validator.py  # 约束验证器（新增）
│   ├── drawing_pipeline.py      # 统一绘图管线
│   ├── drawing2d.py             # 2D PFD 引擎
│   ├── drawing_pid.py           # 2D P&ID 引擎
│   ├── drawing_layout.py        # 设备布置图引擎
│   ├── drawing_isometric.py     # 等轴测图引擎
│   ├── equipment3d.py           # 参数化 3D 设备建模引擎
│   ├── geometry_engine.py       # 几何建模引擎
│   ├── ai_engine.py             # AI 自然语言引擎
│   ├── chat_engine.py           # AI plan -> scheme 编排
│   └── export_engine.py         # 导出引擎
│
├── symbols/                     # 国家标准符号库（47+ 符号）
│   ├── index.json               # 符号索引
│   ├── equipment/               # 设备符号
│   │   ├── pumps/               # 泵类（5种）
│   │   ├── valves/              # 阀类（8种）
│   │   ├── vessels/             # 容器类（5种）
│   │   ├── heat_exchangers/     # 换热器（4种）
│   │   ├── columns/             # 塔器（2种）
│   │   └── rotating/            # 旋转设备（3种）
│   ├── instruments/             # 仪表符号
│   │   ├── temperature/         # 温度仪表（3种）
│   │   ├── pressure/            # 压力仪表（2种）
│   │   ├── flow/                # 流量仪表（2种）
│   │   ├── level/               # 液位仪表（2种）
│   │   └── analytical/          # 分析仪表（2种）
│   └── piping/                  # 管道配件
│       ├── fittings/            # 管件（5种）
│       └── flanges/             # 法兰（2种）
│
├── tests/                       # 测试（56 个测试用例）
│   ├── test_symbol_manager.py   # 符号管理器测试
│   ├── test_constraint_validator.py # 约束验证器测试
│   ├── test_knowledge_graph.py  # 知识图谱测试
│   ├── test_geometry_engine.py  # 几何引擎测试
│   └── test_scheme_schema.py    # 方案校验测试
│
└── docs/                        # 文档
```

## 快速开始

### 环境要求

- Python 3.10+
- FreeCAD 1.1.1+

### 安装

```bash
cd cad-intelligence
pip install -r requirements.txt
```

### 使用方式

#### 1. 从 JSON 生成

```bash
# 2D PFD
freecadcmd cli.py generate --input examples/input/example_pfd.json --output output/ --mode pfd

# 3D 模型
freecadcmd cli.py generate --input examples/input/example_pfd.json --output output/ --mode 3d
```

#### 2. 使用符号管理器

```python
from core.symbol_manager import get_symbol_manager

manager = get_symbol_manager()
print(f"符号总数: {manager.get_symbol_count()}")

# 搜索符号
pumps = manager.search_symbols("泵")
for symbol in pumps:
    print(f"  - {symbol['symbol_id']}: {symbol['name']}")
```

#### 3. 使用约束验证器

```python
from core.constraint_validator import validate_scheme

scheme = {
    "input_type": "scheme",
    "project_info": {"drawing_number": "PFD-001"},
    "geometry": {
        "objects": [...],
        "connections": [...]
    },
    "output_config": {"drawing_type": "pfd"}
}

result = validate_scheme(scheme)
if result.is_valid:
    print("验证通过")
else:
    print(f"验证失败: {result.errors}")
```

#### 4. 使用知识图谱

```python
from core.knowledge.knowledge_graph import get_knowledge_graph

kg = get_knowledge_graph()
print(f"知识实体数: {kg.get_entity_count()}")

# 查询设备类型
pump_info = kg.query_equipment_type("pump")
print(f"泵类型: {pump_info['name']}")
print(f"典型参数: {pump_info['properties']['typical_params']}")
```

#### 5. 运行测试

```bash
python -m pytest tests/ -v
```

## 技术栈

| 组件 | 技术 | 用途 |
|------|------|------|
| CAD内核 | FreeCAD 1.1.1 + OpenCASCADE | 几何建模 |
| 2D 图纸 | TechDraw | 图纸页/图框/PDF/DXF |
| 脚本语言 | Python 3.10+ | 模块开发 |
| AI | Ollama / OpenAI 兼容 API | 自然语言绘图 |
| 知识图谱 | 内置知识库 | 设备/工艺/标准知识 |
| CLI工具 | Click | 命令行接口 |
| 测试 | pytest | 单元测试/集成测试 |

## 相关标准

- **GB/T 2625-1981** 过程检测和控制流程图用图形符号和文字代号
- **HG/T 20559.2-1993** 管道仪表流程图设备图形符号
- **ISA 5.1** 过程测量和控制仪表符号
- **GB/T 12459** 钢制对焊管件
- **GB/T 9115** 对焊法兰
- **GB/T 50106-2010** 建筑制图标准

## 开发计划

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 1 | 基础强化（符号库、技术债务、测试） | ✅ 已完成 |
| Phase 2 | 智能化升级（知识图谱、约束验证、智能布局） | 🔄 进行中 |
| Phase 3 | 高级能力（图纸理解、迭代优化、DEXPI） | 📋 规划中 |
| Phase 4 | 生态集成（MCP、VDI事件、Skill） | 📋 规划中 |

## 许可证

本模块采用 Apache License 2.0 开源协议。

---

**版本**：V2.0.0  
**更新日期**：2026-06-10
