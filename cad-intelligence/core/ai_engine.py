"""
AI自然语言绘图引擎
支持OpenAI兼容API和Ollama本地模型
"""

import json
import os
import time
import urllib.request
import urllib.error
from typing import Callable, Dict, List, Optional, Any

# 系统提示词
SYSTEM_PROMPT = """你是一个专业的工程CAD绘图助手。你的任务是将用户的自然语言指令转换为FreeCAD绘图操作。

你需要返回一个JSON格式的绘图方案，包含以下结构：

```json
{
  "action": "create|modify|delete|connect|export|query",
  "objects": [
    {
      "type": "pump|valve|vessel|heat_exchanger|pipe|tank|reactor|column|compressor|fan",
      "name": "设备名称",
      "parameters": {
        "radius": 数值,
        "height": 数值,
        "length": 数值,
        "width": 数值,
        "diameter": 数值,
        "position": [x, y, z],
        "rotation": [rx, ry, rz]
      },
      "tag": "设备位号，如P-1001"
    }
  ],
  "connections": [
    {
      "from": "设备位号",
      "to": "设备位号",
      "label": "管段号如1001-A1A-H",
      "stream_no": "物流号如S-101",
      "pipe_diameter": "DN100",
      "medium": "介质名称",
      "flow": "100 m³/h"
    }
  ],
  "streams": [
    {
      "stream_no": "S-101",
      "from": "P-1001",
      "to": "T-1001",
      "flow": "100 m³/h",
      "phase": "液相",
      "T_C": 80,
      "P_MPa": 0.6,
      "medium": "进料"
    }
  ],
  "annotations": [
    {
      "target": "设备位号",
      "text": "标注内容"
    }
  ],
  "instruments": [
    {
      "tag": "TI-1001",
      "type": "TI",
      "loop": "TIC-1001",
      "on_line": "1001-A1A-H",
      "range": "0-150°C",
      "signal": "4-20mA"
    }
  ],
  "response": "对用户的回复说明"
}
```

PFD 模式：必须提供 streams[] 和 connections[].label（管段号）。
P&ID 模式： additionally 提供 instruments[]、connections[].valve/valves（阀位号）。

支持的设备类型（3D 模式）：
- pump（离心泵）: diameter=40
- valve（闸阀）: diameter=24
- vessel/tank（立式容器/储罐）: diameter=60, height=150
- heat_exchanger（管壳式换热器）: diameter=50, length=250
- reactor（搅拌反应器）: diameter=70, height=140
- column（精馏塔）: diameter=50, height=300
- compressor（压缩机组）: diameter=50
- fan（离心风机）: diameter=50

注意事项：
1. 设备位号按工艺单元编号，如P-1001(泵), V-1001(阀门), T-1001(储罐), E-1001(换热器), R-1001(反应器), C-1001(塔)
2. 绘制 PFD 时必须提供 streams[]（物流号/流量/相态/T/P）和 connections[].stream_no、connections[].label（管段号）
3. 管道由系统按设备位置自动正交布线，不要单独创建 pipe 对象
4. 所有尺寸单位为毫米(mm)；layout 用 position [x,y,z]，设备间距建议 150-300mm
5. 用户说"画/创建/添加"用 action=create；"连接"且设备已存在用 action=connect
6. 缺少流量/物流数据时，在 response 中说明 DATA_REQUEST，不要编造数值
"""


