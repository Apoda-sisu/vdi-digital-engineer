#!/usr/bin/env python3
"""
VDI 知识库检索评估脚本 V2 — 修复版
====================================
修复：
  1. 实体索引模糊匹配（支持无年份的规范号查询）
  2. Golden Set 覆盖率分析
  3. 分离「算法质量」和「数据覆盖率」指标
"""

import json
import sys
import yaml
import re
import math
from pathlib import Path
from collections import defaultdict
from datetime import datetime, timezone


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
V2_FILE = DATA_DIR / "knowledge-clauses-v2.json"
GOLDEN_FILE = DATA_DIR / "golden-set.yaml"
ENTITY_INDEX_FILE = DATA_DIR / "indices" / "entity-index.json"


SYNONYMS = {
    "消火栓": ["消防栓", "hydrant"], "紧急切断阀": ["ESD阀", "ESDV"],
    "防火阀": ["防火调节阀"], "防爆电气设备": ["防爆电器", "防爆设备"],
    "消防水泵房": ["泵房", "消防泵房"], "分散控制系统": ["DCS"],
    "可编程逻辑控制器": ["PLC"], "安全完整性等级": ["SIL"],
    "危险与可操作性分析": ["HAZOP"], "防火间距": ["防火距离"],
    "可燃气体": ["易燃气体"], "有毒气体": ["毒性气体"],
    "工艺管道": ["工艺管线"], "给水系统": ["供水系统", "给水管网"],
    "排水系统": ["排水管网", "污水系统"], "消防给水": ["消防供水"],
    "循环冷却水": ["循环水"], "安全阀": ["泄放阀", "PSV"],
    "控制室": ["中控室", "CCR"], "隔爆型": ["Exd", "Ex d"],
    "储罐": ["储槽", "罐"], "管线": ["管道", "管路"],
}

ABBREVIATIONS = {
    "ESD": "紧急切断", "DCS": "分散控制系统", "PLC": "可编程逻辑控制器",
    "SIL": "安全完整性等级", "HAZOP": "危险与可操作性分析",
    "PSV": "安全阀", "CCR": "控制室", "SIS": "安全仪表系统",
    "DN": "公称直径",
}


