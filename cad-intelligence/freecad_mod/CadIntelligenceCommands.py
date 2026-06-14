"""CadIntelligence FreeCAD commands - with AI chat and Ollama support"""

import json
import os
import sys
import threading
import time
from datetime import datetime

from cad_paths import CAD_INTEL, MOD_ROOT, get_symbols_path, setup_sys_path

setup_sys_path()

import FreeCADGui as Gui
from qt_compat import import_qt

QtGui, QtCore = import_qt()
if not hasattr(QtCore, "Signal"):
    QtCore.Signal = QtCore.pyqtSignal

# PySide (FreeCAD 旧版): QTextCursor 在 QtGui 而非 QtCore
QTextCursor = getattr(QtGui, "QTextCursor", None) or getattr(QtCore, "QTextCursor")

_dock = None
_panel = None
SYMBOLS_PATH = get_symbols_path()

DRAW_MODE_LABELS = [
    "3D 模型（参数化设备）",
    "2D PFD（物流+管道表）",
    "2D P&ID（仪表+阀+管道表）",
    "2D 设备布置图（平面定位+尺寸）",
    "2D 管道单线图（轴测+标高）",
]


def _draw_mode_from_index(index: int) -> str:
    return ("3d", "pfd", "pid", "layout", "isometric")[min(max(int(index), 0), 4)]


class _ThreadUiBridge(QtCore.QObject):
    """跨线程 UI 回调桥（后台线程禁止直接 QTimer.singleShot）"""
    test_result_ready = QtCore.Signal(object)
    status_text = QtCore.Signal(str)
    diag_line = QtCore.Signal(str, str)
    chat_html = QtCore.Signal(str)
    stream_begin = QtCore.Signal()
    stream_token = QtCore.Signal(str)
    stream_end = QtCore.Signal()
    ai_finished = QtCore.Signal(object, object)
    fallback_finished = QtCore.Signal(object)
    error_shown = QtCore.Signal(object, str)


def show_panel_dialog():
    """打开主控制面板（停靠在 FreeCAD 主窗口内）"""
    global _dock, _panel
    try:
        import FreeCAD
        mw = Gui.getMainWindow()
        if _dock is None:
            _dock = QtGui.QDockWidget("CAD Intelligence", mw)
            _dock.setObjectName("CadIntelligenceDock")
            _panel = CadIntelligencePanelDialog()
            _dock.setWidget(_panel)
            _dock.setFeatures(
                QtGui.QDockWidget.DockWidgetMovable
                | QtGui.QDockWidget.DockWidgetClosable
                | QtGui.QDockWidget.DockWidgetFloatable
            )
            _dock.setAllowedAreas(
                QtCore.Qt.LeftDockWidgetArea
                | QtCore.Qt.RightDockWidgetArea
                | QtCore.Qt.TopDockWidgetArea
                | QtCore.Qt.BottomDockWidgetArea
            )
            mw.addDockWidget(QtCore.Qt.RightDockWidgetArea, _dock)
        _dock.show()
        _dock.raise_()
        FreeCAD.Console.PrintMessage("CadIntelligence: 控制面板已打开（可拖拽停靠）。\n")
    except Exception as e:
        import traceback
        import FreeCAD
        FreeCAD.Console.PrintError(f"CadIntelligence 打开面板失败: {e}\n")
        traceback.print_exc()
        try:
            QtGui.QMessageBox.critical(
                None, "CAD Intelligence",
                f"无法打开控制面板:\n{e}",
            )
        except Exception:
            pass


def load_symbols_from_files():
    """Load symbols directly from JSON files"""
    symbols = []
    for root, dirs, files in os.walk(SYMBOLS_PATH):
        for f in files:
            if f.endswith('.json'):
                try:
                    with open(os.path.join(root, f), 'r', encoding='utf-8') as fh:
                        data = json.load(fh)
                        if isinstance(data, dict) and 'symbol_id' in data:
                            symbols.append(data)
                        elif isinstance(data, list):
                            symbols.extend(data)
                except:
                    pass
    return symbols


def load_config():
    """加载合并配置（默认 + user_config + 环境变量）"""
    try:
        from core.paths import load_merged_config
        return load_merged_config()
    except Exception:
        return {}


def save_config(config):
    """保存用户配置到 Mod/user_config.json"""
    try:
        from core.paths import save_user_config
        ai = config.get("ai", {})
        save_user_config({"ai": ai})
    except Exception as e:
        import FreeCAD
        FreeCAD.Console.PrintError(f"保存配置失败: {e}\n")


