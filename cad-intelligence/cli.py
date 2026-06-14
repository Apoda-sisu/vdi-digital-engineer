#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CAD Intelligence CLI
命令行接口
"""

import sys
import json
import logging
from pathlib import Path
from typing import List, Optional

try:
    import click
except ImportError:
    print("错误: 需要安装click库")
    print("请运行: pip install click")
    sys.exit(1)

# 添加模块路径
sys.path.insert(0, str(Path(__file__).parent))

from core.geometry_engine import GeometryEngine
from core.drawing_engine import DrawingEngine
from core.export_engine import ExportEngine
from parsers.json_parser import JSONParser


# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@click.group()
@click.version_option(version="2.0.0", prog_name="cad-intelligence")
def cli():
    """CAD Intelligence - 智能绘图模块 V2.0
    
    基于FreeCAD的智能绘图工具，根据设计方案或自然语言自动生成：
    - 2D PFD/P&ID 工程图
    - 3D 参数化设备模型
    - 设备布置图、等轴测图
    - 智能布局与约束验证
    """
    pass


@cli.command()
@click.option('--input', '-i', 'input_path', required=True, type=click.Path(exists=True),
              help='输入JSON文件路径')
@click.option('--output', '-o', 'output_dir', default='./output', type=click.Path(),
              help='输出目录路径')
@click.option('--format', '-f', 'formats', multiple=True, default=['FCStd'],
              type=click.Choice(['FCStd', 'STEP', 'IGES', 'PDF', 'DXF', 'STL']),
              help='输出格式')
@click.option('--mode', '-m', 'mode', default=None,
              type=click.Choice(['pfd', 'pid', 'layout', 'isometric', '3d']),
              help='绘图模式（覆盖 JSON 中 output_config.drawing_type）')
def generate(input_path: str, output_dir: str, formats: tuple, mode: Optional[str]):
    """从JSON生成工程图（2D PFD 或 3D 模型）
    
    示例: cad-intelligence generate --input input.json --output output/ --mode pfd
    """
    try:
        click.echo(f"开始生成工程图...")
        click.echo(f"输入文件: {input_path}")
        click.echo(f"输出目录: {output_dir}")
        click.echo(f"输出格式: {', '.join(formats)}")
        
        # 解析输入
        parser = JSONParser()
        input_data = parser.parse(input_path)
        if mode:
            input_data.setdefault("output_config", {})["drawing_type"] = mode
        
        # 创建输出目录
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        # 生成图纸（统一管线，按 drawing_type 分发 2D/3D）
        from core.drawing_pipeline import DrawingPipeline
        pipeline = DrawingPipeline(use_active_document=False)
        result = pipeline.apply_scheme(input_data)
        
        if result["status"] != "success":
            click.echo(f"生成失败: {result.get('error', '未知错误')}", err=True)
            sys.exit(1)
        click.echo(f"绘制完成: {result.get('metadata', {})}")
        
        # 保存FreeCAD文档
        base_name = input_data.get("project_info", {}).get("drawing_number", "drawing")
        freecad_file = output_path / f"{base_name}.FCStd"
        
        save_result = pipeline.save_active(str(freecad_file))
        if save_result["status"] != "success":
            click.echo(f"保存FreeCAD文档失败: {save_result.get('error', '未知错误')}", err=True)
            sys.exit(1)
        
        # 批量导出
        export_engine = ExportEngine()
        export_result = export_engine.batch_export(
            pipeline.doc, str(output_dir), list(formats), base_name
        )
        
        # 输出结果
        click.echo("\n生成完成!")
        click.echo(f"FreeCAD文档: {freecad_file}")
        
        for fmt, res in export_result["results"].items():
            if res["status"] == "success":
                click.echo(f"{fmt}文件: {res['output_path']}")
            else:
                click.echo(f"{fmt}导出失败: {res.get('error', '未知错误')}", err=True)
        
        # 清理
        pipeline.close()
        
    except Exception as e:
        click.echo(f"错误: {e}", err=True)
        logger.exception("生成工程图时发生错误")
        sys.exit(1)


@cli.command()
@click.option('--category', '-c', type=click.Choice(['equipment', 'instruments', 'piping', 'annotations']),
              help='符号类别筛选')
@click.option('--list', '-l', 'list_all', is_flag=True, help='列出所有符号')
def symbols(category: Optional[str], list_all: bool):
    """查看符号库
    
    示例: cad-intelligence symbols --category equipment
    """
    try:
        engine = GeometryEngine()
        
        if list_all or category is None:
            symbols_list = engine.list_symbols()
        else:
            symbols_list = engine.list_symbols(category=category)
        
        if not symbols_list:
            click.echo("没有找到符号")
            return
        
        click.echo(f"找到 {len(symbols_list)} 个符号:")
        click.echo("-" * 60)
        
        for sym in symbols_list:
            symbol_id = sym.get("symbol_id", "N/A")
            name = sym.get("name", "N/A")
            category = sym.get("category", "N/A")
            standard = sym.get("standard", "N/A")
            
            click.echo(f"ID: {symbol_id}")
            click.echo(f"  名称: {name}")
            click.echo(f"  类别: {category}")
            click.echo(f"  标准: {standard}")
            click.echo()
        
        engine.close()
        
    except Exception as e:
        click.echo(f"错误: {e}", err=True)
        sys.exit(1)


@cli.command()
@click.option('--input', '-i', 'input_path', required=True, type=click.Path(exists=True),
              help='输入JSON文件路径')
def validate(input_path: str):
    """验证输入文件
    
    示例: cad-intelligence validate --input input.json
    """
    try:
        click.echo(f"验证输入文件: {input_path}")
        
        parser = JSONParser()
        input_data = parser.parse(input_path)
        
        click.echo("验证通过!")
        click.echo(f"输入类型: {input_data.get('input_type')}")
        click.echo(f"项目ID: {input_data.get('project_info', {}).get('project_id')}")
        
        geometry = input_data.get("geometry", {})
        click.echo(f"对象数量: {len(geometry.get('objects', []))}")
        click.echo(f"连接数量: {len(geometry.get('connections', []))}")
        
    except Exception as e:
        click.echo(f"验证失败: {e}", err=True)
        sys.exit(1)


@cli.command('chat')
@click.option('--prompt', '-p', required=True, help='自然语言绘图指令')
@click.option('--output', '-o', 'output_dir', default='./output', type=click.Path(), help='输出目录')
@click.option('--dry-run', is_flag=True, help='仅生成 scheme JSON，不调用 FreeCAD')
def chat(prompt: str, output_dir: str, dry_run: bool):
    """AI 对话生成工程图（SKILL+CLI 路径）

    示例: python -m cad-intelligence chat -p "创建一个离心泵P-1001和一个储罐T-1001"
    """
    try:
        import json as _json
        from pathlib import Path as _Path

        config_path = _Path(__file__).parent / 'config.json'
        with open(config_path, 'r', encoding='utf-8') as f:
            config = _json.load(f)
        ai_cfg = config.get('ai', {})

        from core.ai_engine import AIEngine
        from core.chat_engine import ChatOrchestrator, ai_plan_to_scheme

        provider = ai_cfg.get('provider', 'openai')
        if provider == 'ollama':
            engine = AIEngine(
                provider='ollama',
                model=ai_cfg.get('ollama_model', 'qwen3.5:9b-mlx'),
                ollama_base=ai_cfg.get('ollama_base', 'http://127.0.0.1:11434'),
            )
        else:
            api_key = ai_cfg.get('api_key', '')
            if not api_key:
                click.echo('错误: 未配置 AI api_key', err=True)
                sys.exit(1)
            engine = AIEngine(
                provider='openai',
                api_key=api_key,
                api_base=ai_cfg.get('api_base', 'https://api.openai.com/v1'),
                model=ai_cfg.get('model', 'gpt-4o-mini'),
            )

        orch = ChatOrchestrator(engine, on_status=lambda m: click.echo(f'  [{m}]'))
        click.echo(f'指令: {prompt}')

        def on_token(token):
            click.echo(token, nl=False)
            sys.stdout.flush()

        click.echo('AI: ', nl=False)
        parsed = orch.parse_only_stream(prompt, on_token=on_token)
        click.echo('')

        if not parsed.get('success'):
            click.echo(f"AI 失败: {parsed.get('error')}", err=True)
            sys.exit(1)

        plan = parsed['plan']
        click.echo(f"AI action: {plan.get('action')}")
        click.echo(f"AI 回复: {plan.get('response', '')}")

        if plan.get('action') == 'chat':
            return

        scheme = ai_plan_to_scheme(plan)
        json_path = orch.save_scheme_json(scheme)
        click.echo(f'Scheme JSON: {json_path}')

        if dry_run:
            click.echo('dry-run 模式，跳过 FreeCAD 生成')
            return

        result = orch.run_cli_generate(json_path, output_dir)
        if result['success']:
            click.echo(result['stdout'])
            click.echo(f'输出目录: {result["output_dir"]}')
        else:
            click.echo(result['stderr'], err=True)
            sys.exit(1)
    except Exception as e:
        click.echo(f'错误: {e}', err=True)
        logger.exception('chat 命令失败')
        sys.exit(1)


@cli.command()
def info():
    """显示模块信息"""
    click.echo("CAD Intelligence - 智能绘图模块")
    click.echo("版本: 1.3.0")
    click.echo("描述: 基于FreeCAD的AI智能绘图工具")
    click.echo("")
    click.echo("支持的输入格式:")
    click.echo("  - scheme: 结构化JSON数据（drawing_type: pfd=2D 工程图, 3d=三维模型）")
    click.echo("  - chat: 自然语言 -> AI -> scheme JSON -> generate")
    click.echo("")
    click.echo("支持的输出格式:")
    click.echo("  - FCStd: FreeCAD原生格式")
    click.echo("  - STEP: STEP AP214格式")
    click.echo("  - IGES: IGES格式")
    click.echo("  - PDF: TechDraw 图纸页 PDF（需 GUI）")
    click.echo("  - DXF: TechDraw 图纸页 DXF（支持无头）")
    click.echo("  - STL: STL网格格式")
    click.echo("")
    click.echo("支持的绘图标准:")
    click.echo("  - GB/T 2625-1981")
    click.echo("  - HG/T 20559.2-1993")
    click.echo("  - GB/T 50106-2010")


def main():
    """主入口"""
    cli()


if __name__ == "__main__":
    main()