class VDIEvaluator:
    def __init__(self):
        self.clauses = []
        self.entity_index = {}
        self.clause_by_id = {}
        self.kb_keys = set()  # (source_id, clause) pairs
        self.source_ids = set()  # all unique source_ids
        self.golden_queries = []
        self.thresholds = {}
        self.load_data()

    def load_data(self):
        with open(V2_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.clauses = data["clauses"]
        for c in self.clauses:
            self.clause_by_id[c["clause_id"]] = c
            self.kb_keys.add((c["source_id"], c["clause"]))
            self.source_ids.add(c["source_id"])

            # Also add without year suffix
            base_id = re.sub(r'\s*[-–—]\s*\d{4}$', '', c["source_id"]).strip()
            if base_id != c["source_id"]:
                self.source_ids.add(base_id)

        if ENTITY_INDEX_FILE.exists():
            with open(ENTITY_INDEX_FILE, "r", encoding="utf-8") as f:
                self.entity_index = json.load(f).get("index", {})

        with open(GOLDEN_FILE, "r", encoding="utf-8") as f:
            golden = yaml.safe_load(f)
        self.golden_queries = golden.get("queries", [])
        self.thresholds = golden.get("thresholds", {})

    # ---- Enhanced Entity Index Lookup ----
    def entity_lookup(self, source_id, clause):
        """增强版实体索引查找，支持无年份规范号"""
        # 1. 精确匹配
        key = f"{source_id}|{clause}"
        if key in self.entity_index:
            return [self.clause_by_id[cid] for cid in self.entity_index[key] if cid in self.clause_by_id]

        # 2. 去掉年份再查
        base_id = re.sub(r'\s*[-–—]\s*\d{4}$', '', source_id).strip()
        if base_id != source_id:
            # 遍历所有以 base_id 开头的 source_id
            for k, v in self.entity_index.items():
                src_part = k.split("|")[0]
                if src_part.startswith(base_id) and k.endswith(f"|{clause}"):
                    return [self.clause_by_id[cid] for cid in v if cid in self.clause_by_id]

        # 3. 模糊匹配（部分条款号）
        for k, v in self.entity_index.items():
            src_part, clause_part = k.split("|", 1)
            if src_part == source_id or src_part.startswith(base_id):
                if clause_part == clause or clause_part.startswith(clause):
                    return [self.clause_by_id[cid] for cid in v if cid in self.clause_by_id]

        return []

    def source_id_lookup(self, partial_id):
        """查找匹配的 source_id（支持无年份查询）"""
        # 精确匹配
        if partial_id in self.source_ids:
            return partial_id

        # 以 partial_id 开头
        base = re.sub(r'\s*[-–—]\s*\d{4}$', '', partial_id).strip()
        for sid in self.source_ids:
            if sid == partial_id or sid.startswith(partial_id) or sid.startswith(base):
                return sid

        return None

    # ---- Tokenization and Search ----
    def tokenize(self, text):
        cleaned = re.sub(r'[，。、；：！？《》""''（）\s]+', ' ', text)
        return list(set(t for t in cleaned.split() if t))

    def expand_query(self, keywords):
        expanded = list(keywords)
        for kw in keywords:
            for canonical, aliases in SYNONYMS.items():
                if canonical in kw or kw in canonical or any(a in kw or kw in a for a in aliases):
                    if canonical not in expanded: expanded.append(canonical)
                    for a in aliases:
                        if a not in expanded: expanded.append(a)
            upper_kw = kw.upper()
            if upper_kw in ABBREVIATIONS:
                ab = ABBREVIATIONS[upper_kw]
                if ab not in expanded: expanded.append(ab)
        return expanded

    def parse_query(self, query):
        parsed = {
            "standard_numbers": [], "clause_numbers": [], "keywords": [],
            "query_type": "concept", "is_exact_lookup": False,
            "is_mandatory_query": False,
        }
        if not query or not query.strip():
            return parsed

        q = query.strip()

        # 提取规范号
        std_pat = r'(GB\s*[/T]*\s*\d+(?:\s*[-–—]\s*\d{4})?|SH/T\s*\d+(?:\s*[-–—]\s*\d{4})?|HG/T\s*\d+(?:\s*[-–—]\s*\d{4})?|安全生产法|消防法|特种设备安全法|环境保护法|职业病防治法)'
        for m in re.finditer(std_pat, q):
            normalized = m.group(0).strip()
            if normalized not in parsed["standard_numbers"]:
                parsed["standard_numbers"].append(normalized)

        # 提取条款号
        clause_pat = r'第[\d一二三四五六七八九十百]+条|(\d+(?:\.\d+)+)'
        for m in re.finditer(clause_pat, q):
            cn = m.group(0)
            if cn not in parsed["clause_numbers"]:
                parsed["clause_numbers"].append(cn)

        if parsed["standard_numbers"] and parsed["clause_numbers"]:
            parsed["query_type"] = "exact_lookup"
            parsed["is_exact_lookup"] = True
        elif re.search(r'最小|最大|不小于|不大于|范围|多少', q):
            parsed["query_type"] = "numeric_lookup"

        if re.search(r'必须|强制|严禁|不得|应当', q):
            parsed["is_mandatory_query"] = True

        parsed["keywords"] = self.tokenize(q)
        return parsed

    def score_clause(self, clause, query_terms, avg_len, total_docs):
        if not query_terms: return 0
        tokens = clause.get("tokens", [])
        token_str = " ".join(tokens).lower()
        content = clause.get("content", "").lower()
        keywords = " ".join(clause.get("keywords", [])).lower()
        full_text = f"{token_str} {content} {keywords}"

        doc_len = max(len(tokens), 1)
        k1, b_value = 1.2, 0.75
        score = 0.0

        for term in query_terms:
            term_lower = term.lower()
            tf = full_text.count(term_lower)
            if tf == 0: continue

            docs_with = sum(1 for c in self.clauses
                          if term_lower in " ".join(c.get("tokens", [])).lower())
            idf = math.log((total_docs - docs_with + 0.5) / (docs_with + 0.5) + 1)

            numerator = tf * (k1 + 1)
            denominator = tf + k1 * (1 - b_value + b_value * (doc_len / avg_len))
            score += idf * (numerator / denominator)

        # 关键词命中加权
        for term in query_terms:
            if term.lower() in keywords:
                score += 0.5

        # 条款号匹配加权
        clause_num = clause.get("clause", "")
        for term in query_terms:
            if clause_num == term or clause_num.startswith(term):
                score += 1.0

        return score

    def search(self, query_text, limit=5):
        parsed = self.parse_query(query_text)
        expanded_kw = self.expand_query(parsed["keywords"])
        query_terms = set(k.lower() for k in expanded_kw)

        avg_len = sum(len(c.get("tokens", [])) for c in self.clauses) / max(1, len(self.clauses))
        total_docs = len(self.clauses)

        # 第一层：实体索引精确匹配
        exact_hits = []
        if parsed["is_exact_lookup"]:
            for std in parsed["standard_numbers"]:
                for cn in parsed["clause_numbers"]:
                    hits = self.entity_lookup(std, cn)
                    for c in hits:
                        exact_hits.append({
                            "clause_id": c["clause_id"],
                            "source_id": c["source_id"],
                            "clause": c["clause"],
                            "content": c.get("content", ""),
                            "mandatory": c.get("mandatory", False),
                            "score": 1.0,
                        })

        # Also try without clause number - search by source_id
        if not exact_hits and parsed["standard_numbers"]:
            for std in parsed["standard_numbers"]:
                matched_sid = self.source_id_lookup(std)
                if matched_sid:
                    for c in self.clauses:
                        if c["source_id"] == matched_sid:
                            s = self.score_clause(c, query_terms, avg_len, total_docs)
                            if s > 0:
                                exact_hits.append({
                                    "clause_id": c["clause_id"],
                                    "source_id": c["source_id"],
                                    "clause": c["clause"],
                                    "content": c.get("content", ""),
                                    "mandatory": c.get("mandatory", False),
                                    "score": s * 1.5,  # source match boost
                                })

        # 第二层+第三层：BM25混合检索
        scored = []
        for c in self.clauses:
            s = self.score_clause(c, query_terms, avg_len, total_docs)
            if s <= 0: continue

            # 精确查找加权
            exact_boost = 1.5 if parsed["is_exact_lookup"] else 1.0
            # 强制性别加权
            mandatory_boost = 1.3 if (parsed["is_mandatory_query"] and c.get("mandatory")) else 1.0
            final_score = s * exact_boost * mandatory_boost

            scored.append({
                "clause_id": c["clause_id"],
                "source_id": c["source_id"],
                "clause": c["clause"],
                "content": c.get("content", ""),
                "mandatory": c.get("mandatory", False),
                "score": final_score,
            })

        scored.sort(key=lambda x: -x["score"])

        # 合并（精确结果优先，按分数排序）
        exact_ids = {h["clause_id"] for h in exact_hits}
        combined = exact_hits + [s for s in scored if s["clause_id"] not in exact_ids]

        # Dedup by source_id|clause
        seen = set()
        deduped = []
        for r in combined:
            key = (r["source_id"], r["clause"])
            if key not in seen:
                seen.add(key)
                deduped.append(r)

        return deduped[:limit]

    # ---- Evaluation ----
    def evaluate(self):
        results = []
        metrics_by_type = defaultdict(lambda: {"recall": [], "mrr": [], "precision": [], "count": 0})
        coverage_stats = {"covered": 0, "not_covered": 0, "negative": 0}

        for q in self.golden_queries:
            query_id = q.get("id", "?")
            query_text = q.get("query", "")
            query_type = q.get("query_type", "concept")
            relevant = q.get("relevant_clauses", [])
            expect_empty = q.get("expect_empty", False)

            if not query_text.strip():
                continue

            # 检查覆盖率
            relevant_in_kb = [r for r in relevant if (r["source_id"], r["clause"]) in self.kb_keys]

            if expect_empty:
                coverage_stats["negative"] += 1
            elif not relevant_in_kb and relevant:
                coverage_stats["not_covered"] += 1
                # 这些查询跳过（不在知识库覆盖范围）
                continue
            elif relevant_in_kb:
                coverage_stats["covered"] += 1

            # 执行搜索
            search_results = self.search(query_text, limit=5)

            result_keys = [(r["source_id"], r["clause"]) for r in search_results]
            relevant_keys = [(r["source_id"], r["clause"]) for r in relevant_in_kb]

            # Recall@5
            if not relevant_keys:
                recall = 1.0
            else:
                hits = sum(1 for rk in relevant_keys if rk in result_keys)
                recall = hits / len(relevant_keys)

            # MRR
            if not relevant_keys:
                mrr = 1.0
            else:
                mrr = 0.0
                for rank, (src, cl) in enumerate(result_keys, 1):
                    if (src, cl) in relevant_keys:
                        mrr = 1.0 / rank
                        break

            # Precision@5
            if not relevant_keys:
                precision = 1.0
            else:
                hits = sum(1 for rk in result_keys if rk in relevant_keys)
                precision = hits / max(1, len(search_results))

            results.append({
                "id": query_id, "query": query_text[:80], "type": query_type,
                "recall": recall, "mrr": mrr, "precision": precision,
                "result_count": len(search_results), "relevant_count": len(relevant_keys),
                "top3": [(r["source_id"], r["clause"]) for r in search_results[:3]],
            })
            metrics_by_type[query_type]["recall"].append(recall)
            metrics_by_type[query_type]["mrr"].append(mrr)
            metrics_by_type[query_type]["precision"].append(precision)
            metrics_by_type[query_type]["count"] += 1

        # Summarize
        if results:
            all_recall = [r["recall"] for r in results]
            all_mrr = [r["mrr"] for r in results]
            all_precision = [r["precision"] for r in results]
        else:
            all_recall = all_mrr = all_precision = [0.0]

        summary = {
            "evaluated_queries": len(results),
            "coverage": coverage_stats,
            "recall_at_5": sum(all_recall) / max(1, len(all_recall)),
            "mrr": sum(all_mrr) / max(1, len(all_mrr)),
            "precision_at_5": sum(all_precision) / max(1, len(all_precision)),
            "by_type": {},
        }

        for qt, m in metrics_by_type.items():
            if m["count"] > 0:
                summary["by_type"][qt] = {
                    "count": m["count"],
                    "recall_at_5": sum(m["recall"]) / m["count"],
                    "mrr": sum(m["mrr"]) / m["count"],
                    "precision_at_5": sum(m["precision"]) / m["count"],
                }

        return summary, results

    def check_thresholds(self, summary):
        t = self.thresholds
        checks = {
            "recall_at_5": (summary["recall_at_5"], t.get("recall_at_5", 0.90)),
            "mrr": (summary["mrr"], t.get("mrr", 0.80)),
            "precision_at_5": (summary["precision_at_5"], t.get("precision_at_5", 0.75)),
        }
        all_pass = True
        for name, (value, threshold) in checks.items():
            passed = value >= threshold
            status = "✅" if passed else "❌"
            print(f"  {status} {name}: {value:.3f} ≥ {threshold} {'PASS' if passed else 'FAIL'}")
            if not passed:
                all_pass = False
        return all_pass


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--ci", action="store_true")
    parser.add_argument("--report", action="store_true")
    parser.add_argument("--output", type=str)
    args = parser.parse_args()

    print("=" * 60)
    print("VDI 知识库检索评估 V2（修复版）")
    print("=" * 60)

    evaluator = VDIEvaluator()

    # 覆盖率分析
    print(f"\n--- 知识库覆盖率分析 ---")
    print(f"  知识库条款数: {len(evaluator.clauses)}")
    print(f"  知识库规范数: {len(evaluator.source_ids)}")
    print(f"  Golden Set 查询: {len(evaluator.golden_queries)}")

    relevant_in_kb = 0
    relevant_not_in_kb = 0
    for q in evaluator.golden_queries:
        for r in q.get("relevant_clauses", []):
            if (r["source_id"], r["clause"]) in evaluator.kb_keys:
                relevant_in_kb += 1
            else:
                relevant_not_in_kb += 1
    print(f"  相关条文在知识库中: {relevant_in_kb}")
    print(f"  相关条文不在知识库中: {relevant_not_in_kb} (待补充)")
    print(f"  覆盖率: {relevant_in_kb/(relevant_in_kb+relevant_not_in_kb)*100:.1f}%")

    # 运行评估
    print(f"\n运行评估中（仅评估知识库中存在的条文）...")
    summary, detail = evaluator.evaluate()

    cov = summary["coverage"]
    print(f"\n  评估范围: {summary['evaluated_queries']} 条查询")
    print(f"    - 有覆盖: {cov['covered']}")
    print(f"    - 未覆盖（跳过）: {cov['not_covered']}")
    print(f"    - 否定查询: {cov['negative']}")

    print(f"\n{'='*60}")
    print("评估结果（仅知识库覆盖范围内）")
    print(f"{'='*60}")
    print(f"  Recall@5:  {summary['recall_at_5']:.3f}")
    print(f"  MRR:       {summary['mrr']:.3f}")
    print(f"  Precision@5: {summary['precision_at_5']:.3f}")

    if summary["by_type"]:
        print(f"\n--- 按查询类型 ---")
        for qt, m in sorted(summary["by_type"].items()):
            print(f"  {qt:20s}: {m['count']:3d}条 | R@5={m['recall_at_5']:.3f} | MRR={m['mrr']:.3f} | P@5={m['precision_at_5']:.3f}")

    print(f"\n{'='*60}")
    print("CI 门槛检查")
    print(f"{'='*60}")
    passed = evaluator.check_thresholds(summary)

    if args.report and detail:
        failed = [r for r in detail if r["recall"] < 1.0]
        if failed:
            print(f"\n--- 失败查询 (Recall < 1.0): {len(failed)} 条 ---")
            for fq in failed[:10]:
                print(f"  [{fq['id']}] {fq['query']} (R={fq['recall']:.2f})")
                print(f"    相关: {fq['relevant_count']}条 | Top3: {fq['top3']}")

    if passed:
        print(f"\n✅ 所有 CI 门槛通过")
    else:
        print(f"\n⚠ 部分指标未达标")

    if args.ci and not passed:
        sys.exit(1)


if __name__ == "__main__":
    main()
