# CAD Intelligence 2.0 开发计划

**版本**：V1.0  
**日期**：2026-06-10  
**状态**：执行中  
**负责人**：数字工程师团队

---

## 一、项目概述

### 1.1 升级目标

将 cad-intelligence 从"能画图的工具"升级为"懂设计的智能体"，实现：
- 符号库从 6 个扩展至 200+
- 引入工程知识图谱和约束验证
- 实现智能布局和自动标注
- 深度集成 VDI 系统

### 1.2 核心指标

| 指标 | 当前值 | 目标值 | 达成时间 |
|------|--------|--------|---------|
| 符号库数量 | 6 | 200+ | 2026-Q4 |
| 测试覆盖率 | 30% | 85% | 2026-Q3 |
| AI 理解准确率 | 60% | 90% | 2026-Q4 |
| 图纸生成时间 | 10s | 3s | 2026-Q4 |
| 合规验证通过率 | 70% | 95% | 2026-Q4 |

---

## 二、阶段规划

### Phase 1：基础强化（2026-06-10 → 2026-07-31）

**目标**：补齐短板，夯实基础

#### Sprint 1.1：符号库扩展（Week 1-2）

| 任务 | 优先级 | 预计工时 | 状态 |
|------|--------|---------|------|
| 创建符号库目录结构 | P0 | 2h | 待开始 |
| 添加泵类符号（5种） | P0 | 4h | 待开始 |
| 添加阀类符号（8种） | P0 | 6h | 待开始 |
| 添加容器类符号（5种） | P0 | 4h | 待开始 |
| 添加换热器符号（4种） | P0 | 4h | 待开始 |
| 添加塔器符号（3种） | P0 | 3h | 待开始 |
| 添加压缩机/风机符号（3种） | P0 | 3h | 待开始 |
| 添加仪表符号（10种） | P0 | 6h | 待开始 |
| 添加管道配件符号（10种） | P1 | 6h | 待开始 |
| 符号库单元测试 | P0 | 4h | 待开始 |

#### Sprint 1.2：技术债务清理（Week 2-3）

| 任务 | 优先级 | 预计工时 | 状态 |
|------|--------|---------|------|
| 删除旧版 drawing_engine.py | P0 | 1h | 待开始 |
| 统一版本号为 2.0.0 | P0 | 0.5h | 待开始 |
| 清理 recognition 配置段 | P1 | 0.5h | 待开始 |
| 移除 opencv-python 依赖 | P1 | 0.5h | 待开始 |
| 修复 bare except 问题 | P1 | 2h | 待开始 |
| 代码格式化（black） | P2 | 1h | 待开始 |
| 类型注解完善（mypy） | P2 | 3h | 待开始 |

#### Sprint 1.3：测试完善（Week 3-4）

| 任务 | 优先级 | 预计工时 | 状态 |
|------|--------|---------|------|
| AI 引擎单元测试 | P0 | 4h | 待开始 |
| 导出引擎单元测试 | P0 | 3h | 待开始 |
| 绘图引擎单元测试 | P0 | 6h | 待开始 |
| 集成测试框架搭建 | P1 | 4h | 待开始 |
| E2E 测试用例编写 | P1 | 6h | 待开始 |
| CI/CD 配置 | P2 | 3h | 待开始 |

#### Sprint 1.4：文档完善（Week 4）

| 任务 | 优先级 | 预计工时 | 状态 |
|------|--------|---------|------|
| API 文档生成 | P1 | 3h | 待开始 |
| 使用示例更新 | P1 | 2h | 待开始 |
| README 更新 | P2 | 1h | 待开始 |
| CHANGELOG 创建 | P2 | 1h | 待开始 |

---

### Phase 2：智能化升级（2026-08-01 → 2026-09-30）

**目标**：引入 AI 能力，实现智能设计

#### Sprint 2.1：知识图谱基础（Week 5-6）

| 任务 | 优先级 | 预计工时 | 状态 |
|------|--------|---------|------|
| 知识图谱数据模型设计 | P0 | 4h | 待开始 |
| 设备知识库构建 | P0 | 8h | 待开始 |
| 工艺流程知识库构建 | P0 | 6h | 待开始 |
| 标准规范知识库构建 | P0 | 6h | 待开始 |
| 知识查询接口开发 | P1 | 4h | 待开始 |
| 知识图谱单元测试 | P1 | 3h | 待开始 |

