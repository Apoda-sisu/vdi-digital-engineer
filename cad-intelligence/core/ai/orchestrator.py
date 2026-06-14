"""
AI 编排器 V2.0 - 智能设计编排

主要功能：
- 需求理解与解析
- 知识检索与推理
- 方案生成与优化
- 约束验证与修复
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional, Callable

logger = logging.getLogger(__name__)


@dataclass
class DesignIntent:
    """设计意图"""
    process_type: str = ""  # 工艺类型：反应、分离、换热等
    equipment_needs: List[Dict] = field(default_factory=list)  # 设备需求
    connections: List[Dict] = field(default_factory=list)  # 连接关系
    constraints: Dict = field(default_factory=dict)  # 约束条件
    parameters: Dict = field(default_factory=dict)  # 工艺参数
    raw_requirement: str = ""  # 原始需求文本


@dataclass
class Knowledge:
    """知识"""
    equipment_knowledge: List[Dict] = field(default_factory=list)
    process_knowledge: List[Dict] = field(default_factory=list)
    standard_knowledge: List[Dict] = field(default_factory=list)
    
    def merge(self, other: 'Knowledge') -> 'Knowledge':
        """合并知识"""
        return Knowledge(
            equipment_knowledge=self.equipment_knowledge + other.equipment_knowledge,
            process_knowledge=self.process_knowledge + other.process_knowledge,
            standard_knowledge=self.standard_knowledge + other.standard_knowledge
        )


class AIOrchestrator:
    """AI 编排器"""
    
    def __init__(self, config: Dict = None):
        """
        初始化编排器
        
        Args:
            config: 配置字典
        """
        self.config = config or {}
        self._intent_parser = IntentParser()
        self._knowledge_retriever = KnowledgeRetriever()
        self._scheme_generator = SchemeGenerator()
        self._constraint_validator = None
        self._callbacks: Dict[str, List[Callable]] = {}
    
    def set_constraint_validator(self, validator):
        """设置约束验证器"""
        self._constraint_validator = validator
    
    def register_callback(self, event: str, callback: Callable):
        """注册回调函数"""
        if event not in self._callbacks:
            self._callbacks[event] = []
        self._callbacks[event].append(callback)
    
    def _emit_event(self, event: str, data: Any = None):
        """触发事件"""
        for callback in self._callbacks.get(event, []):
            try:
                callback(data)
            except Exception as e:
                logger.error(f"回调执行失败 {event}: {e}")
    
    async def process_requirement(self, requirement: str, context: Dict = None) -> Dict:
        """
        处理设计需求
        
        Args:
            requirement: 需求文本
            context: 上下文信息
            
        Returns:
            设计方案
        """
        logger.info(f"处理需求: {requirement[:50]}...")
        self._emit_event("process_start", {"requirement": requirement})
        
        try:
            # 1. 解析需求
            intent = self._intent_parser.parse(requirement, context)
            logger.info(f"解析意图: process_type={intent.process_type}")
            self._emit_event("intent_parsed", intent)
            
            # 2. 检索知识
            knowledge = self._knowledge_retriever.retrieve(intent)
            logger.info(f"检索知识: equipment={len(knowledge.equipment_knowledge)}")
            self._emit_event("knowledge_retrieved", knowledge)
            
            # 3. 生成方案
            scheme = self._scheme_generator.generate(intent, knowledge)
            logger.info(f"生成方案: {len(scheme.get('geometry', {}).get('objects', []))} 个设备")
            self._emit_event("scheme_generated", scheme)
            
            # 4. 验证约束
            if self._constraint_validator:
                validation = self._constraint_validator.validate(scheme)
                if not validation.is_valid:
                    logger.warning(f"方案验证失败: {validation.errors}")
                    scheme = await self._fix_violations(scheme, validation)
                self._emit_event("validation_complete", validation)
            
            self._emit_event("process_complete", scheme)
            return scheme
            
        except Exception as e:
            logger.error(f"处理需求失败: {e}")
            self._emit_event("process_error", {"error": str(e)})
            raise
    
    async def _fix_violations(self, scheme: Dict, validation) -> Dict:
        """修复约束违规"""
        logger.info("尝试修复约束违规...")
        
        # 简单的修复策略
        fixed_scheme = scheme.copy()
        
        # 修复缺少的字段
        if "input_type" not in fixed_scheme:
            fixed_scheme["input_type"] = "scheme"
        
        if "project_info" not in fixed_scheme:
            fixed_scheme["project_info"] = {"drawing_number": "AUTO-001"}
        
        if "output_config" not in fixed_scheme:
            fixed_scheme["output_config"] = {"drawing_type": "pfd"}
        
        return fixed_scheme
    
    def get_supported_actions(self) -> List[str]:
        """获取支持的操作"""
        return ["create", "modify", "delete", "connect", "export", "query"]
    
    def get_supported_equipment_types(self) -> List[str]:
        """获取支持的设备类型"""
        return [
            "pump", "valve", "vessel", "tank", "heat_exchanger",
            "reactor", "column", "compressor", "fan", "filter"
        ]


class IntentParser:
    """意图解析器"""
    
    # 设备类型关键词映射
    EQUIPMENT_KEYWORDS = {
        "泵": "pump",
        "pump": "pump",
        "阀": "valve",
        "valve": "valve",
        "容器": "vessel",
        "vessel": "vessel",
        "储罐": "tank",
        "tank": "tank",
        "换热器": "heat_exchanger",
        "heat exchanger": "heat_exchanger",
        "反应器": "reactor",
        "reactor": "reactor",
        "塔": "column",
        "column": "column",
        "压缩机": "compressor",
        "compressor": "compressor",
        "风机": "fan",
        "fan": "fan"
    }
    
    # 工艺类型关键词映射
    PROCESS_KEYWORDS = {
        "反应": "reaction",
        "分离": "separation",
        "换热": "heat_exchange",
        "混合": "mixing",
        "输送": "transfer",
        "储存": "storage",
        "精馏": "distillation",
        "吸收": "absorption",
        "冷凝": "condensation",
        "蒸发": "evaporation"
    }
    
    def parse(self, requirement: str, context: Dict = None) -> DesignIntent:
        """
        解析需求文本
        
        Args:
            requirement: 需求文本
            context: 上下文
            
        Returns:
            设计意图
        """
        intent = DesignIntent(raw_requirement=requirement)
        
        # 转换为小写用于匹配
        req_lower = requirement.lower()
        
        # 1. 识别工艺类型
        for keyword, process_type in self.PROCESS_KEYWORDS.items():
            if keyword in req_lower:
                intent.process_type = process_type
                break
        
        # 2. 识别设备需求
        equipment_needs = []
        for keyword, eq_type in self.EQUIPMENT_KEYWORDS.items():
            if keyword in req_lower:
                equipment_needs.append({
                    "type": eq_type,
                    "keyword": keyword
                })
        intent.equipment_needs = equipment_needs
        
        # 3. 提取参数（简单的正则匹配）
        import re
        
        # 提取流量
        flow_match = re.search(r'(\d+)\s*(m³/h|m3/h|立方米/小时)', req_lower)
        if flow_match:
            intent.parameters["flow_rate"] = float(flow_match.group(1))
        
        # 提取温度
        temp_match = re.search(r'(\d+)\s*(°c|度|℃)', req_lower)
        if temp_match:
            intent.parameters["temperature"] = float(temp_match.group(1))
        
        # 提取压力
        press_match = re.search(r'(\d+\.?\d*)\s*(mpa|兆帕)', req_lower)
        if press_match:
            intent.parameters["pressure"] = float(press_match.group(1))
        
        return intent


class KnowledgeRetriever:
    """知识检索器 — 从 KnowledgeGraph（本地）和 vdi-knowledge MCP（远程）获取知识"""

    def __init__(self):
        """初始化知识检索器"""
        from core.knowledge.knowledge_graph import get_knowledge_graph
        self._kg = get_knowledge_graph()

    def retrieve(self, intent: DesignIntent) -> Knowledge:
        """
        检索知识

        Args:
            intent: 设计意图

        Returns:
            知识
        """
        knowledge = Knowledge()

        # 1. 从本地 KnowledgeGraph 检索设备元数据
        for need in intent.equipment_needs:
            eq_type = need.get("type", "")
            eq_info = self._kg.get_equipment_info(eq_type)
            if eq_info:
                knowledge.equipment_knowledge.append({
                    "type": eq_type,
                    "symbol_id": self._kg.get_symbol_id(eq_type),
                    "default_params": self._kg.get_default_params(eq_type),
                    "typical_params": eq_info.get("typical_params", []),
                    "tag_prefix": self._kg.get_tag_prefix(eq_type),
                    "sub_types": eq_info.get("sub_types", []),
                })

        # 2. 从本地 KnowledgeGraph 检索工艺→设备映射
        if intent.process_type:
            proc_info = self._kg.get_process_info(intent.process_type)
            if proc_info:
                knowledge.process_knowledge.append({
                    "type": intent.process_type,
                    "typical_equipment": proc_info.get("typical_equipment", []),
                    "typical_instruments": proc_info.get("typical_instruments", []),
                })

        # 3. 规范知识委托 vdi-knowledge MCP（返回调用意图）
        if intent.constraints:
            for keyword in intent.constraints.get("standards", []):
                ref = self._kg.query_standard(keyword)
                knowledge.standard_knowledge.append(ref)

        return knowledge


class SchemeGenerator:
    """方案生成器 — 从 KnowledgeGraph 获取默认参数和位号前缀"""

    def __init__(self):
        from core.knowledge.knowledge_graph import get_knowledge_graph
        self._kg = get_knowledge_graph()

    def generate(self, intent: DesignIntent, knowledge: Knowledge) -> Dict:
        """
        生成方案

        Args:
            intent: 设计意图
            knowledge: 知识

        Returns:
            设计方案
        """
        objects = []
        connections = []

        for i, need in enumerate(intent.equipment_needs):
            eq_type = need.get("type", "vessel")

            # 优先从 knowledge 中获取，回退到 KnowledgeGraph
            default_params = self._get_default_params(eq_type, knowledge)

            obj = {
                "id": f"EQ-{i+1:03d}",
                "type": "equipment",
                "ai_type": eq_type,
                "label": self._generate_tag(eq_type, i),
                "position": {"x": 100 + i * 200, "y": 200},
                "parameters": default_params
            }
            objects.append(obj)

        for i in range(len(objects) - 1):
            conn = {
                "id": f"CONN-{i+1:03d}",
                "type": "pipe",
                "from": objects[i]["id"],
                "to": objects[i+1]["id"],
                "label": f"{1001+i}-A1A-H"
            }
            connections.append(conn)

        scheme = {
            "input_type": "scheme",
            "project_info": {
                "project_id": "AUTO",
                "drawing_number": "PFD-AUTO-001"
            },
            "geometry": {
                "objects": objects,
                "connections": connections
            },
            "output_config": {
                "drawing_type": "pfd",
                "format": "FCStd"
            }
        }

        if intent.parameters:
            streams = []
            for i, conn in enumerate(connections):
                stream = {
                    "stream_no": f"S-{101+i}",
                    "connection_id": conn["id"],
                    "from_tag": objects[i]["label"],
                    "to_tag": objects[i+1]["label"],
                    "flow": f"{intent.parameters.get('flow_rate', 100)} m³/h",
                    "T_C": intent.parameters.get("temperature", 80),
                    "P_MPa": intent.parameters.get("pressure", 0.6)
                }
                streams.append(stream)
            scheme["streams"] = streams

        return scheme

    def _get_default_params(self, eq_type: str, knowledge: Knowledge) -> Dict:
        """获取默认参数 — 优先从 knowledge 回退到 KnowledgeGraph"""
        # 1. 从检索到的知识中获取
        for ek in knowledge.equipment_knowledge:
            if ek.get("type") == eq_type:
                return ek.get("default_params", {})

        # 2. 从 KnowledgeGraph JSON 获取
        return self._kg.get_default_params(eq_type)

    def _generate_tag(self, eq_type: str, index: int) -> str:
        """生成设备位号 — 从 KnowledgeGraph 获取前缀"""
        prefix = self._kg.get_tag_prefix(eq_type)
        return f"{prefix}-{1001+index}"


# 便捷函数
async def process_requirement(requirement: str, config: Dict = None) -> Dict:
    """处理需求的便捷函数"""
    orchestrator = AIOrchestrator(config)
    return await orchestrator.process_requirement(requirement)
