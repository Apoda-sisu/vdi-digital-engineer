#!/usr/bin/env python3
"""
VDI 知识库增强索引构建器 V2
==============================
将 knowledge-clauses.json 升级为增强版 schema：
  - 专业拆分索引
  - 实体索引（规范号+条款号精确匹配）
  - 章/节/条层级结构
  - 跨引用关系预解析（outgoing_refs + incoming_refs）
  - 强制性标记
  - 条款唯一ID (clause_id)
  - 结构化表格数据支持

输出：
  - pilotdeck-vdi/data/knowledge-clauses-v2.json  （增强版全量索引）
  - pilotdeck-vdi/data/indices/{discipline}.json  （专业拆分索引）
  - pilotdeck-vdi/data/indices/entity-index.json   （实体精确索引）
  - pilotdeck-vdi/data/indices/cross-refs.json     （跨引用关系图）
"""

import json
import re
import hashlib
import os
from pathlib import Path
from collections import defaultdict
from datetime import datetime, timezone


# ============================================================
# 配置
# ============================================================
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
INDICES_DIR = DATA_DIR / "indices"
INPUT_FILE = DATA_DIR / "knowledge-clauses.json"
OUTPUT_FILE = DATA_DIR / "knowledge-clauses-v2.json"
ENTITY_INDEX_FILE = INDICES_DIR / "entity-index.json"
CROSS_REFS_FILE = INDICES_DIR / "cross-refs.json"
DOMAIN_DICT_FILE = DATA_DIR / "domain-dictionary.yaml"


# ============================================================
# 领域词典（同义词/缩写映射）
# ============================================================
DOMAIN_DICTIONARY = {
    "synonyms": {
        "消火栓": ["消防栓", "hydrant"],
        "消防栓": ["消火栓"],
        "紧急切断阀": ["ESD阀", "ESDV", "紧急关断阀", "切断阀"],
        "防火阀": ["防火调节阀", "防烟防火阀"],
        "防爆电气设备": ["防爆电器", "防爆设备", "Ex设备"],
        "消防水泵房": ["泵房", "消防泵房", "消防泵站"],
        "分散控制系统": ["DCS", "DCS系统"],
        "可编程逻辑控制器": ["PLC", "PLC控制器"],
        "安全完整性等级": ["SIL", "SIL等级"],
        "危险与可操作性分析": ["HAZOP", "HAZOP分析"],
        "防火间距": ["防火距离", "安全间距"],
        "可燃气体": ["可燃性气体", "易燃气体"],
        "有毒气体": ["毒性气体", "毒气"],
        "工艺管道": ["工艺管线", "工艺流程管道"],
        "给水系统": ["供水系统", "给水管网", "配水管网"],
        "排水系统": ["排水管网", "污水系统", "废水系统"],
        "消防给水": ["消防供水", "消防用水"],
        "循环冷却水": ["循环水", "冷却循环水"],
        "安全阀": ["泄放阀", "安全泄放阀", "PSV"],
        "控制室": ["中控室", "中心控制室", "CCR"],
        "隔爆型": ["Exd", "Ex d", "隔爆"],
        "本安型": ["Exi", "Ex i", "本安"],
        "储罐": ["储槽", "贮罐", "罐"],
        "管线": ["管道", "管路"],
        "法兰": ["flange"],
        "焊接": ["welding"],
    },
    "abbreviations": {
        "ESD": "紧急切断",
        "DCS": "分散控制系统",
        "PLC": "可编程逻辑控制器",
        "SIL": "安全完整性等级",
        "HAZOP": "危险与可操作性分析",
        "PSV": "安全阀",
        "CCR": "控制室",
        "PFD": "工艺流程图",
        "PID": "管道仪表流程图",
        "SIS": "安全仪表系统",
        "DN": "公称直径",
        "PN": "公称压力",
    },
    "discipline_aliases": {
        "water": ["给排水", "给水", "排水", "消防给水"],
        "fire": ["消防", "防火", "灭火"],
        "process": ["工艺", "化工工艺"],
        "piping": ["管道", "配管", "管线"],
        "instrument": ["仪表", "自控", "仪控"],
        "electrical": ["电气", "供配电"],
        "equipment": ["设备", "静设备", "动设备"],
        "hse": ["安全", "环保", "职业卫生", "HSE"],
    },
    "standard_aliases": {
        "GB 50160": ["GB50160", "GB-50160", "石化防火规范"],
        "GB 50016": ["GB50016", "GB-50016", "建规", "建筑防火规范"],
        "GB 50974": ["GB50974", "GB-50974", "消水规", "消防给水规范"],
        "GB 50058": ["GB50058", "GB-50058", "爆炸危险环境规范"],
        "GB 50014": ["GB50014", "GB-50014", "排水规范"],
        "GB 50013": ["GB50013", "GB-50013", "给水规范"],
        "SH/T 3006": ["SHT3006", "SH-T-3006", "控制室规范"],
        "SH/T 3059": ["SHT3059", "SH-T-3059", "管道器材规范"],
        "GB 150": ["GB150", "GB-150", "压力容器规范"],
        "GB/T 151": ["GBT151", "GB-T-151", "热交换器规范"],
        "GB/T 50770": ["GBT50770", "GB-T-50770", "安全仪表规范"],
        "GB 50493": ["GB50493", "GB-50493", "可燃有毒气体检测规范"],
        "SH/T 3011": ["SHT3011", "SH-T-3011", "工艺装置规范"],
    },
}