#### Sprint 2.2：约束验证引擎（Week 6-7）

| 任务 | 优先级 | 预计工时 | 状态 |
|------|--------|---------|------|
| 约束规则定义语言 | P0 | 4h | 待开始 |
| PFD 约束验证器 | P0 | 6h | 待开始 |
| P&ID 约束验证器 | P0 | 6h | 待开始 |
| 设备选型验证器 | P1 | 4h | 待开始 |
| 管道参数验证器 | P1 | 4h | 待开始 |
| 验证报告生成器 | P1 | 3h | 待开始 |

#### Sprint 2.3：智能布局算法（Week 7-8）

| 任务 | 优先级 | 预计工时 | 状态 |
|------|--------|---------|------|
| 流程拓扑分析器 | P0 | 6h | 待开始 |
| 分层布局算法 | P0 | 8h | 待开始 |
| 力导向布局优化 | P1 | 6h | 待开始 |
| 碰撞检测与解决 | P1 | 4h | 待开始 |
| 自动对齐与间距 | P1 | 3h | 待开始 |
| 布局可视化预览 | P2 | 4h | 待开始 |

#### Sprint 2.4：AI 编排器升级（Week 8-10）

| 任务 | 优先级 | 预计工时 | 状态 |
|------|--------|---------|------|
| 需求理解器重构 | P0 | 6h | 待开始 |
| 方案生成器重构 | P0 | 8h | 待开始 |
| 多步推理支持 | P1 | 6h | 待开始 |
| 上下文管理优化 | P1 | 4h | 待开始 |
| 错误恢复机制 | P1 | 3h | 待开始 |
| 流式输出优化 | P2 | 3h | 待开始 |

---

### Phase 3：高级能力（2026-10-01 → 2026-12-31）

**目标**：实现图纸理解、迭代优化、协同设计

#### Sprint 3.1：图纸理解能力（Week 11-13）

| 任务 | 优先级 | 预计工时 | 状态 |
|------|--------|---------|------|
| OCR 文字识别集成 | P0 | 6h | 待开始 |
| 符号检测模型训练 | P0 | 16h | 待开始 |
| 管线追踪算法 | P0 | 8h | 待开始 |
| 语义理解引擎 | P1 | 8h | 待开始 |
| 图纸→Scheme 转换 | P1 | 6h | 待开始 |
| 理解结果验证器 | P1 | 4h | 待开始 |

#### Sprint 3.2：迭代优化能力（Week 13-15）

| 任务 | 优先级 | 预计工时 | 状态 |
|------|--------|---------|------|
| 设计评估器 | P0 | 6h | 待开始 |
| 改进点识别器 | P0 | 6h | 待开始 |
| 方案变异器 | P1 | 6h | 待开始 |
| 收敛判断器 | P1 | 3h | 待开始 |
| 优化历史记录 | P2 | 3h | 待开始 |
| 优化可视化 | P2 | 4h | 待开始 |

#### Sprint 3.3：DEXPI 标准支持（Week 15-17）

| 任务 | 优先级 | 预计工时 | 状态 |
|------|--------|---------|------|
| DEXPI Schema 解析 | P0 | 4h | 待开始 |
| 设备类型映射 | P0 | 6h | 待开始 |
| 连接关系映射 | P0 | 4h | 待开始 |
| DEXPI XML 生成器 | P1 | 6h | 待开始 |
| DEXPI 验证器 | P1 | 4h | 待开始 |
| DEXPI 导入器 | P2 | 6h | 待开始 |

#### Sprint 3.4：多 CAD 后端支持（Week 17-20）

| 任务 | 优先级 | 预计工时 | 状态 |
|------|--------|---------|------|
| CAD 后端抽象接口 | P0 | 4h | 待开始 |
| FreeCAD 适配器重构 | P0 | 6h | 待开始 |
| OpenCASCADE 适配器 | P1 | 12h | 待开始 |
| WebGL 预览后端 | P2 | 8h | 待开始 |
| 后端切换管理器 | P1 | 4h | 待开始 |
| 性能基准测试 | P2 | 4h | 待开始 |

