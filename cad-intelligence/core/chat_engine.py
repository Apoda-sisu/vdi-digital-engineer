"""
AI 对话绘图编排器 — SKILL+CLI 方案

流程: 自然语言 -> AI(JSON plan) -> scheme JSON -> CLI/Executor -> FreeCAD
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from core.ai_engine import AIEngine

# AI 设备类型 -> 符号库 ID
TYPE_TO_SYMBOL = {
    "pump": "PUMP-CENTRIFUGAL-001",
    "valve": "VALVE-GATE-001",
    "vessel": "VESSEL-TANK-001",
    "tank": "VESSEL-TANK-001",
    "heat_exchanger": "HEAT-EXCHANGER-001",
    "exchanger": "HEAT-EXCHANGER-001",
    "reactor": "VESSEL-TANK-001",
    "column": "VESSEL-TANK-001",
    "instrument": "IND-TEMP-001",
    "temperature": "IND-TEMP-001",
}


def ai_plan_to_scheme(
    ai_result: Dict[str, Any],
    seq: int = 1,
    mode: str = "3d",
) -> Dict[str, Any]:
    """将 AI 返回的 plan 转为标准 scheme JSON（与 CLI generate 兼容）

    mode: "3d" -> 参数化三维设备; "pfd" -> 2D 工艺流程图; "pid" -> P&ID
    """
    objects = []
    tag_to_id = {}

    for i, obj in enumerate(ai_result.get("objects", [])):
        obj_type = obj.get("type", "equipment")
        tag = obj.get("tag") or obj.get("name") or f"EQ-{i+1:03d}"
        obj_id = f"EQ-{i+1:03d}"
        tag_to_id[tag] = obj_id

        params = obj.get("parameters") or {}
        pos = params.get("position", [0, 0, 0])
        if isinstance(pos, list) and len(pos) >= 2:
            position = {"x": float(pos[0]), "y": float(pos[1])}
            if len(pos) >= 3:
                position["z"] = float(pos[2])
        elif isinstance(pos, dict):
            position = pos
        else:
            position = {"x": 100 + i * 80, "y": 200}

        rotation = params.get("rotation", 0)
        if isinstance(rotation, list):
            rotation = float(rotation[2]) if len(rotation) >= 3 else 0

        symbol_id = TYPE_TO_SYMBOL.get(obj_type, "PUMP-CENTRIFUGAL-001")

        objects.append({
            "id": obj_id,
            "type": "equipment",
            "symbol_id": symbol_id,
            "position": position,
            "rotation": rotation,
            "scale": 1,
            "label": tag,
            "parameters": params,
            "ai_type": obj_type,
        })

    connections = []
    streams = []
    for j, conn in enumerate(ai_result.get("connections", [])):
        from_tag = conn.get("from", "")
        to_tag = conn.get("to", "")
        from_id = tag_to_id.get(from_tag)
        to_id = tag_to_id.get(to_tag)
        if not from_id or not to_id:
            continue
        conn_id = f"CONN-{j+1:03d}"
        stream_no = conn.get("stream_no") or f"S-{101 + j}"
        line_no = conn.get("label") or f"{from_tag}-{to_tag}"
        diameter = conn.get("pipe_diameter") or conn.get("diameter") or "DN50"
        medium = conn.get("medium") or ""
        flow = conn.get("flow") or ""
        connections.append({
            "id": conn_id,
            "type": "pipe",
            "from": from_id,
            "to": to_id,
            "label": line_no,
            "stream_no": stream_no if mode != "3d" else "",
            "parameters": {
                "diameter": diameter,
                "medium": medium,
                "flow": flow,
            },
        })
        if mode == "pid" and conn.get("valve"):
            connections[-1]["valve"] = conn.get("valve")
        if mode == "pid" and conn.get("valves"):
            connections[-1]["valves"] = conn.get("valves")
        streams.append({
            "stream_no": stream_no,
            "connection_id": conn_id,
            "from_tag": from_tag,
            "to_tag": to_tag,
            "flow": flow,
            "phase": conn.get("phase") or "",
            "T_C": conn.get("T_C"),
            "P_MPa": conn.get("P_MPa"),
            "medium": medium,
        })

    for s in ai_result.get("streams", []) or []:
        sn = s.get("stream_no")
        if not sn:
            continue
        if any(x.get("stream_no") == sn for x in streams):
            continue
        streams.append({
            "stream_no": sn,
            "connection_id": s.get("connection_id"),
            "from_tag": s.get("from") or s.get("from_tag", ""),
            "to_tag": s.get("to") or s.get("to_tag", ""),
            "flow": s.get("flow", ""),
            "phase": s.get("phase", ""),
            "T_C": s.get("T_C"),
            "P_MPa": s.get("P_MPa"),
            "medium": s.get("medium", ""),
        })

    annotations = []
    for ann in ai_result.get("annotations", []) or []:
        if isinstance(ann, dict) and ann.get("text"):
            annotations.append({
                "target": ann.get("target", ""),
                "text": ann.get("text", ""),
            })

    instruments_geom = []
    if mode == "pid":
        for k, inst in enumerate(ai_result.get("instruments", []) or []):
            if not isinstance(inst, dict):
                continue
            instruments_geom.append({
                "tag": inst.get("tag") or f"I-{k+1:03d}",
                "type": inst.get("type") or inst.get("function") or "TI",
                "loop": inst.get("loop") or "",
                "on_line": inst.get("on_line") or inst.get("line_no") or "",
                "on_equipment": inst.get("on_equipment") or inst.get("equipment") or "",
                "range": inst.get("range") or "",
                "signal": inst.get("signal") or "",
                "location": inst.get("location") or inst.get("on_line") or inst.get("on_equipment") or "",
            })

    scheme = {
        "input_type": "scheme",
        "project_info": {
            "project_id": "CHAT",
            "project_name": "AI对话生成",
            "drawing_number": f"CHAT-{seq:04d}",
            "drawing_title": (
                "管道及仪表流程图 P&ID" if mode == "pid"
                else "工艺流程图 PFD" if mode == "pfd"
                else "设备布置平面图" if mode == "layout"
                else "管道单线图" if mode == "isometric"
                else "三维布置"
            ),
            "revision": "A",
            "description": ai_result.get("response", ""),
        },
        "streams": streams if mode in ("pfd", "pid") else [],
        "geometry": {
            "objects": objects,
            "connections": connections,
            "instruments": instruments_geom,
        },
        "annotations": {"labels": annotations},
        "output_config": {
            "drawing_type": mode if mode in ("pfd", "pid", "layout", "isometric") else "3d",
        },
    }
    if mode in ("pfd", "pid", "layout", "isometric"):
        from core.scheme_schema import enrich_scheme
        scheme = enrich_scheme(scheme)
    return scheme


class ChatOrchestrator:
    """编排 AI 对话与 CLI/Executor 执行"""

    def __init__(
        self,
        ai_engine: AIEngine,
        on_status: Optional[Callable[[str], None]] = None,
        work_dir: Optional[str] = None,
    ):
        self.ai_engine = ai_engine
        self.on_status = on_status or (lambda msg: None)
        self.work_dir = work_dir or tempfile.mkdtemp(prefix="cad_intel_chat_")
        self.seq = 0
        self.cli_path = str(Path(__file__).parent.parent / "cli.py")

    def _status(self, msg: str):
        self.on_status(msg)

    def parse_only(self, user_input: str, context: Optional[Dict] = None) -> Dict[str, Any]:
        """仅调用 AI，返回 plan（可在后台线程调用）"""
        self._status("正在调用 AI 模型...")
        result = self.ai_engine.chat(user_input, context)
        if result.get("action") == "error":
            return {"success": False, "plan": result, "error": result.get("response", "AI 错误")}
        return {"success": True, "plan": result}

    def parse_only_stream(
        self,
        user_input: str,
        context: Optional[Dict] = None,
        on_token: Optional[Callable[[str], None]] = None,
    ) -> Dict[str, Any]:
        """流式调用 AI，on_token 实时推送增量文本"""
        self._status("正在流式调用 AI 模型...")
        result = self.ai_engine.chat_stream(user_input, context, on_token=on_token)
        if result.get("action") == "error":
            return {"success": False, "plan": result, "error": result.get("response", "AI 错误")}
        return {"success": True, "plan": result}

    def save_scheme_json(self, scheme: Dict[str, Any]) -> str:
        """保存 scheme JSON，供 SKILL+CLI 链路使用"""
        self.seq += 1
        path = os.path.join(self.work_dir, f"chat_{self.seq:04d}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(scheme, f, ensure_ascii=False, indent=2)
        return path

    def run_cli_generate(self, json_path: str, output_dir: Optional[str] = None) -> Dict[str, Any]:
        """通过 CLI 无头生成（SKILL+CLI 路径）"""
        out = output_dir or os.path.join(self.work_dir, "output")
        os.makedirs(out, exist_ok=True)
        self._status("调用 CLI: cad-intelligence generate ...")

        cmd = [
            sys.executable,
            self.cli_path,
            "generate",
            "--input", json_path,
            "--output", out,
            "--format", "FCStd",
        ]
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=str(Path(__file__).parent.parent),
            timeout=120,
        )
        return {
            "success": proc.returncode == 0,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "output_dir": out,
        }