# ============================================================
# 跨引用正则模式
# ============================================================
CROSS_REF_PATTERNS = [
    # "应符合 GB 50016 的有关规定"
    re.compile(r'应符合(?:现行国家标准|现行行业标准)?[《]?(GB\s*[\d/T]+(?:\s*[-–—]\s*\d{4})?)[》]?(?:的|中)?(?:有关)?(?:规定|要求)'),
    # "应符合《工业金属管道设计规范》GB 50316 的规定"
    re.compile(r'[《]([^》]+)[》]\s*(GB\s*[\d/T]+(?:\s*[-–—]\s*\d{4})?)'),
    # "参照 SH/T 3007"
    re.compile(r'(?:参照|参见|参考|执行)\s*(GB\s*[\d/T]+(?:\s*[-–—]\s*\d{4})?|SH/T\s*\d+(?:\s*[-–—]\s*\d{4})?|HG/T\s*\d+(?:\s*[-–—]\s*\d{4})?)'),
    # "应符合下列规定" — 指向同一规范的后续条款
    re.compile(r'应符合下列规定'),
]


# ============================================================
# 辅助函数
# ============================================================
def generate_clause_id(source_id, version, clause):
    """生成唯一条款ID"""
    raw = f"{source_id}|{version}|{clause}"
    return hashlib.md5(raw.encode()).hexdigest()[:12]


def parse_clause_hierarchy(clause_str, source_id):
    """解析条款号的层级结构
    如 "5.2.3.1" -> { chapter: "5", section: "5.2", article: "5.2.3", paragraph: "5.2.3.1" }
    如 "第4条" -> { article: "第4条" }
    """
    hierarchy = {"raw": clause_str}

    # 法律条文格式："第X条"
    if clause_str.startswith("第") and "条" in clause_str:
        hierarchy["article"] = clause_str
        return hierarchy

    # 数字格式："5.2.3.1"
    parts = clause_str.strip().split(".")
    if len(parts) >= 1 and parts[0].isdigit():
        hierarchy["chapter"] = parts[0]
    if len(parts) >= 2:
        hierarchy["section"] = ".".join(parts[:2])
    if len(parts) >= 3:
        hierarchy["article"] = ".".join(parts[:3])
    if len(parts) >= 4:
        hierarchy["paragraph"] = ".".join(parts[:4])

    return hierarchy


def is_mandatory(source_id, version, content):
    """判断是否为强制性条文
    规则：
    1. GB（非GB/T）标准为全文强制
    2. 法律（安全生产法、消防法等）为强制
    3. 条文中出现"必须""严禁""不得"等强制性措辞
    """
    # 法律强制
    if any(law in source_id for law in ["安全生产法", "消防法", "特种设备安全法", "环境保护法", "职业病防治法"]):
        return True

    # GB强制（非GB/T推荐）
    if source_id.startswith("GB ") and not source_id.startswith("GB/T "):
        return True

    # 内容中包含强制性措辞
    mandatory_keywords = ["必须", "严禁", "不得", "禁止", "应当建立", "强制性"]
    if any(kw in content for kw in mandatory_keywords):
        return True

    return False


def extract_cross_references(content):
    """从条文内容中提取跨规范引用"""
    refs = []
    for pattern in CROSS_REF_PATTERNS:
        for match in pattern.finditer(content):
            groups = match.groups()
            if len(groups) >= 1:
                target = groups[-1].strip() if groups[-1] else groups[0].strip()
                # 标准化规范号
                target_normalized = normalize_standard_id(target)
                if target_normalized and target_normalized not in [r["target"] for r in refs]:
                    refs.append({
                        "target": target_normalized,
                        "raw_text": match.group(0),
                        "type": "normative" if "必须" not in match.group(0) else "mandatory",
                    })
    return refs