---

### Phase 4：生态集成（2026-Q4 持续）

**目标**：深度集成 VDI 系统，构建完整生态

#### Sprint 4.1：MCP 服务器完善（持续）

| 任务 | 优先级 | 预计工时 | 状态 |
|------|--------|---------|------|
| MCP 工具注册 | P0 | 4h | 待开始 |
| 参数 Schema 定义 | P0 | 3h | 待开始 |
| 错误处理完善 | P1 | 3h | 待开始 |
| 流式响应支持 | P1 | 4h | 待开始 |
| 文档自动生成 | P2 | 2h | 待开始 |

#### Sprint 4.2：VDI 事件集成（持续）

| 任务 | 优先级 | 预计工时 | 状态 |
|------|--------|---------|------|
| 事件订阅机制 | P0 | 4h | 待开始 |
| design_basis.updated 处理 | P0 | 4h | 待开始 |
| equipment.selected 处理 | P1 | 3h | 待开始 |
| drawing.generated 发布 | P1 | 3h | 待开始 |
| 事件追踪日志 | P2 | 2h | 待开始 |

#### Sprint 4.3：Skill 集成优化（持续）

| 任务 | 优先级 | 预计工时 | 状态 |
|------|--------|---------|------|
| SKILL.md 更新 | P0 | 2h | 待开始 |
| 触发词扩展 | P1 | 2h | 待开始 |
| 能力声明完善 | P1 | 2h | 待开始 |
| 依赖关系配置 | P2 | 1h | 待开始 |

---

## 三、技术架构

### 3.1 目录结构

```
cad-intelligence/
├── __init__.py                    # 版本 2.0.0
├── __main__.py                    # 模块入口
├── cli.py                         # CLI 接口
├── config.json                    # 配置文件
│
├── core/                          # 核心引擎
│   ├── __init__.py
│   ├── ai/                        # AI 子系统（新增）
│   │   ├── __init__.py
│   │   ├── orchestrator.py        # 编排器
│   │   ├── requirement_parser.py  # 需求理解器
│   │   ├── scheme_generator.py    # 方案生成器
│   │   └── constraint_validator.py# 约束验证器
│   ├── knowledge/                 # 知识子系统（新增）
│   │   ├── __init__.py
│   │   ├── knowledge_graph.py     # 工程知识图谱
│   │   ├── rule_engine.py         # 规则引擎
│   │   └── standard_db.py         # 标准数据库
│   ├── drawing/                   # 绘图子系统（重构）
│   │   ├── __init__.py
│   │   ├── pipeline.py            # 绘图管线
│   │   ├── engines/               # 各图纸引擎
│   │   │   ├── __init__.py
│   │   │   ├── pfd_engine.py      # PFD 引擎
│   │   │   ├── pid_engine.py      # P&ID 引擎
│   │   │   ├── layout_engine.py   # 布置图引擎
│   │   │   ├── isometric_engine.py# 等轴测引擎
│   │   │   └── model3d_engine.py  # 3D 引擎
│   │   ├── layout/                # 智能布局
│   │   │   ├── __init__.py
│   │   │   ├── auto_layout.py     # 自动布局
│   │   │   ├── collision.py       # 碰撞检测
│   │   │   └── alignment.py       # 对齐算法
│   │   └── annotation/            # 智能标注
│   │       ├── __init__.py
│   │       └── auto_annotation.py # 自动标注
│   ├── symbols/                   # 符号子系统（增强）
│   │   ├── __init__.py
│   │   ├── symbol_manager.py      # 符号管理器
│   │   ├── symbol_registry.py     # 符号注册表
│   │   └── libraries/             # 符号库
│   │       ├── equipment/         # 设备符号
│   │       ├── instruments/       # 仪表符号
│   │       ├── piping/            # 管道符号
│   │       └── annotations/       # 标注符号
│   └── export/                    # 导出子系统（增强）
│       ├── __init__.py
│       ├── export_manager.py      # 导出管理器
│       └── formats/               # 各格式导出器
│           ├── __init__.py
│           ├── fcstd_exporter.py
│           ├── step_exporter.py
│           ├── dxf_exporter.py
│           ├── pdf_exporter.py
│           └── dexpi_exporter.py  # DEXPI 导出
│
├── adapters/                      # 适配器层（新增）
│   ├── __init__.py
│   ├── freecad_adapter.py         # FreeCAD 适配器
│   ├── mcp_adapter.py             # MCP 协议适配器
│   └── vdi_adapter.py             # VDI 系统适配器
│
├── schemas/                       # Schema 定义
│   ├── scheme-v2.schema.json      # Scheme v2
│   └── dexpi/                     # DEXPI 标准
│
├── parsers/                       # 输入解析器
│   ├── __init__.py
│   ├── json_parser.py
│   └── dexpi_parser.py            # DEXPI 解析
│
├── templates/                     # 图纸模板
├── scripts/                       # 脚本
├── tests/                         # 测试
│   ├── __init__.py
│   ├── unit/                      # 单元测试
│   ├── integration/               # 集成测试
│   └── e2e/                       # 端到端测试
│
├── docs/                          # 文档
│   ├── api/                       # API 文档
│   └── examples/                  # 示例
│
├── requirements.txt               # 依赖
├── setup.py                       # 安装配置
├── pyproject.toml                 # 项目配置
├── README.md                      # 说明文档
├── CHANGELOG.md                   # 变更日志
└── DEVELOPMENT_PLAN.md            # 本文件
```