class CadIntelligencePanelDialog(QtGui.QWidget):
    def __init__(self, parent=None):
        super(CadIntelligencePanelDialog, self).__init__(parent)
        self.setMinimumSize(420, 600)
        self._all_symbols = []
        self.ai_engine = None
        self.executor = None
        self.orchestrator = None
        self._stream_open = False
        self._ui_bridge = _ThreadUiBridge()
        self._ui_bridge.test_result_ready.connect(self._show_test_result)
        self._ui_bridge.status_text.connect(self._do_update_status)
        self._ui_bridge.diag_line.connect(self._do_log_diag)
        self._ui_bridge.chat_html.connect(self._do_append_chat)
        self._ui_bridge.stream_begin.connect(self._begin_stream_ui)
        self._ui_bridge.stream_token.connect(self._append_stream_token)
        self._ui_bridge.stream_end.connect(self._end_stream_ui)
        self._ui_bridge.ai_finished.connect(self._finish_ai_command)
        self._ui_bridge.fallback_finished.connect(self._finish_fallback)
        self._ui_bridge.error_shown.connect(self._show_error)
        self._setup_ui()
        # 延后初始化 AI，避免阻塞窗口创建
        QtCore.QTimer.singleShot(100, self._init_ai)

    def _init_ai(self):
        """Initialize AI engine"""
        try:
            from core.ai_engine import AIEngine, DrawingCommandExecutor
            from core.chat_engine import ChatOrchestrator
            config = load_config()
            ai_config = config.get('ai', {})
            
            provider = ai_config.get('provider', 'openai')
            
            if provider == 'ollama':
                ollama_base = ai_config.get('ollama_base', 'http://127.0.0.1:11434')
                model = ai_config.get('ollama_model', 'qwen3.5:9b-mlx')
                self.ai_engine = AIEngine(
                    provider='ollama',
                    model=model,
                    ollama_base=ollama_base
                )
            else:
                api_key = ai_config.get('api_key', '') or os.getenv('OPENAI_API_KEY', '')
                api_base = ai_config.get('api_base', '') or os.getenv('OPENAI_API_BASE', 'https://api.openai.com/v1')
                model = ai_config.get('model', '') or os.getenv('AI_MODEL', 'gpt-4o-mini')
                
                if api_key:
                    self.ai_engine = AIEngine(
                        provider='openai',
                        api_key=api_key,
                        api_base=api_base,
                        model=model
                    )
            
            self.executor = DrawingCommandExecutor()
            if self.ai_engine:
                self.orchestrator = ChatOrchestrator(
                    self.ai_engine,
                    on_status=lambda msg: self._update_status_safe(msg),
                )
            self._refresh_ai_status_label()
        except Exception as e:
            import FreeCAD
            FreeCAD.Console.PrintError(f"CadIntelligence AI init failed: {e}\n")
            if hasattr(self, "status_label"):
                self.status_label.setText(f"AI 初始化失败: {e}")
                self.status_label.setStyleSheet("color:#f44336;font-size:11px;")

    def _refresh_ai_status_label(self):
        if not hasattr(self, "status_label"):
            return
        config = load_config()
        provider = config.get("ai", {}).get("provider", "openai")
        if self.ai_engine:
            if provider == "ollama":
                text = f"Ollama就绪 ({config.get('ai', {}).get('ollama_model', '')})"
            else:
                text = f"API就绪 ({config.get('ai', {}).get('model', '')})"
            self.status_label.setText(text)
            self.status_label.setStyleSheet("color:#4CAF50;font-size:11px;")
        else:
            self.status_label.setText("AI未配置 (请在设置中配置并测试连接)")
            self.status_label.setStyleSheet("color:#FF9800;font-size:11px;")

    def _setup_ui(self):
        layout = QtGui.QVBoxLayout(self)

        # Title with gradient
        title = QtGui.QLabel("CAD Intelligence - AI智能绘图")
        title.setStyleSheet("""
            font-size:16px; font-weight:bold; padding:12px;
            background:qlineargradient(x1:0,y1:0,x2:1,y2:0,stop:0 #667eea,stop:1 #764ba2);
            color:white; border-radius:8px;
        """)
        title.setAlignment(QtCore.Qt.AlignCenter)
        layout.addWidget(title)

        # AI Status
        config = load_config()
        provider = config.get('ai', {}).get('provider', 'openai')
        if self.ai_engine:
            if provider == 'ollama':
                ai_status_text = f"Ollama就绪 ({config.get('ai', {}).get('ollama_model', 'llama3.1')})"
            else:
                ai_status_text = f"OpenAI就绪 ({config.get('ai', {}).get('model', 'gpt-4o-mini')})"
            ai_status_color = '#4CAF50'
        else:
            ai_status_text = "AI未配置 (请在设置中配置)"
            ai_status_color = '#FF9800'
        
        self.status_label = QtGui.QLabel(ai_status_text)
        self.status_label.setStyleSheet(f"color:{ai_status_color}; font-size:11px; padding:4px;")
        layout.addWidget(self.status_label)

        # Tabs
        self.tabs = QtGui.QTabWidget()
        layout.addWidget(self.tabs)
        self.tabs.addTab(self._create_chat_tab(), "AI对话绘图")
        self.tabs.addTab(self._create_generate_tab(), "JSON生成")
        self.tabs.addTab(self._create_symbols_tab(), "符号库")
        self.tabs.addTab(self._create_settings_tab(), "设置")

        # Status bar
        self.status = QtGui.QLabel("就绪")
        self.status.setStyleSheet("color:#666; font-size:11px; padding:4px; border-top:1px solid #ccc;")
        layout.addWidget(self.status)

    def _create_chat_tab(self):
        widget = QtGui.QWidget()
        layout = QtGui.QVBoxLayout(widget)

        # Chat history
        self.chat_history = QtGui.QTextEdit()
        self.chat_history.setReadOnly(True)
        self.chat_history.setStyleSheet("""
            QTextEdit {
                font-family: 'SF Pro Text', 'PingFang SC', monospace;
                font-size:13px;
                background:#f8f9fa;
                border:1px solid #dee2e6;
                border-radius:8px;
                padding:8px;
            }
        """)
        
        welcome_msg = """<div style='background:#e3f2fd; padding:12px; border-radius:8px; margin:4px;'>
<b>CAD Intelligence AI助手</b><br>
我可以理解自然语言指令来创建工程图纸。试试这些指令：<br>
<br>
<b>基础指令：</b><br>
- "创建一个离心泵P-1001"<br>
- "添加一个储罐T-1001和两个阀门"<br>
- "用管道连接泵和储罐"<br>
<br>
<b>高级指令（需要AI）：</b><br>
- "设计一个简单的PFD流程图，包含进料泵、反应釜和产品储罐"<br>
- "创建一套换热系统，要有壳管式换热器"<br>
- "帮我画一个蒸馏塔的初步布局"<br>
<br>
<b>提示：</b>默认 <b>2D PFD</b> 模式；可在下方切换 3D 预览
</div>"""
        self.chat_history.append(welcome_msg)
        layout.addWidget(self.chat_history)

        # Diagnostic log
        diag_group = QtGui.QGroupBox("运行诊断")
        diag_group.setStyleSheet("QGroupBox{font-weight:bold;font-size:11px;}")
        diag_layout = QtGui.QVBoxLayout(diag_group)
        self.diag_log = QtGui.QTextEdit()
        self.diag_log.setReadOnly(True)
        self.diag_log.setMaximumHeight(110)
        self.diag_log.setStyleSheet(
            "font-family:monospace;font-size:11px;background:#263238;color:#aed581;padding:6px;"
        )
        self.diag_log.setPlaceholderText("任务执行步骤将显示在这里...")
        diag_layout.addWidget(self.diag_log)
        clear_diag_btn = QtGui.QPushButton("清空诊断")
        clear_diag_btn.clicked.connect(lambda: self.diag_log.clear())
        diag_layout.addWidget(clear_diag_btn)
        layout.addWidget(diag_group)
        self._log_diag("面板就绪。发送指令后可查看各阶段耗时。", "info")

        # 绘图模式（3D 参数化设备 / 2D PFD 图）
        mode_layout = QtGui.QHBoxLayout()
        mode_label = QtGui.QLabel("绘图模式:")
        mode_label.setStyleSheet("font-size:12px;color:#555;")
        mode_layout.addWidget(mode_label)
        self.draw_mode_combo = QtGui.QComboBox()
        self.draw_mode_combo.addItems(DRAW_MODE_LABELS)
        self.draw_mode_combo.setCurrentIndex(1)
        self.draw_mode_combo.setStyleSheet("font-size:12px;padding:4px;")
        mode_layout.addWidget(self.draw_mode_combo)
        mode_layout.addStretch()
        layout.addLayout(mode_layout)

        # Input area
        input_frame = QtGui.QFrame()
        input_frame.setStyleSheet("QFrame{background:white; border:1px solid #dee2e6; border-radius:8px;}")
        input_layout = QtGui.QHBoxLayout(input_frame)
        
        self.chat_input = QtGui.QLineEdit()
        self.chat_input.setPlaceholderText("输入绘图指令...")
        self.chat_input.setStyleSheet("QLineEdit{font-size:14px; padding:10px; border:none; border-radius:6px;}")
        self.chat_input.returnPressed.connect(self._send_message)
        input_layout.addWidget(self.chat_input)
        
        send_btn = QtGui.QPushButton("发送")
        send_btn.setStyleSheet("""
            QPushButton{background:#4CAF50; color:white; font-weight:bold; padding:10px 20px; border-radius:6px; font-size:14px;}
            QPushButton:hover{background:#45a049;}
        """)
        send_btn.clicked.connect(self._send_message)
        input_layout.addWidget(send_btn)
        layout.addWidget(input_frame)

        # Quick commands
        quick_group = QtGui.QGroupBox("快速命令")
        quick_group.setStyleSheet("QGroupBox{font-weight:bold; border:1px solid #dee2e6; border-radius:6px; margin-top:8px; padding-top:16px;}")
        quick_layout = QtGui.QGridLayout(quick_group)
        quick_cmds = [
            ("离心泵", "创建一个离心泵P-1001"),
            ("闸阀", "创建一个闸阀V-1001"),
            ("储罐", "创建一个储罐T-1001"),
            ("换热器", "创建一个管壳式换热器E-1001"),
            ("反应器", "创建一个搅拌反应器R-1001"),
            ("塔器", "创建一个精馏塔C-1001"),
            ("设计PFD", "设计一个PFD，包含泵、换热器和储罐"),
            ("清空", "删除所有对象，重新开始"),
        ]
        for i, (label, cmd) in enumerate(quick_cmds):
            btn = QtGui.QPushButton(label)
            btn.setStyleSheet("""
                QPushButton{background:#e3f2fd; border:1px solid #90caf9; padding:8px; border-radius:4px; font-size:12px;}
                QPushButton:hover{background:#bbdefb;}
            """)
            btn.clicked.connect(lambda checked, c=cmd: self._quick_command(c))
            quick_layout.addWidget(btn, i // 4, i % 4)
        layout.addWidget(quick_group)

        return widget

    def _create_generate_tab(self):
        widget = QtGui.QWidget()
        layout = QtGui.QVBoxLayout(widget)

        file_group = QtGui.QGroupBox("JSON输入文件")
        file_layout = QtGui.QHBoxLayout(file_group)
        self.json_path = QtGui.QLineEdit()
        self.json_path.setPlaceholderText("选择JSON文件...")
        file_layout.addWidget(self.json_path)
        browse_btn = QtGui.QPushButton("浏览...")
        browse_btn.clicked.connect(self._browse_json)
        file_layout.addWidget(browse_btn)
        layout.addWidget(file_group)

        json_mode_layout = QtGui.QHBoxLayout()
        json_mode_label = QtGui.QLabel("绘图模式:")
        json_mode_label.setStyleSheet("font-size:12px;color:#555;")
        json_mode_layout.addWidget(json_mode_label)
        self.json_draw_mode_combo = QtGui.QComboBox()
        self.json_draw_mode_combo.addItems(DRAW_MODE_LABELS)
        self.json_draw_mode_combo.setCurrentIndex(1)
        self.json_draw_mode_combo.setStyleSheet("font-size:12px;padding:4px;")
        json_mode_layout.addWidget(self.json_draw_mode_combo)
        json_mode_layout.addStretch()
        layout.addLayout(json_mode_layout)

        gen_btn = QtGui.QPushButton("生成图纸")
        gen_btn.setStyleSheet("QPushButton{background:#0066cc; color:white; font-weight:bold; padding:10px; border-radius:6px; font-size:14px;}")
        gen_btn.clicked.connect(self._generate)
        layout.addWidget(gen_btn)

        self.gen_log = QtGui.QTextEdit()
        self.gen_log.setReadOnly(True)
        self.gen_log.setMaximumHeight(200)
        layout.addWidget(self.gen_log)

        layout.addStretch()
        return widget

    def _create_symbols_tab(self):
        widget = QtGui.QWidget()
        layout = QtGui.QVBoxLayout(widget)

        search_layout = QtGui.QHBoxLayout()
        self.sym_search = QtGui.QLineEdit()
        self.sym_search.setPlaceholderText("搜索符号...")
        self.sym_search.textChanged.connect(self._filter_symbols)
        search_layout.addWidget(self.sym_search)
        self.sym_cat = QtGui.QComboBox()
        self.sym_cat.addItems(["全部", "设备", "仪表", "管道", "标注"])
        self.sym_cat.currentTextChanged.connect(self._filter_symbols)
        search_layout.addWidget(self.sym_cat)
        layout.addLayout(search_layout)

        self.sym_tree = QtGui.QTreeWidget()
        self.sym_tree.setHeaderLabels(["ID", "名称", "类别"])
        layout.addWidget(self.sym_tree)

        self._all_symbols = load_symbols_from_files()
        self._populate_symbols(self._all_symbols)

        return widget

    def _create_settings_tab(self):
        widget = QtGui.QWidget()
        layout = QtGui.QVBoxLayout(widget)

        config = load_config()
        ai_config = config.get('ai', {})

        # Provider selection
        provider_group = QtGui.QGroupBox("AI提供商")
        provider_layout = QtGui.QVBoxLayout(provider_group)
        
        self.provider_combo = QtGui.QComboBox()
        self.provider_combo.addItems(["OpenAI / 兼容API", "Ollama (本地模型)"])
        self.provider_combo.setCurrentIndex(0 if ai_config.get('provider', 'openai') == 'openai' else 1)
        self.provider_combo.currentIndexChanged.connect(self._on_provider_changed)
        provider_layout.addWidget(self.provider_combo)
        layout.addWidget(provider_group)

        # OpenAI settings
        self.openai_group = QtGui.QGroupBox("OpenAI / 兼容API配置")
        openai_layout = QtGui.QFormLayout(self.openai_group)
        
        self.api_key_input = QtGui.QLineEdit()
        self.api_key_input.setEchoMode(QtGui.QLineEdit.Password)
        self.api_key_input.setText(ai_config.get('api_key', '') or os.getenv('OPENAI_API_KEY', ''))
        self.api_key_input.setPlaceholderText("sk-...")
        openai_layout.addRow("API Key:", self.api_key_input)
        
        self.api_base_input = QtGui.QLineEdit()
        self.api_base_input.setText(ai_config.get('api_base', '') or os.getenv('OPENAI_API_BASE', 'https://api.openai.com/v1'))
        openai_layout.addRow("API Base:", self.api_base_input)
        
        self.model_input = QtGui.QLineEdit()
        self.model_input.setText(ai_config.get('model', '') or os.getenv('AI_MODEL', 'gpt-4o-mini'))
        self.model_input.setPlaceholderText("gpt-4o-mini, gpt-4, etc.")
        openai_layout.addRow("Model:", self.model_input)

        openai_test_btn = QtGui.QPushButton("测试 API 连接")
        openai_test_btn.clicked.connect(self._test_ai_connection)
        openai_layout.addRow("", openai_test_btn)

        layout.addWidget(self.openai_group)

        # Ollama settings
        self.ollama_group = QtGui.QGroupBox("Ollama 本地模型配置")
        ollama_layout = QtGui.QFormLayout(self.ollama_group)
        
        ollama_base = ai_config.get('ollama_base', 'http://127.0.0.1:11434')
        
        self.ollama_base_input = QtGui.QLineEdit()
        self.ollama_base_input.setText(ollama_base)
        self.ollama_base_input.setPlaceholderText("http://localhost:11434")
        ollama_layout.addRow("服务地址:", self.ollama_base_input)
        
        # Ollama status and refresh
        ollama_status_layout = QtGui.QHBoxLayout()
        self.ollama_status = QtGui.QLabel("检测中...")
        ollama_status_layout.addWidget(self.ollama_status)
        
        refresh_btn = QtGui.QPushButton("刷新模型列表")
        refresh_btn.clicked.connect(self._refresh_ollama_models)
        ollama_status_layout.addWidget(refresh_btn)
        ollama_layout.addRow("服务状态:", ollama_status_layout)
        
        # Model selector
        self.ollama_model_combo = QtGui.QComboBox()
        self.ollama_model_combo.setEditable(True)
        self.ollama_model_combo.setPlaceholderText("选择或输入模型名称...")
        ollama_layout.addRow("模型:", self.ollama_model_combo)

        ollama_test_btn = QtGui.QPushButton("测试 Ollama 连接")
        ollama_test_btn.clicked.connect(self._test_ai_connection)
        ollama_layout.addRow("", ollama_test_btn)

        layout.addWidget(self.ollama_group)

        self.test_result_label = QtGui.QLabel("")
        self.test_result_label.setWordWrap(True)
        self.test_result_label.setStyleSheet("padding:8px;border:1px solid #dee2e6;border-radius:6px;font-size:12px;")
        layout.addWidget(self.test_result_label)

        # Save button
        save_btn = QtGui.QPushButton("保存配置")
        save_btn.setStyleSheet("""
            QPushButton{background:#4CAF50; color:white; font-weight:bold; padding:12px; border-radius:6px; font-size:14px;}
            QPushButton:hover{background:#45a049;}
        """)
        save_btn.clicked.connect(self._save_config)
        layout.addWidget(save_btn)

        # About
        about_group = QtGui.QGroupBox("关于")
        about_layout = QtGui.QVBoxLayout(about_group)
        about_text = QtGui.QLabel("""<b>CAD Intelligence</b> v1.1<br><br>
AI驱动的智能工程绘图工具。<br>
支持自然语言指令创建2D/3D工程图纸。<br><br>
<b>支持的AI模型：</b><br>
- OpenAI: GPT-4o, GPT-4o-mini, etc.<br>
- Ollama: Llama3.1, Qwen2.5, DeepSeek, etc.<br><br>
<b>输出格式：</b> FCStd, STEP, IGES, PDF, STL""")
        about_text.setWordWrap(True)
        about_layout.addWidget(about_text)
        layout.addWidget(about_group)

        # Initial provider state
        self._on_provider_changed(self.provider_combo.currentIndex())
        
        # Delayed Ollama check
        QtCore.QTimer.singleShot(500, self._check_ollama_status)

        layout.addStretch()
        return widget

    def _on_provider_changed(self, index):
        """Handle provider selection change"""
        if index == 0:  # OpenAI
            self.openai_group.setVisible(True)
            self.ollama_group.setVisible(False)
        else:  # Ollama
            self.openai_group.setVisible(False)
            self.ollama_group.setVisible(True)

    def _check_ollama_status(self):
        """Check Ollama service status and load models"""
        try:
            from core.ai_engine import check_ollama_status, get_ollama_models
            
            ollama_base = self.ollama_base_input.text().strip() or 'http://127.0.0.1:11434'
            status = check_ollama_status(ollama_base)
            
            if status['status'] == 'running':
                self.ollama_status.setText(f"<span style='color:#4CAF50'>● 运行中 ({status['model_count']}个模型)</span>")
                self._populate_ollama_models(status.get('models', []))
            else:
                self.ollama_status.setText("<span style='color:#f44336'>● 未运行</span>")
        except Exception as e:
            self.ollama_status.setText(f"<span style='color:#f44336'>● 检测失败: {e}</span>")

    def _refresh_ollama_models(self):
        """Refresh Ollama model list"""
        self.ollama_status.setText("刷新中...")
        self.ollama_status.repaint()
        QtCore.QTimer.singleShot(100, self._check_ollama_status)

    def _populate_ollama_models(self, models):
        """Populate Ollama model dropdown"""
        current = self.ollama_model_combo.currentText()
        self.ollama_model_combo.clear()
        
        config = load_config()
        saved_model = config.get('ai', {}).get('ollama_model', '')
        
        for model in models:
            self.ollama_model_combo.addItem(model)
        
        # Restore selection
        if current:
            index = self.ollama_model_combo.findText(current)
            if index >= 0:
                self.ollama_model_combo.setCurrentIndex(index)
        elif saved_model:
            index = self.ollama_model_combo.findText(saved_model)
            if index >= 0:
                self.ollama_model_combo.setCurrentIndex(index)
            else:
                self.ollama_model_combo.setEditText(saved_model)

    def _save_config(self):
        """Save AI configuration"""
        config = load_config()
        if 'ai' not in config:
            config['ai'] = {}
        
        provider_index = self.provider_combo.currentIndex()
        config['ai']['provider'] = 'openai' if provider_index == 0 else 'ollama'
        
        # OpenAI settings
        config['ai']['api_key'] = self.api_key_input.text().strip()
        config['ai']['api_base'] = self.api_base_input.text().strip()
        config['ai']['model'] = self.model_input.text().strip()
        
        # Ollama settings
        config['ai']['ollama_base'] = self.ollama_base_input.text().strip()
        config['ai']['ollama_model'] = self.ollama_model_combo.currentText().strip()
        
        try:
            save_config(config)
            self._init_ai()
            
            # Update status
            if self.ai_engine:
                if config['ai']['provider'] == 'ollama':
                    self.status_label.setText(f"Ollama就绪 ({config['ai']['ollama_model']})")
                else:
                    self.status_label.setText(f"OpenAI就绪 ({config['ai']['model']})")
                self.status_label.setStyleSheet("color:#4CAF50; font-size:11px;")
            else:
                self.status_label.setText("AI未配置")
                self.status_label.setStyleSheet("color:#FF9800; font-size:11px;")
            
            QtGui.QMessageBox.information(self, "成功", "配置已保存！")
        except Exception as e:
            QtGui.QMessageBox.critical(self, "错误", f"保存失败: {e}")

    def _log_diag(self, msg, level="info"):
        """主线程写入诊断日志"""
        ts = datetime.now().strftime("%H:%M:%S")
        colors = {"info": "#aed581", "warn": "#ffb74d", "error": "#ef5350", "ok": "#81c784"}
        color = colors.get(level, "#aed581")
        if hasattr(self, "diag_log"):
            self.diag_log.append(f"<span style='color:{color}'>[{ts}] {msg}</span>")

    def _do_log_diag(self, msg, level="info"):
        if not hasattr(self, "diag_log"):
            return
        ts = datetime.now().strftime("%H:%M:%S")
        colors = {"info": "#aed581", "warn": "#ffb74d", "error": "#ef5350", "ok": "#81c784"}
        color = colors.get(level, "#aed581")
        self.diag_log.append(f"<span style='color:{color}'>[{ts}] {msg}</span>")

    def _log_diag_safe(self, msg, level="info"):
        """后台线程安全写入诊断日志"""
        self._ui_bridge.diag_line.emit(msg, level)

    def _update_status_safe(self, text):
        """线程安全的状态更新"""
        self._log_diag_safe(text, "info")
        self._ui_bridge.status_text.emit(text)

    def _do_update_status(self, text):
        self.status.setText(text)
        self.status.repaint()

    def _test_ai_connection(self):
        self.test_result_label.setText("正在测试连接（检查服务与模型，最多约 30 秒）...")
        self.test_result_label.setStyleSheet(
            "padding:8px;border:1px solid #dee2e6;border-radius:6px;font-size:12px;color:#666;"
        )
        threading.Thread(target=self._test_ai_connection_async, daemon=True).start()

    def _test_ai_connection_async(self):
        try:
            from core.ai_engine import AIEngine
            provider_index = self.provider_combo.currentIndex()
            if provider_index == 1:
                engine = AIEngine(
                    provider="ollama",
                    model=self.ollama_model_combo.currentText().strip(),
                    ollama_base=self.ollama_base_input.text().strip() or "http://127.0.0.1:11434",
                )
            else:
                engine = AIEngine(
                    provider="openai",
                    api_key=self.api_key_input.text().strip(),
                    api_base=self.api_base_input.text().strip(),
                    model=self.model_input.text().strip(),
                )
            result = engine.test_connection()
            self._ui_bridge.test_result_ready.emit(result)
        except Exception as e:
            self._ui_bridge.test_result_ready.emit({
                "success": False, "message": str(e),
            })

    def _show_test_result(self, result):
        ok = result.get("success")
        msg = result.get("message", "")
        latency = result.get("latency_ms", 0)
        sample = result.get("sample_response", "")
        endpoint = result.get("endpoint", "")
        if ok:
            detail = f"<b style='color:#4CAF50'>✓ {msg}</b>"
            if endpoint:
                detail += f"<br>端点: {endpoint}"
            if sample:
                detail += f"<br>模型回复: {sample}"
            self.test_result_label.setStyleSheet(
                "padding:8px;border:1px solid #c8e6c9;border-radius:6px;font-size:12px;background:#e8f5e9;"
            )
            self._log_diag(f"连接测试成功 ({latency}ms)", "ok")
        else:
            detail = f"<b style='color:#f44336'>✗ 连接失败</b><br>{msg}"
            self.test_result_label.setStyleSheet(
                "padding:8px;border:1px solid #ffcdd2;border-radius:6px;font-size:12px;background:#ffebee;"
            )
            self._log_diag(f"连接测试失败: {msg}", "error")
        self.test_result_label.setText(detail)

    def _append_chat_safe(self, html):
        """线程安全的聊天记录追加"""
        self._ui_bridge.chat_html.emit(html)

    def _do_append_chat(self, html):
        self.chat_history.append(html)

    def _begin_stream_ui(self):
        """主线程：开启 AI 流式输出区域"""
        self._stream_open = True
        self.chat_history.append(
            "<div style='background:#fff3e0;padding:8px;border-radius:6px;margin:4px;'>"
            "<b>AI:</b> "
        )
        cursor = self.chat_history.textCursor()
        cursor.movePosition(QTextCursor.End)
        self.chat_history.setTextCursor(cursor)

    def _begin_stream_ui_safe(self):
        self._ui_bridge.stream_begin.emit()

    def _append_stream_token_safe(self, token):
        self._ui_bridge.stream_token.emit(token)

    def _append_stream_token(self, token):
        if not self._stream_open:
            self._begin_stream_ui()
        cursor = self.chat_history.textCursor()
        cursor.movePosition(QTextCursor.End)
        cursor.insertText(token)
        self.chat_history.setTextCursor(cursor)
        self.chat_history.ensureCursorVisible()

    def _end_stream_ui(self):
        """主线程：结束流式输出区域"""
        if self._stream_open:
            self.chat_history.append("</div>")
            self._stream_open = False

    def _end_stream_ui_safe(self):
        self._ui_bridge.stream_end.emit()

    def _send_message(self):
        msg = self.chat_input.text().strip()
        if not msg:
            return

        self.chat_history.append(f"\n<div style='background:#e8f5e9; padding:8px; border-radius:6px; margin:4px;'><b>你:</b> {msg}</div>")
        self.chat_input.clear()
        self.status.setText("AI思考中...")
        self.status.repaint()
        self.chat_input.setEnabled(False)
        self._stream_open = False
        self._task_start_time = time.time()
        self._last_token_time = time.time()
        self._log_diag(f"收到指令: {msg}", "info")

        threading.Thread(target=self._process_command_async, args=(msg,), daemon=True).start()

    def _quick_command(self, cmd):
        self.chat_input.setText(cmd)
        self._send_message()

    def _process_command_async(self, cmd):
        """后台线程：流式调用 AI；FreeCAD 绘图回到主线程"""
        heartbeat_stop = threading.Event()

        def heartbeat():
            while not heartbeat_stop.wait(15):
                elapsed = int(time.time() - self._task_start_time)
                since_token = int(time.time() - self._last_token_time)
                if since_token >= 15:
                    self._log_diag_safe(
                        f"仍在等待模型响应... 总耗时 {elapsed}s（大模型首次加载可能需 1-3 分钟）",
                        "warn",
                    )

        hb = threading.Thread(target=heartbeat, daemon=True)
        hb.start()

        try:
            if self.orchestrator:
                provider = "Ollama" if self.ai_engine and self.ai_engine.provider == "ollama" else "API"
                model = self.ai_engine.model if self.ai_engine else "?"
                self._log_diag_safe(f"步骤1/4: 连接 {provider} 模型 [{model}]", "info")
                self._begin_stream_ui_safe()
                self._update_status_safe("AI 流式输出中...")
                context = self.executor.get_context() if self.executor else {}

                def on_token(token):
                    self._last_token_time = time.time()
                    self._append_stream_token_safe(token)

                ai_start = time.time()
                parsed = self.orchestrator.parse_only_stream(cmd, context, on_token=on_token)
                self._log_diag_safe(
                    f"步骤2/4: AI 响应完成 ({int(time.time() - ai_start)}s) action={parsed.get('plan', {}).get('action', '?')}",
                    "ok",
                )
                self._end_stream_ui_safe()
                self._ui_bridge.ai_finished.emit(cmd, parsed)
            elif self.ai_engine:
                self._log_diag_safe(f"步骤1/4: 连接 AI [{self.ai_engine.model}]", "info")
                self._begin_stream_ui_safe()
                self._update_status_safe("AI 流式输出中...")
                context = self.executor.get_context() if self.executor else {}

                def on_token(token):
                    self._last_token_time = time.time()
                    self._append_stream_token_safe(token)

                ai_start = time.time()
                result = self.ai_engine.chat_stream(cmd, context, on_token=on_token)
                self._log_diag_safe(
                    f"步骤2/4: AI 响应完成 ({int(time.time() - ai_start)}s) action={result.get('action', '?')}",
                    "ok",
                )
                self._end_stream_ui_safe()
                parsed = {"success": True, "plan": result}
                if result.get("action") == "error":
                    parsed = {"success": False, "plan": result, "error": result.get("response", "AI 错误")}
                self._ui_bridge.ai_finished.emit(cmd, parsed)
            else:
                self._log_diag_safe("未配置 AI，使用本地关键词模式", "warn")
                self._ui_bridge.fallback_finished.emit(cmd)
        except Exception as e:
            self._log_diag_safe(f"任务异常: {e}", "error")
            self._end_stream_ui_safe()
            self._ui_bridge.error_shown.emit(cmd, str(e))
        finally:
            heartbeat_stop.set()

    def _finish_fallback(self, cmd):
        try:
            self._log_diag("本地模式: 执行绘图命令", "info")
            self.status.setText("使用本地模式执行...")
            result = self._execute_fallback_command(cmd)
            self._log_diag(f"本地模式完成: {result[:80]}", "ok")
            self._show_result(cmd, result)
        finally:
            self.chat_input.setEnabled(True)
            self.status.setText("就绪")

    def _finish_ai_command(self, cmd, parsed):
        """主线程：执行绘图并展示结果"""
        try:
            if not parsed.get("success"):
                self._show_error(cmd, parsed.get("error", "AI 调用失败"))
                return

            plan = parsed.get("plan") or {}
            action = plan.get("action", "chat")

            if action == "chat":
                self._log_diag("AI 判定为纯对话，无需绘图", "info")
                self.status.setText("就绪")
                return

            if action == "error":
                self._show_error(cmd, plan.get("response", "AI 错误"))
                return

            self._log_diag(f"步骤3/4: 生成 Scheme JSON 并执行绘图 (action={action})", "info")
            self.status.setText("正在执行绘图...")
            self._append_chat_safe("<div style='color:#888;font-size:12px;'><i>正在主线程执行 FreeCAD 绘图...</i></div>")

            # SKILL+CLI：保存 scheme JSON + Pipeline 绘图
            json_path = None
            scheme = None
            if self.orchestrator:
                try:
                    from core.chat_engine import ai_plan_to_scheme
                    mode = _draw_mode_from_index(self.draw_mode_combo.currentIndex())
                    scheme = ai_plan_to_scheme(plan, self.orchestrator.seq + 1, mode=mode)
                    json_path = self.orchestrator.save_scheme_json(scheme)
                    scheme_preview = json.dumps(scheme, ensure_ascii=False, indent=2)[:800]
                    self._append_chat_safe(
                        f"<div style='background:#f3e5f5;padding:6px;border-radius:4px;font-size:11px;'>"
                        f"<b>Scheme JSON</b> 已保存: {json_path}<br>"
                        f"<pre style='white-space:pre-wrap;'>{scheme_preview}...</pre></div>"
                    )
                except Exception as e:
                    self._append_chat_safe(f"<div style='color:#f44336;'>Scheme 保存失败: {e}</div>")

            import FreeCAD
            draw_start = time.time()
            exec_result = ""
            if action in ("create", "connect") and self.orchestrator and scheme:
                try:
                    from core.drawing_pipeline import DrawingPipeline
                    pipeline = DrawingPipeline(use_active_document=True)
                    gen = pipeline.apply_scheme(scheme)
                    meta = gen.get("metadata", {})
                    exec_result = (
                        f"已生成 {meta.get('object_count', 0)} 个设备, "
                        f"{meta.get('connection_count', 0)} 条连接"
                    )
                    self._log_diag(
                        f"步骤4/4: Pipeline 绘图完成 ({int(time.time() - draw_start)}s)",
                        "ok",
                    )
                except Exception as pipe_err:
                    self._log_diag(f"Pipeline 失败，回退 Executor: {pipe_err}", "warn")
                    if self.executor:
                        self.executor.doc = FreeCAD.ActiveDocument or FreeCAD.newDocument("CAD_Intelligence")
                        exec_result = self.executor.execute(plan)
            elif self.executor and action in ("create", "modify", "delete", "connect", "export"):
                self.executor.doc = FreeCAD.ActiveDocument
                if not self.executor.doc:
                    self.executor.doc = FreeCAD.newDocument("CAD_Intelligence")
                exec_result = self.executor.execute(plan)
                if self.executor.doc:
                    self.executor.doc.recompute()
                    try:
                        Gui.activeDocument().activeView().viewAxonometric()
                        Gui.SendMsgToActiveView("ViewFit")
                    except Exception:
                        pass
                self._log_diag(
                    f"步骤4/4: Executor 绘图完成 ({int(time.time() - draw_start)}s)",
                    "ok",
                )

            plan["exec_result"] = exec_result
            plan["json_path"] = json_path
            # 流式已展示 AI 文本，追加执行结果
            exec_result = plan.get("exec_result", "")
            if exec_result:
                self.chat_history.append(
                    f"<div style='background:#e8f5e9;padding:6px;border-radius:4px;margin:4px;font-size:12px;'>"
                    f"<b>执行结果:</b><br>{exec_result.replace(chr(10), '<br>')}</div>"
                )
        except Exception as e:
            self._log_diag(f"绘图阶段失败: {e}", "error")
            self._show_error(cmd, str(e))
        finally:
            total = int(time.time() - getattr(self, "_task_start_time", time.time()))
            self._log_diag(f"任务结束，总耗时 {total}s", "info")
            self.chat_input.setEnabled(True)
            self.status.setText("就绪")

    def _show_ai_result(self, cmd, result):
        """Display AI result in chat"""
        response = result.get("response", "")
        exec_result = result.get("exec_result", "")

        msg = f"<div style='background:#fff3e0; padding:8px; border-radius:6px; margin:4px;'>"
        msg += f"<b>AI:</b> {response}"
        if exec_result:
            msg += f"<br><br><b>执行结果:</b><br>{exec_result.replace(chr(10), '<br>')}"
        msg += "</div>"

        self.chat_history.append(msg)
        self.status.setText("就绪")

    def _show_result(self, cmd, result):
        """Display result in chat"""
        self.chat_history.append(f"<div style='background:#fff3e0; padding:8px; border-radius:6px; margin:4px;'><b>系统:</b> {result}</div>")
        self.status.setText("就绪")

    def _show_error(self, cmd, error):
        """Display error in chat"""
        self.chat_history.append(f"<div style='background:#ffebee; padding:8px; border-radius:6px; margin:4px;'><b>错误:</b> {error}</div>")
        self.status.setText("就绪")

    def _execute_fallback_command(self, cmd):
        """Fallback command execution without AI"""
        import FreeCAD
        
        cmd_lower = cmd.lower()
        
        doc = FreeCAD.ActiveDocument
        if not doc:
            try:
                doc = FreeCAD.newDocument("CAD_Intelligence")
            except Exception as e:
                return f"文档创建失败: {e}。请手动创建文档后重试。"

        if "泵" in cmd or "pump" in cmd_lower:
            return self._create_pump(doc)
        elif "阀" in cmd or "valve" in cmd_lower:
            return self._create_valve(doc)
        elif "容器" in cmd or "罐" in cmd or "tank" in cmd_lower:
            return self._create_vessel(doc)
        elif "换热器" in cmd or "heat" in cmd_lower:
            return self._create_heat_exchanger(doc)
        elif "反应器" in cmd or "reactor" in cmd_lower:
            return self._create_reactor(doc)
        elif "塔" in cmd or "column" in cmd_lower or "distill" in cmd_lower:
            return self._create_column(doc)
        elif "连接" in cmd or "connect" in cmd_lower:
            return self._connect_equipment(doc)
        elif "导出" in cmd or "export" in cmd_lower:
            return self._export_drawing(doc)
        elif "pfd" in cmd_lower:
            return self._draw_pfd(doc)
        elif "清空" in cmd or "删除" in cmd or "重新开始" in cmd:
            return self._clear_all(doc)
        else:
            return f"未识别指令: {cmd}\n\n支持的指令:\n- 创建泵/阀门/容器/换热器/反应器/塔器\n- 连接设备\n- 设计PFD\n- 导出图纸\n- 清空画布\n\n提示: 配置AI后可使用自然语言对话"

    def _create_pump(self, doc):
        import FreeCAD
        body = doc.addObject("Part::Cylinder", "PumpBody")
        body.Radius = 15
        body.Height = 30
        inlet = doc.addObject("Part::Cylinder", "Inlet")
        inlet.Radius = 5
        inlet.Height = 20
        inlet.Placement = FreeCAD.Placement(FreeCAD.Vector(0, 15, 0), FreeCAD.Rotation(90, 0, 0))
        outlet = doc.addObject("Part::Cylinder", "Outlet")
        outlet.Radius = 5
        outlet.Height = 20
        outlet.Placement = FreeCAD.Placement(FreeCAD.Vector(15, 0, 0), FreeCAD.Rotation(0, 90, 0))
        doc.recompute()
        return "已创建离心泵（P-1001）"

    def _create_valve(self, doc):
        import FreeCAD
        body = doc.addObject("Part::Sphere", "ValveBody")
        body.Radius = 10
        stem = doc.addObject("Part::Cylinder", "Stem")
        stem.Radius = 3
        stem.Height = 15
        stem.Placement = FreeCAD.Placement(FreeCAD.Vector(0, 0, 10), FreeCAD.Rotation(0, 0, 0))
        doc.recompute()
        return "已创建闸阀（V-1001）"

    def _create_vessel(self, doc):
        body = doc.addObject("Part::Cylinder", "VesselBody")
        body.Radius = 25
        body.Height = 60
        doc.recompute()
        return "已创建储罐（T-1001）"

    def _create_heat_exchanger(self, doc):
        body = doc.addObject("Part::Cylinder", "Shell")
        body.Radius = 20
        body.Height = 80
        doc.recompute()
        return "已创建管壳式换热器（E-1001）"

    def _create_reactor(self, doc):
        import FreeCAD
        body = doc.addObject("Part::Cylinder", "ReactorBody")
        body.Radius = 25
        body.Height = 40
        shaft = doc.addObject("Part::Cylinder", "AgitatorShaft")
        shaft.Radius = 3
        shaft.Height = 50
        shaft.Placement = FreeCAD.Placement(FreeCAD.Vector(0, 0, 20), FreeCAD.Rotation(0, 0, 0))
        doc.recompute()
        return "已创建搅拌反应器（R-1001）"

    def _create_column(self, doc):
        body = doc.addObject("Part::Cylinder", "ColumnBody")
        body.Radius = 20
        body.Height = 120
        doc.recompute()
        return "已创建精馏塔（C-1001）"

    def _connect_equipment(self, doc):
        import FreeCAD
        sel = Gui.Selection.getSelection()
        if len(sel) < 2:
            return "请先在3D视图中选择两个设备，然后再执行连接"
        pos1 = sel[0].Placement.Base
        pos2 = sel[1].Placement.Base
        direction = pos2 - pos1
        midpoint = (pos1 + pos2) / 2
        pipe = doc.addObject("Part::Cylinder", "Pipe")
        pipe.Radius = 3
        pipe.Height = direction.Length
        pipe.Placement = FreeCAD.Placement(midpoint, FreeCAD.Rotation(FreeCAD.Vector(0, 0, 1), direction))
        doc.recompute()
        return f"已连接 {sel[0].Label} 和 {sel[1].Label}"

    def _export_drawing(self, doc):
        path = os.path.join(os.path.expanduser("~"), "Desktop", f"{doc.Name}.FCStd")
        doc.saveAs(path)
        return f"已导出到: {path}"

    def _draw_pfd(self, doc):
        self._create_pump(doc)
        self._create_valve(doc)
        self._create_vessel(doc)
        return "已创建基本PFD布局（泵+阀+容器）"

    def _clear_all(self, doc):
        for obj in doc.Objects:
            doc.removeObject(obj.Name)
        doc.recompute()
        return "已清空所有对象"

    def _browse_json(self):
        path, _ = QtGui.QFileDialog.getOpenFileName(self, "选择JSON文件", "", "JSON (*.json)")
        if path:
            self.json_path.setText(path)

    def _generate(self):
        path = self.json_path.text().strip()
        if not path:
            return
        self.gen_log.append(f"开始生成: {path}")
        try:
            from core.drawing_pipeline import DrawingPipeline
            from parsers.json_parser import JSONParser

            parser = JSONParser()
            scheme = parser.parse(path)
            mode = _draw_mode_from_index(self.json_draw_mode_combo.currentIndex())
            scheme.setdefault("output_config", {})["drawing_type"] = mode
            mode_label = {
                "3d": "3D 模型", "pfd": "2D PFD",
                "pid": "2D P&ID", "layout": "2D 布置图",
                "isometric": "2D 单线图",
            }.get(mode, mode)
            self.gen_log.append(f"绘图模式: {mode_label}")

            pipeline = DrawingPipeline(use_active_document=True)
            result = pipeline.apply_scheme(scheme)
            if result.get("status") == "success":
                out_dir = os.path.dirname(path)
                base = os.path.splitext(os.path.basename(path))[0]
                fc_file = os.path.join(out_dir, f"{base}.FCStd")
                pipeline.save_active(fc_file)
                meta = result.get("metadata", {})
                extra = ""
                if meta.get("pipe_table_rows"):
                    extra = f" | 管道表 {meta.get('pipe_table_rows')} 行"
                if meta.get("instrument_count"):
                    extra += f" | 仪表 {meta.get('instrument_count')}"
                if meta.get("valve_count"):
                    extra += f" | 阀门 {meta.get('valve_count')}"
                if meta.get("stream_label_count"):
                    extra += f" | 物流标注 {meta.get('stream_label_count')}"
                if meta.get("equipment_table_rows"):
                    extra += f" | 设备表 {meta.get('equipment_table_rows')} 行"
                if meta.get("iso_table_rows"):
                    extra += f" | 管道表 {meta.get('iso_table_rows')} 行"
                self.gen_log.append(
                    f"生成完成: {fc_file} | 设备 {meta.get('object_count', 0)} | "
                    f"连接 {meta.get('connection_count', 0)}{extra}（文档保持打开，可导出 PDF）"
                )
            else:
                self.gen_log.append(f"生成失败: {result.get('error', '')}")
        except Exception as e:
            self.gen_log.append(f"错误: {str(e)}")

    def _populate_symbols(self, symbols):
        self.sym_tree.clear()
        for sym in symbols:
            item = QtGui.QTreeWidgetItem([sym.get("symbol_id", ""), sym.get("name", ""), sym.get("category", "")])
            item.setData(0, QtCore.Qt.UserRole, sym)
            self.sym_tree.addTopLevelItem(item)

    def _filter_symbols(self):
        search = self.sym_search.text().lower()
        cat_text = self.sym_cat.currentText()
        for i in range(self.sym_tree.topLevelItemCount()):
            item = self.sym_tree.topLevelItem(i)
            sym = item.data(0, QtCore.Qt.UserRole) or {}
            name = sym.get("name", "").lower()
            sid = sym.get("symbol_id", "").lower()
            cat = sym.get("category", "")
            match_search = not search or search in name or search in sid
            try:
                from core.symbol_geometry import ui_category_matches
                match_cat = ui_category_matches(cat_text, cat)
            except Exception:
                match_cat = cat_text == "全部" or cat == cat_text
            item.setHidden(not (match_search and match_cat))


class CadIntelligenceShowPanel:
    def GetResources(self):
        return {
            "MenuText": "AI 绘图面板",
            "ToolTip": "打开 CAD Intelligence AI 绘图控制面板",
            "Pixmap": "",
        }

    def Activated(self):
        show_panel_dialog()

    def IsActive(self):
        return True

class CadIntelligenceGenerateFromJSON:
    def GetResources(self):
        return {"MenuText": "从JSON生成图纸", "ToolTip": "选择JSON文件生成工程图（支持PFD/P&ID/布置/单线图）"}
    def Activated(self):
        try:
            mw = Gui.getMainWindow()
            path, _ = QtGui.QFileDialog.getOpenFileName(mw, "选择JSON文件", "", "JSON (*.json)")
            if not path:
                return
            from core.drawing_pipeline import DrawingPipeline
            pipeline = DrawingPipeline(use_active_document=True)
            result = pipeline.apply_json_file(path)
            if result.get("status") == "success":
                out_dir = os.path.dirname(path)
                base = os.path.splitext(os.path.basename(path))[0]
                fc_file = os.path.join(out_dir, f"{base}.FCStd")
                pipeline.save_active(fc_file)
                meta = result.get("metadata", {})
                QtGui.QMessageBox.information(
                    mw, "完成",
                    f"已生成: {fc_file}\n设备: {meta.get('object_count', 0)} "
                    f"连接: {meta.get('connection_count', 0)}\n（视口可见，文档未关闭）",
                )
            else:
                QtGui.QMessageBox.critical(mw, "失败", result.get("error", ""))
        except Exception as e:
            QtGui.QMessageBox.critical(Gui.getMainWindow(), "错误", str(e))
    def IsActive(self):
        return True

class CadIntelligenceShowSymbols:
    def GetResources(self):
        return {"MenuText": "符号库浏览", "ToolTip": "查看国家标准设备/仪表/管道符号"}
    def Activated(self):
        show_panel_dialog()
        if _panel is not None:
            _panel.tabs.setCurrentIndex(2)
    def IsActive(self):
        return True

class CadIntelligenceExportDrawing:
    def GetResources(self):
        return {"MenuText": "导出图纸", "ToolTip": "导出当前图纸（FCStd/STEP/PDF/DXF/CSV）"}
    def Activated(self):
        import FreeCAD
        from core.export_engine import ExportEngine
        doc = FreeCAD.ActiveDocument
        mw = Gui.getMainWindow()
        if not doc:
            QtGui.QMessageBox.warning(mw, "警告", "没有活动文档")
            return
        out_dir = os.path.join(os.path.expanduser("~"), "Desktop")
        base = doc.Name
        engine = ExportEngine()
        fc_path = os.path.join(out_dir, f"{base}.FCStd")
        step_path = os.path.join(out_dir, f"{base}.stp")
        fc = engine.export(doc, fc_path, "FCStd")
        step = engine.export(doc, step_path, "STEP")
        msg = f"FCStd: {fc.get('status')}\nSTEP: {step.get('status')}"
        # 有 TechDraw 图纸页时附带导出 PDF/DXF
        if engine._find_techdraw_page(doc) is not None:
            pdf = engine.export(doc, os.path.join(out_dir, f"{base}.pdf"), "PDF")
            dxf = engine.export(doc, os.path.join(out_dir, f"{base}.dxf"), "DXF")
            msg += f"\nPDF: {pdf.get('status')}"
            msg += f"\nDXF: {dxf.get('status')}"
        # 有 Spreadsheet 时附带导出 CSV
        sheets = [o for o in doc.Objects if o.TypeId == "Spreadsheet::Sheet"]
        if sheets:
            csv_res = engine.export(doc, os.path.join(out_dir, f"{base}_tables.csv"), "CSV")
            msg += f"\nCSV: {csv_res.get('status')}"
        if step.get("status") == "error":
            msg += f"\n{step.get('error', '')}"
        # 修订号提示
        rev = ""
        for o in doc.Objects:
            if o.Name == "PFD_Page" or o.Name == "PID_Page" or o.Name == "Layout_Page" or o.Name == "Iso_Page":
                if hasattr(o, "Template") and hasattr(o.Template, "EditableTexts"):
                    try:
                        texts = dict(o.Template.EditableTexts)
                        rev = texts.get("Revision", "")
                    except Exception:
                        pass
                break
        if rev:
            msg += f"\n修订: {rev}"
        msg += f"\n文件夹: {out_dir}"
        QtGui.QMessageBox.information(mw, "导出完成", msg)
    def IsActive(self):
        return True

class CadIntelligenceSettings:
    def GetResources(self):
        return {"MenuText": "AI 配置", "ToolTip": "配置 AI 模型和绘图参数"}
    def Activated(self):
        show_panel_dialog()
        if _panel is not None:
            _panel.tabs.setCurrentIndex(3)
    def IsActive(self):
        return True