def get_ollama_models(base_url: str = "http://127.0.0.1:11434") -> List[str]:
    """
    获取本地Ollama已安装的模型列表
    
    Args:
        base_url: Ollama服务地址
        
    Returns:
        模型名称列表
    """
    try:
        req = urllib.request.Request(
            f"{base_url}/api/tags",
            method="GET"
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            models = [m.get("name", "") for m in data.get("models", [])]
            return [m for m in models if m]
    except Exception as e:
        print(f"Failed to get Ollama models: {e}")
        return []


def check_ollama_status(base_url: str = "http://127.0.0.1:11434") -> Dict:
    """
    检查Ollama服务状态
    
    Args:
        base_url: Ollama服务地址
        
    Returns:
        状态信息字典
    """
    try:
        req = urllib.request.Request(
            f"{base_url}/api/tags",
            method="GET"
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            models = data.get("models", [])
            return {
                "status": "running",
                "model_count": len(models),
                "models": [m.get("name", "") for m in models]
            }
    except urllib.error.URLError:
        return {"status": "not_running", "model_count": 0, "models": []}
    except Exception as e:
        return {"status": "error", "error": str(e), "model_count": 0, "models": []}


class AIEngine:
    """AI自然语言绘图引擎 - 支持OpenAI和Ollama"""
    
    def __init__(self, provider: str = "openai", api_key: str = None, 
                 api_base: str = None, model: str = None, ollama_base: str = None):
        """
        初始化AI引擎
        
        Args:
            provider: "openai" 或 "ollama"
            api_key: OpenAI API密钥
            api_base: OpenAI API地址
            model: 模型名称
            ollama_base: Ollama服务地址
        """
        self.provider = provider
        self.api_key = api_key or os.getenv('OPENAI_API_KEY', '')
        self.api_base = api_base or os.getenv('OPENAI_API_BASE', 'https://api.openai.com/v1')
        self.model = model or os.getenv('AI_MODEL', 'gpt-4o-mini')
        self.ollama_base = ollama_base or os.getenv('OLLAMA_BASE', 'http://127.0.0.1:11434')
        self.conversation_history: List[Dict] = []
        
    def chat(self, user_message: str, context: Dict = None) -> Dict:
        """处理用户自然语言输入，返回绘图操作 JSON（非流式）"""
        messages = self._build_messages(user_message, context)

        if self.provider == "ollama":
            response_text = self._call_ollama(messages)
        else:
            response_text = self._call_openai(messages)

        return self._finalize_chat_response(messages, response_text)

    def chat_stream(
        self,
        user_message: str,
        context: Dict = None,
        on_token: Optional[Callable[[str], None]] = None,
    ) -> Dict:
        """流式处理用户输入，on_token 回调每个增量文本"""
        messages = self._build_messages(user_message, context)

        if self.provider == "ollama":
            response_text = self._stream_ollama(messages, on_token)
        else:
            response_text = self._stream_openai(messages, on_token)

        return self._finalize_chat_response(messages, response_text)

    def test_connection(self) -> Dict[str, Any]:
        """
        测试 AI 连接（不写入对话历史）
        返回: success, message, latency_ms, provider, model, sample_response
        """
        started = time.time()
        provider = self.provider
        model = self.model

        try:
            if provider == "ollama":
                base = self.ollama_base.rstrip("/")
                req = urllib.request.Request(f"{base}/api/tags", method="GET")
                with urllib.request.urlopen(req, timeout=10) as resp:
                    tags_data = json.loads(resp.read().decode("utf-8"))
                models = [m.get("name", "") for m in tags_data.get("models", [])]
                if not models:
                    return {
                        "success": False,
                        "message": "Ollama 已连接但未发现本地模型，请先 ollama pull",
                        "latency_ms": int((time.time() - started) * 1000),
                        "provider": provider,
                        "model": model,
                    }
                if model and model not in models:
                    return {
                        "success": False,
                        "message": f"模型 '{model}' 未安装。可用: {', '.join(models[:5])}...",
                        "latency_ms": int((time.time() - started) * 1000),
                        "provider": provider,
                        "model": model,
                        "available_models": models,
                    }

                payload = {
                    "model": model,
                    "messages": [{"role": "user", "content": "请只回复: OK"}],
                    "stream": False,
                    "options": {"num_predict": 16, "temperature": 0},
                }
                data = json.dumps(payload).encode("utf-8")
                req = urllib.request.Request(
                    f"{base}/api/chat",
                    data=data,
                    headers={"Content-Type": "application/json"},
                )
                with urllib.request.urlopen(req, timeout=30) as resp:
                    result = json.loads(resp.read().decode("utf-8"))
                sample = (result.get("message", {}).get("content") or "").strip()
                latency = int((time.time() - started) * 1000)
                return {
                    "success": True,
                    "message": f"Ollama 连接成功 ({latency}ms)",
                    "latency_ms": latency,
                    "provider": provider,
                    "model": model,
                    "sample_response": sample[:200],
                    "endpoint": base,
                }

            if not self.api_key:
                return {
                    "success": False,
                    "message": "API Key 未填写",
                    "latency_ms": int((time.time() - started) * 1000),
                    "provider": provider,
                    "model": model,
                }

            chat_url = f"{self.api_base.rstrip('/')}/chat/completions"

            payload = {
                "model": self.model,
                "messages": [{"role": "user", "content": "请只回复: OK"}],
                "max_tokens": 16,
                "temperature": 0,
            }
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                chat_url,
                data=data,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.api_key}",
                },
            )
            with urllib.request.urlopen(req, timeout=20) as resp:
                result = json.loads(resp.read().decode("utf-8"))
            sample = (result.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
            latency = int((time.time() - started) * 1000)
            return {
                "success": True,
                "message": f"API 连接成功 ({latency}ms)",
                "latency_ms": latency,
                "provider": provider,
                "model": model,
                "sample_response": sample[:200],
                "endpoint": chat_url,
            }
        except urllib.error.HTTPError as e:
            body = ""
            try:
                body = e.read().decode("utf-8", errors="replace")[:300]
            except Exception:
                pass
            return {
                "success": False,
                "message": f"HTTP {e.code}: {body or e.reason}",
                "latency_ms": int((time.time() - started) * 1000),
                "provider": provider,
                "model": model,
            }
        except TimeoutError:
            return {
                "success": False,
                "message": "连接超时（模型加载或网络较慢，可稍后重试）",
                "latency_ms": int((time.time() - started) * 1000),
                "provider": provider,
                "model": model,
            }
        except urllib.error.URLError as e:
            return {
                "success": False,
                "message": f"网络错误: {e.reason}",
                "latency_ms": int((time.time() - started) * 1000),
                "provider": provider,
                "model": model,
            }
        except Exception as e:
            return {
                "success": False,
                "message": str(e),
                "latency_ms": int((time.time() - started) * 1000),
                "provider": provider,
                "model": model,
            }

    def _finalize_chat_response(self, messages: List[Dict], response_text: str) -> Dict:
        """解析 AI 文本并写入对话历史"""
        if response_text.strip().startswith("{") and '"action"' in response_text:
            try:
                err = json.loads(response_text)
                if err.get("action") == "error":
                    return err
            except json.JSONDecodeError:
                pass

        try:
            return self._extract_json(response_text)
        except Exception as e:
            return {
                "action": "chat",
                "response": response_text,
                "error": str(e),
            }
    
    def _build_messages(self, user_message: str, context: Dict = None) -> List[Dict]:
        """构建API消息列表"""
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT}
        ]
        
        messages.extend(self.conversation_history[-10:])
        
        if context:
            context_msg = f"当前绘图上下文：\n```json\n{json.dumps(context, ensure_ascii=False, indent=2)}\n```"
            messages.append({"role": "system", "content": context_msg})
        
        messages.append({"role": "user", "content": user_message})
        
        return messages
    
    def _call_openai(self, messages: List[Dict]) -> str:
        """调用OpenAI兼容API"""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }
        
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 2000
        }
        
        data = json.dumps(payload).encode('utf-8')
        
        req = urllib.request.Request(
            f"{self.api_base}/chat/completions",
            data=data,
            headers=headers
        )
        
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                result = json.loads(resp.read().decode('utf-8'))
                content = result["choices"][0]["message"]["content"]
                
                self.conversation_history.append({"role": "user", "content": messages[-1]["content"]})
                self.conversation_history.append({"role": "assistant", "content": content})
                
                return content
        except urllib.error.URLError as e:
            return json.dumps({
                "action": "error",
                "response": f"OpenAI API调用失败: {str(e)}",
                "error": str(e)
            })

    def _stream_openai(
        self,
        messages: List[Dict],
        on_token: Optional[Callable[[str], None]] = None,
    ) -> str:
        """OpenAI 兼容 API 流式输出 (SSE)"""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "text/event-stream",
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 2000,
            "stream": True,
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{self.api_base.rstrip('/')}/chat/completions",
            data=data,
            headers=headers,
        )

        chunks: List[str] = []
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                while True:
                    line = resp.readline()
                    if not line:
                        break
                    text = line.decode("utf-8", errors="replace").strip()
                    if not text or not text.startswith("data:"):
                        continue
                    payload_text = text[5:].strip()
                    if payload_text == "[DONE]":
                        break
                    try:
                        event = json.loads(payload_text)
                        delta = event.get("choices", [{}])[0].get("delta", {})
                        token = delta.get("content") or ""
                        if token:
                            chunks.append(token)
                            if on_token:
                                on_token(token)
                    except json.JSONDecodeError:
                        continue
        except urllib.error.URLError as e:
            return json.dumps({
                "action": "error",
                "response": f"OpenAI API流式调用失败: {str(e)}",
                "error": str(e),
            })

        content = "".join(chunks)
        self.conversation_history.append({"role": "user", "content": messages[-1]["content"]})
        self.conversation_history.append({"role": "assistant", "content": content})
        return content

    def _call_ollama(self, messages: List[Dict]) -> str:
        """调用Ollama本地模型"""
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": 0.7
            }
        }
        
        data = json.dumps(payload).encode('utf-8')
        
        req = urllib.request.Request(
            f"{self.ollama_base}/api/chat",
            data=data,
            headers={"Content-Type": "application/json"}
        )
        
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                result = json.loads(resp.read().decode('utf-8'))
                content = result.get("message", {}).get("content", "")

                self.conversation_history.append({"role": "user", "content": messages[-1]["content"]})
                self.conversation_history.append({"role": "assistant", "content": content})

                return content
        except urllib.error.URLError as e:
            return json.dumps({
                "action": "error",
                "response": f"Ollama调用失败: {str(e)}。请确保Ollama服务正在运行。",
                "error": str(e)
            })

    def _stream_ollama(
        self,
        messages: List[Dict],
        on_token: Optional[Callable[[str], None]] = None,
    ) -> str:
        """Ollama 流式输出 (NDJSON)"""
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "options": {"temperature": 0.7},
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{self.ollama_base.rstrip('/')}/api/chat",
            data=data,
            headers={"Content-Type": "application/json"},
        )

        chunks: List[str] = []
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                while True:
                    line = resp.readline()
                    if not line:
                        break
                    try:
                        event = json.loads(line.decode("utf-8", errors="replace"))
                    except json.JSONDecodeError:
                        continue
                    token = event.get("message", {}).get("content") or ""
                    if token:
                        chunks.append(token)
                        if on_token:
                            on_token(token)
                    if event.get("done"):
                        break
        except urllib.error.URLError as e:
            return json.dumps({
                "action": "error",
                "response": f"Ollama流式调用失败: {str(e)}。请确保Ollama服务正在运行。",
                "error": str(e),
            })

        content = "".join(chunks)
        self.conversation_history.append({"role": "user", "content": messages[-1]["content"]})
        self.conversation_history.append({"role": "assistant", "content": content})
        return content

    def _extract_json(self, text: str) -> Dict:
        """从文本中提取JSON"""
        import re
        
        try:
            return json.loads(text)
        except:
            pass
        
        json_patterns = [
            r'```json\s*([\s\S]*?)\s*```',
            r'```\s*([\s\S]*?)\s*```',
            r'\{[\s\S]*\}'
        ]
        
        for pattern in json_patterns:
            matches = re.findall(pattern, text)
            for match in matches:
                try:
                    return json.loads(match)
                except:
                    continue
        
        return {
            "action": "chat",
            "response": text
        }
    
    def clear_history(self):
        """清空对话历史"""
        self.conversation_history = []