### 3.2 核心模块设计

#### 3.2.1 AI 编排器

```python
# core/ai/orchestrator.py
class AIOrchestrator:
    """AI 编排器 2.0"""
    
    def __init__(self, config: Dict):
        self.llm = self._init_llm(config)
        self.requirement_parser = RequirementParser(self.llm)
        self.scheme_generator = SchemeGenerator(self.llm)
        self.constraint_validator = ConstraintValidator()
        self.knowledge_graph = KnowledgeGraph()
    
    async def process(self, input_data: Dict) -> Dict:
        """处理输入，返回方案"""
        # 1. 解析需求
        intent = await self.requirement_parser.parse(input_data)
        
        # 2. 检索知识
        knowledge = self.knowledge_graph.query(intent)
        
        # 3. 生成方案
        scheme = await self.scheme_generator.generate(intent, knowledge)
        
        # 4. 验证约束
        validation = self.constraint_validator.validate(scheme)
        if not validation.is_valid:
            scheme = await self._fix_violations(scheme, validation)
        
        return scheme
```

#### 3.2.2 知识图谱

```python
# core/knowledge/knowledge_graph.py
class KnowledgeGraph:
    """工程知识图谱"""
    
    def __init__(self):
        self.equipment_kb = EquipmentKnowledgeBase()
        self.process_kb = ProcessKnowledgeBase()
        self.standard_kb = StandardKnowledgeBase()
    
    def query(self, intent: Intent) -> Knowledge:
        """查询相关知识"""
        results = []
        
        # 查询设备知识
        if intent.equipment_type:
            results.extend(self.equipment_kb.query(intent.equipment_type))
        
        # 查询工艺知识
        if intent.process_type:
            results.extend(self.process_kb.query(intent.process_type))
        
        # 查询标准知识
        if intent.standards:
            results.extend(self.standard_kb.query(intent.standards))
        
        return Knowledge.merge(results)
```

#### 3.2.3 约束验证器

```python
# core/ai/constraint_validator.py
class ConstraintValidator:
    """约束验证器"""
    
    def __init__(self):
        self.rules = RuleEngine()
    
    def validate(self, scheme: Dict) -> ValidationResult:
        """验证方案"""
        errors = []
        warnings = []
        
        # 1. 结构完整性验证
        structural = self._validate_structure(scheme)
        errors.extend(structural.errors)
        
        # 2. 连接一致性验证
        connection = self._validate_connections(scheme)
        errors.extend(connection.errors)
        
        # 3. 参数合理性验证
        parameter = self._validate_parameters(scheme)
        warnings.extend(parameter.warnings)
        
        # 4. 标准合规性验证
        compliance = self._validate_compliance(scheme)
        errors.extend(compliance.errors)
        
        return ValidationResult(errors=errors, warnings=warnings)
```