def normalize_standard_id(raw):
    """标准化规范号
    "GB 50016" -> "GB 50016"
    "GB50316" -> "GB 50316"
    "GB-50016" -> "GB 50016"
    """
    raw = raw.strip()
    # 在字母和数字之间加空格
    raw = re.sub(r'(GB|SH|HG)([/T]*)\s*[-–—]*\s*(\d+)', r'\1\2 \3', raw)
    return raw


def build_discipline_indices(clauses):
    """按专业拆分索引"""
    indices = defaultdict(list)
    for c in clauses:
        disc = c.get("discipline", "") or "general"
        indices[disc].append(c["clause_id"])

    # 写入专业索引文件
    INDICES_DIR.mkdir(parents=True, exist_ok=True)
    for disc, clause_ids in indices.items():
        disc_file = INDICES_DIR / f"{disc}.json"
        disc_clauses = [c for c in clauses if c["clause_id"] in clause_ids]
        with open(disc_file, "w", encoding="utf-8") as f:
            json.dump({
                "discipline": disc,
                "count": len(disc_clauses),
                "clauses": disc_clauses,
            }, f, ensure_ascii=False, indent=2)

    print(f"  ✓ 专业索引: {len(indices)} 个专业")
    for disc, ids in sorted(indices.items()):
        print(f"    {disc}: {len(ids)} 条")
    return indices


def build_entity_index(clauses):
    """构建实体精确索引（规范号+条款号 exact match）"""
    entity_index = {}
    for c in clauses:
        key = f"{c['source_id']}|{c['clause']}"
        if key not in entity_index:
            entity_index[key] = []
        entity_index[key].append(c["clause_id"])

        # 别名索引（如 "GB50160" -> "GB 50160"）
        aliases = DOMAIN_DICTIONARY.get("standard_aliases", {}).get(c["source_id"], [])
        for alias in aliases:
            alias_key = f"{alias}|{c['clause']}"
            if alias_key not in entity_index:
                entity_index[alias_key] = []
            if c["clause_id"] not in entity_index[alias_key]:
                entity_index[alias_key].append(c["clause_id"])

    with open(ENTITY_INDEX_FILE, "w", encoding="utf-8") as f:
        json.dump({
            "version": 2,
            "built_at": datetime.now(timezone.utc).isoformat(),
            "total_keys": len(entity_index),
            "index": entity_index,
        }, f, ensure_ascii=False, indent=2)

    print(f"  ✓ 实体索引: {len(entity_index)} 个精确查找键")
    return entity_index


def build_cross_reference_graph(clauses):
    """构建跨引用关系图"""
    graph = {"outgoing": defaultdict(list), "incoming": defaultdict(list)}

    for c in clauses:
        for ref in c.get("outgoing_refs", []):
            target = ref["target"]
            graph["outgoing"][c["clause_id"]].append({
                "target_standard": target,
                "type": ref["type"],
                "context": ref.get("raw_text", ""),
            })
            graph["incoming"][target].append({
                "from_clause_id": c["clause_id"],
                "from_source": c["source_id"],
                "from_clause": c["clause"],
                "context": ref.get("raw_text", ""),
            })

    # 转换 defaultdict 为普通 dict
    graph["outgoing"] = dict(graph["outgoing"])
    graph["incoming"] = dict(graph["incoming"])

    with open(CROSS_REFS_FILE, "w", encoding="utf-8") as f:
        json.dump({
            "version": 2,
            "built_at": datetime.now(timezone.utc).isoformat(),
            "total_outgoing": sum(len(v) for v in graph["outgoing"].values()),
            "total_incoming": sum(len(v) for v in graph["incoming"].values()),
            "graph": graph,
        }, f, ensure_ascii=False, indent=2)

    print(f"  ✓ 跨引用图: {sum(len(v) for v in graph['outgoing'].values())} 条出向引用, "
          f"{sum(len(v) for v in graph['incoming'].values())} 条入向引用")
    return graph