class DrawingCommandExecutor:
    """绘图命令执行器"""
    
    def __init__(self, freecad_doc=None):
        self.doc = freecad_doc
        self.created_objects = {}
        
    def execute(self, command: Dict) -> str:
        """执行绘图命令"""
        action = command.get("action", "")
        
        if action == "create":
            return self._create_objects(command)
        elif action == "modify":
            return self._modify_objects(command)
        elif action == "delete":
            return self._delete_objects(command)
        elif action == "connect":
            return self._connect_objects(command)
        elif action == "export":
            return self._export(command)
        elif action == "chat":
            return command.get("response", "")
        elif action == "error":
            return command.get("response", command.get("error", "AI 错误"))
        else:
            return f"未知操作: {action}"
    
    def _create_objects(self, command: Dict) -> str:
        """创建对象"""
        import FreeCAD
        
        if not self.doc:
            self.doc = FreeCAD.ActiveDocument or FreeCAD.newDocument("CAD_Intelligence")
        
        results = []
        for obj_spec in command.get("objects", []):
            obj_type = obj_spec.get("type", "")
            name = obj_spec.get("name", obj_type)
            params = obj_spec.get("parameters", {})
            tag = obj_spec.get("tag", name)
            
            try:
                obj = self._create_single_object(obj_type, tag, params)
                if obj:
                    self.created_objects[tag] = obj
                    results.append(f"已创建 {tag}")
            except Exception as e:
                results.append(f"创建 {tag} 失败: {e}")
        
        self.doc.recompute()
        
        response = command.get("response", "")
        if response:
            results.insert(0, response)
        
        return "\n".join(results)
    
    def _create_single_object(self, obj_type: str, tag: str, params: Dict):
        """创建单个对象（优先参数化 3D 设备建模）"""
        import FreeCAD
        
        r = params.get("radius", 15)
        h = params.get("height", 30)
        pos = params.get("position", [0, 0, 0])

        # 参数化设备建模（equipment3d）优先
        try:
            import Part
            from core.equipment3d import BUILDERS
            builder = BUILDERS.get(obj_type)
            if builder:
                shape, _nozzles = builder(Part, FreeCAD, params)
                safe = "".join(c if c.isalnum() or c in "_-" else "_" for c in str(tag)) or "EQ"
                fc = self.doc.addObject("Part::Feature", safe)
                fc.Label = str(tag)
                fc.Shape = shape
                if isinstance(pos, (list, tuple)) and len(pos) >= 3:
                    fc.Placement.Base = FreeCAD.Vector(*[float(v) for v in pos[:3]])
                return fc
        except Exception:
            pass  # 回退到简化原语

        if obj_type == "pump":
            body = self.doc.addObject("Part::Cylinder", f"{tag}_Body")
            body.Radius = r
            body.Height = h
            
            inlet = self.doc.addObject("Part::Cylinder", f"{tag}_Inlet")
            inlet.Radius = r * 0.3
            inlet.Height = h * 0.5
            inlet.Placement = FreeCAD.Placement(
                FreeCAD.Vector(0, r, 0),
                FreeCAD.Rotation(90, 0, 0)
            )
            
            outlet = self.doc.addObject("Part::Cylinder", f"{tag}_Outlet")
            outlet.Radius = r * 0.3
            outlet.Height = h * 0.5
            outlet.Placement = FreeCAD.Placement(
                FreeCAD.Vector(r, 0, 0),
                FreeCAD.Rotation(0, 90, 0)
            )
            
            body.Placement.Base = FreeCAD.Vector(*pos)
            return body
            
        elif obj_type in ("valve",):
            body = self.doc.addObject("Part::Sphere", f"{tag}_Body")
            body.Radius = r
            
            stem = self.doc.addObject("Part::Cylinder", f"{tag}_Stem")
            stem.Radius = r * 0.3
            stem.Height = r * 1.5
            stem.Placement = FreeCAD.Placement(
                FreeCAD.Vector(0, 0, r),
                FreeCAD.Rotation(0, 0, 0)
            )
            
            body.Placement.Base = FreeCAD.Vector(*pos)
            return body
            
        elif obj_type in ("vessel", "tank"):
            body = self.doc.addObject("Part::Cylinder", tag)
            body.Radius = r
            body.Height = h
            body.Placement.Base = FreeCAD.Vector(*pos)
            return body
            
        elif obj_type == "heat_exchanger":
            shell = self.doc.addObject("Part::Cylinder", f"{tag}_Shell")
            shell.Radius = r
            shell.Height = h
            shell.Placement.Base = FreeCAD.Vector(*pos)
            return shell
            
        elif obj_type == "pipe":
            pipe = self.doc.addObject("Part::Cylinder", tag)
            pipe.Radius = params.get("pipe_radius", 3)
            pipe.Height = params.get("length", 100)
            pipe.Placement.Base = FreeCAD.Vector(*pos)
            return pipe
            
        elif obj_type == "reactor":
            body = self.doc.addObject("Part::Cylinder", tag)
            body.Radius = r
            body.Height = h
            body.Placement.Base = FreeCAD.Vector(*pos)
            return body
            
        elif obj_type == "column":
            body = self.doc.addObject("Part::Cylinder", tag)
            body.Radius = r
            body.Height = h
            body.Placement.Base = FreeCAD.Vector(*pos)
            return body
            
        elif obj_type in ("compressor", "fan"):
            body = self.doc.addObject("Part::Cylinder", f"{tag}_Body")
            body.Radius = r
            body.Height = h
            body.Placement.Base = FreeCAD.Vector(*pos)
            return body
        
        return None
    
    def _modify_objects(self, command: Dict) -> str:
        """修改对象"""
        results = []
        for obj_spec in command.get("objects", []):
            tag = obj_spec.get("tag", "")
            if tag in self.created_objects:
                obj = self.created_objects[tag]
                params = obj_spec.get("parameters", {})
                
                if "radius" in params:
                    obj.Radius = params["radius"]
                if "height" in params:
                    obj.Height = params["height"]
                if "position" in params:
                    import FreeCAD
                    obj.Placement.Base = FreeCAD.Vector(*params["position"])
                
                results.append(f"已修改 {tag}")
            else:
                results.append(f"未找到 {tag}")
        
        self.doc.recompute()
        return "\n".join(results)
    
    def _delete_objects(self, command: Dict) -> str:
        """删除对象"""
        results = []
        for obj_spec in command.get("objects", []):
            tag = obj_spec.get("tag", "")
            if tag in self.created_objects:
                self.doc.removeObject(self.created_objects[tag].Name)
                del self.created_objects[tag]
                results.append(f"已删除 {tag}")
            else:
                results.append(f"未找到 {tag}")
        
        self.doc.recompute()
        return "\n".join(results)
    
    def _connect_objects(self, command: Dict) -> str:
        """连接对象"""
        import FreeCAD
        
        results = []
        for conn in command.get("connections", []):
            from_tag = conn.get("from", "")
            to_tag = conn.get("to", "")
            pipe_r = conn.get("pipe_diameter", 6) / 2
            
            if from_tag in self.created_objects and to_tag in self.created_objects:
                from_obj = self.created_objects[from_tag]
                to_obj = self.created_objects[to_tag]
                
                pos1 = from_obj.Placement.Base
                pos2 = to_obj.Placement.Base
                
                direction = pos2 - pos1
                length = direction.Length
                midpoint = (pos1 + pos2) / 2
                
                pipe = self.doc.addObject("Part::Cylinder", f"Pipe_{from_tag}_{to_tag}")
                pipe.Radius = pipe_r
                pipe.Height = length
                pipe.Placement = FreeCAD.Placement(
                    midpoint,
                    FreeCAD.Rotation(FreeCAD.Vector(0, 0, 1), direction)
                )
                
                results.append(f"已连接 {from_tag} 和 {to_tag}")
            else:
                results.append(f"连接失败: 找不到设备")
        
        self.doc.recompute()
        return "\n".join(results)
    
    def _export(self, command: Dict) -> str:
        """导出"""
        if not self.doc:
            return "没有活动文档"
        
        path = os.path.join(os.path.expanduser("~"), "Desktop", f"{self.doc.Name}.FCStd")
        self.doc.saveAs(path)
        return f"已导出到: {path}"
    
    def get_context(self) -> Dict:
        """获取当前绘图上下文"""
        return {
            "created_objects": {tag: {
                "type": obj.TypeId,
                "name": obj.Name
            } for tag, obj in self.created_objects.items()},
            "document": self.doc.Name if self.doc else None
        }


def create_ai_engine(provider: str = "openai", **kwargs) -> AIEngine:
    """创建AI引擎实例"""
    return AIEngine(provider=provider, **kwargs)


def create_executor(doc=None) -> DrawingCommandExecutor:
    """创建命令执行器实例"""
    return DrawingCommandExecutor(freecad_doc=doc)