---

## 四、开发规范

### 4.1 代码规范

- **语言**：Python 3.10+
- **格式化**：Black（行宽 88）
- **类型检查**：mypy（strict 模式）
- **导入排序**：isort
- **文档字符串**：Google 风格

### 4.2 测试规范

- **框架**：pytest
- **覆盖率**：目标 85%
- **命名**：`test_<module>_<function>.py`
- **组织**：unit / integration / e2e

### 4.3 提交规范

```
<type>(<scope>): <subject>

<body>

<footer>
```

类型：
- `feat`: 新功能
- `fix`: 修复
- `docs`: 文档
- `style`: 格式
- `refactor`: 重构
- `test`: 测试
- `chore`: 构建/工具

### 4.4 分支策略

- `main`: 稳定版本
- `develop`: 开发分支
- `feature/*`: 功能分支
- `hotfix/*`: 紧急修复

---

## 五、风险管控

### 5.1 技术风险

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|---------|
| FreeCAD API 变更 | 中 | 高 | 抽象层隔离，版本锁定 |
| LLM 幻觉问题 | 高 | 高 | 约束验证 + 人工审核 |
| 知识图谱数据质量 | 中 | 中 | 数据清洗 + 人工标注 |
| 性能瓶颈 | 低 | 中 | 缓存 + 异步 + 增量计算 |

### 5.2 进度风险

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|---------|
| 需求变更 | 中 | 中 | 预留 20% 缓冲时间 |
| 技术难点 | 中 | 高 | 提前原型验证 |
| 人员变动 | 低 | 高 | 知识文档化 |

---

## 六、里程碑

| 里程碑 | 日期 | 交付物 | 验收标准 |
|--------|------|--------|---------|
| M1.1 | 2026-06-24 | 符号库 50+ | 符号数量达标，测试通过 |
| M1.2 | 2026-07-08 | 技术债务清理 | 代码质量检查通过 |
| M1.3 | 2026-07-22 | 测试覆盖 80% | 覆盖率报告 |
| M1.4 | 2026-07-31 | Phase 1 完成 | 所有 P0 任务完成 |
| M2.1 | 2026-08-15 | 知识图谱 MVP | 知识查询可用 |
| M2.2 | 2026-08-31 | 约束验证器 | 验证准确率 90% |
| M2.3 | 2026-09-15 | 智能布局 | 自动布局可用 |
| M2.4 | 2026-09-30 | Phase 2 完成 | AI 能力可用 |
| M3.1 | 2026-10-31 | 图纸理解 | 理解准确率 80% |
| M3.2 | 2026-11-30 | 迭代优化 | 优化效果明显 |
| M3.3 | 2026-12-15 | DEXPI 支持 | 导入导出可用 |
| M3.4 | 2026-12-31 | Phase 3 完成 | 所有高级能力可用 |

---

## 七、资源需求

### 7.1 人力

| 角色 | 人数 | 职责 |
|------|------|------|
| 架构师 | 1 | 整体设计、技术选型 |
| Python 工程师 | 2 | 核心引擎开发 |
| AI 工程师 | 1 | 知识图谱、LLM 集成 |
| CAD 专家 | 1 | 符号库、标准库 |
| 测试工程师 | 1 | 测试框架、质量保障 |

### 7.2 环境

| 环境 | 用途 | 配置 |
|------|------|------|
| 开发环境 | 日常开发 | macOS / Linux |
| 测试环境 | 集成测试 | Docker Compose |
| CI 环境 | 持续集成 | GitHub Actions |

---

## 八、附录

### 8.1 参考资源

- [FreeCAD API 文档](https://wiki.freecad.org/FreeCAD_scripting_for_beginners)
- [DEXPI 标准](https://dexpi.org/)
- [ISA 5.1 标准](https://www.isa.org/)
- [OpenCASCADE 文档](https://dev.opencascade.org/)

### 8.2 相关文档

- `1002_项目规划书-智慧设计蜂群.md`
- `1003_项目整体建设进度跟踪计划书.md`
- `1004_跨专业提资事件链设计.md`

---

**文档历史**

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|---------|
| V1.0 | 2026-06-10 | 数字工程师团队 | 初始版本 |