# ============================================================
# 主流程
# ============================================================
def main():
    print("=" * 60)
    print("VDI 知识库增强索引构建器 V2")
    print("=" * 60)

    # 1. 加载原始索引
    print("\n[1/5] 加载原始知识索引...")
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    clauses = data["clauses"]
    print(f"  ✓ 加载 {len(clauses)} 条条款")

    # 2. 增强每条条款
    print("\n[2/5] 增强条款元数据...")
    enhanced_clauses = []
    stats = {
        "with_cross_refs": 0,
        "mandatory": 0,
        "total_outgoing_refs": 0,
    }

    for i, c in enumerate(clauses):
        clause_id = generate_clause_id(c["source_id"], c["version"], c["clause"])

        # 层级解析
        hierarchy = parse_clause_hierarchy(c["clause"], c["source_id"])

        # 强制性别
        mandatory = is_mandatory(c["source_id"], c["version"], c["content"])

        # 跨引用解析
        outgoing_refs = extract_cross_references(c["content"])

        enhanced = {
            "clause_id": clause_id,
            "source_type": c["source_type"],
            "source_id": c["source_id"],
            "version": c["version"],
            "effective_date": c.get("effective_date", ""),
            "discipline": c.get("discipline", ""),
            "clause": c["clause"],
            "content": c["content"],
            "keywords": c.get("keywords", []),
            "tokens": c.get("tokens", []),
            "file": c.get("file", ""),
            # 新增字段
            "hierarchy": hierarchy,
            "mandatory": mandatory,
            "outgoing_refs": outgoing_refs,
            "incoming_refs": [],  # 第二步回填
            "has_table": False,   # 后续扫描填充
            "tables": [],         # 结构化表格数据
        }

        enhanced_clauses.append(enhanced)

        if outgoing_refs:
            stats["with_cross_refs"] += 1
            stats["total_outgoing_refs"] += len(outgoing_refs)
        if mandatory:
            stats["mandatory"] += 1

    print(f"  ✓ 增强完成")
    print(f"    含跨引用: {stats['with_cross_refs']} 条 ({stats['total_outgoing_refs']} 个引用)")
    print(f"    强制性: {stats['mandatory']} 条")

    # 3. 回填 incoming_refs
    print("\n[3/5] 回填反向引用关系...")
    incoming_map = defaultdict(list)
    for c in enhanced_clauses:
        for ref in c["outgoing_refs"]:
            target = ref["target"]
            incoming_map[target].append({
                "from_clause_id": c["clause_id"],
                "from_source": c["source_id"],
                "from_clause": c["clause"],
                "raw_text": ref.get("raw_text", ""),
                "type": ref.get("type", "normative"),
            })

    for c in enhanced_clauses:
        key = c["source_id"]
        c["incoming_refs"] = incoming_map.get(key, [])

    print(f"  ✓ 回填完成")

    # 4. 写入增强版全量索引
    print("\n[4/5] 写入增强版索引文件...")
    output_data = {
        "schema_version": 2,
        "built_at": datetime.now(timezone.utc).isoformat(),
        "knowledge_root": str(DATA_DIR),
        "stats": {
            "total_clauses": len(enhanced_clauses),
            "with_cross_refs": stats["with_cross_refs"],
            "mandatory": stats["mandatory"],
            "total_outgoing_refs": stats["total_outgoing_refs"],
            "disciplines": {},
        },
        "domain_dictionary": DOMAIN_DICTIONARY,
        "clauses": enhanced_clauses,
    }

    # 统计各专业数量
    disc_counts = defaultdict(int)
    for c in enhanced_clauses:
        disc = c.get("discipline", "") or "general"
        disc_counts[disc] += 1
    output_data["stats"]["disciplines"] = dict(disc_counts)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print(f"  ✓ 写入: {OUTPUT_FILE}")

    # 5. 构建拆分索引
    print("\n[5/5] 构建拆分索引...")
    build_discipline_indices(enhanced_clauses)
    build_entity_index(enhanced_clauses)
    build_cross_reference_graph(enhanced_clauses)

    # 6. 写入领域词典
    with open(DOMAIN_DICT_FILE, "w", encoding="utf-8") as f:
        f.write("# VDI 领域词典 — 同义词/缩写/标准别名\n")
        f.write(f"# 自动生成于 {datetime.now(timezone.utc).isoformat()}\n")
        yaml_content = json.dumps(DOMAIN_DICTIONARY, ensure_ascii=False, indent=2)
        f.write(yaml_content)
    print(f"  ✓ 领域词典: {DOMAIN_DICT_FILE}")

    print("\n" + "=" * 60)
    print("✅ 增强索引构建完成")
    print(f"   总条款: {len(enhanced_clauses)}")
    print(f"   含跨引用: {stats['with_cross_refs']}")
    print(f"   强制性: {stats['mandatory']}")
    print(f"   实体索引键: {len(DOMAIN_DICTIONARY.get('standard_aliases', {})) + len(enhanced_clauses)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
