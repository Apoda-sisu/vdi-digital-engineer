# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-06-10

### Added
- 符号管理器（SymbolManager）：支持符号加载、缓存、查询
- 约束验证器（ConstraintValidator）：支持结构、连接、参数、标准验证
- 知识图谱（KnowledgeGraph）：设备知识、工艺知识、标准知识
- AI 编排器（AIOrchestrator）：需求理解、知识检索、方案生成
- 符号库扩展至 47+ 符号：
  - 泵类：离心泵、齿轮泵、隔膜泵、螺杆泵、潜水泵
  - 阀类：闸阀、截止阀、球阀、蝶阀、止回阀、安全阀、旋塞阀、针阀
  - 容器：立式容器、卧式容器、常压储罐、反应器、分离器
  - 换热器：板式换热器、空冷器、冷凝器、再沸器
  - 塔器：精馏塔、吸收塔
  - 旋转设备：压缩机、风机、鼓风机
  - 仪表：温度（TI/TIC/TT）、压力（PI/PIC）、流量（FI/FIC）、液位（LI/LIC）、分析（pHI/CI）
  - 管道配件：弯头（90°/45°）、三通、异径管、管帽、法兰
- 单元测试 56 个，全部通过
- 开发计划文档（DEVELOPMENT_PLAN.md）
- 变更日志（CHANGELOG.md）

### Changed
- 版本号升级至 2.0.0
- 配置文件更新：移除过时的 recognition 配置，添加 knowledge/constraints/layout 配置
- 依赖更新：移除 opencv-python，添加 openai/httpx
- CLI 版本号更新至 2.0.0

### Fixed
- 修复版本号不一致问题（统一为 2.0.0）

### Removed
- 移除草图识别相关配置（功能已在 v1.3 移除）

## [1.3.0] - 2026-06-09

### Added
- 设备布置图引擎（drawing_layout.py）
- 等轴测图引擎（drawing_isometric.py）
- P&ID 引擎增强（drawing_pid.py）

### Changed
- 移除草图识别功能

## [1.2.0] - 2026-06-01

### Added
- 2D PFD 引擎（drawing2d.py）
- 3D 参数化设备建模引擎（equipment3d.py）
- 导出引擎（export_engine.py）
- TechDraw 集成
- GB A3 图框模板

## [1.1.0] - 2026-05-15

### Added
- AI 自然语言引擎（ai_engine.py）
- Chat 编排器（chat_engine.py）
- FreeCAD 工作台集成

## [1.0.0] - 2026-05-01

### Added
- 初始版本
- 基础框架
- JSON 解析器
- 几何建模引擎
