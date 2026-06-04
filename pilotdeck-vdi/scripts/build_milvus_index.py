#!/usr/bin/env python3
"""
VDI Milvus Lite 索引构建器
===========================
从 knowledge-clauses-v2.json 构建 Milvus Lite 向量索引。
支持：
  - 标量字段索引（discipline, source_id, mandatory, hierarchy）
  - BM25 稀疏向量（通过 Milvus 内置分析器）
  - 稠密向量（通过在线 API 嵌入）
  - 混合搜索（BM25 + 向量 + RRF 融合）

用法：
  python build_milvus_index.py [--embedding-api KEY] [--collection vdi_knowledge_v2]
"""

import json
import sys
import os
from pathlib import Path
from datetime import datetime, timezone

try:
    from pymilvus import (
        MilvusClient, DataType, Collection, connections,
        utility, FieldSchema, CollectionSchema
    )
    from pymilvus.milvus_client import MilvusClient as MC
    HAS_MILVUS = True
except ImportError:
    HAS_MILVUS = False


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
V2_FILE = DATA_DIR / "knowledge-clauses-v2.json"
MILVUS_DB = str(DATA_DIR / "milvus_lite.db")
COLLECTION_NAME = "vdi_knowledge_v2"
DIMENSION = 1024  # 嵌入向量维度


def create_schema():
    """创建 Milvus 集合 Schema"""
    fields = [
        FieldSchema(name="id", dtype=DataType.VARCHAR, max_length=64, is_primary=True),
        FieldSchema(name="clause_id", dtype=DataType.VARCHAR, max_length=32),
        FieldSchema(name="source_id", dtype=DataType.VARCHAR, max_length=128),
        FieldSchema(name="version", dtype=DataType.VARCHAR, max_length=32),
        FieldSchema(name="discipline", dtype=DataType.VARCHAR, max_length=32),
        FieldSchema(name="clause", dtype=DataType.VARCHAR, max_length=32),
        FieldSchema(name="content", dtype=DataType.VARCHAR, max_length=4096),
        FieldSchema(name="source_type", dtype=DataType.VARCHAR, max_length=32),
        FieldSchema(name="mandatory", dtype=DataType.BOOL),
        FieldSchema(name="keywords", dtype=DataType.ARRAY, element_type=DataType.VARCHAR, max_capacity=32, max_length=64),
        FieldSchema(name="hierarchy_chapter", dtype=DataType.VARCHAR, max_length=16),
        FieldSchema(name="hierarchy_section", dtype=DataType.VARCHAR, max_length=16),
        FieldSchema(name="hierarchy_article", dtype=DataType.VARCHAR, max_length=16),
        FieldSchema(name="has_cross_refs", dtype=DataType.BOOL),
        FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=DIMENSION),
        # BM25 稀疏向量（Milvus 2.4+ 原生支持）
        FieldSchema(name="sparse_vector", dtype=DataType.SPARSE_FLOAT_VECTOR),
    ]

    schema = CollectionSchema(fields=fields, description="VDI 知识库增强索引 V2", enable_dynamic_field=True)
    return schema


def build_collection(force_recreate=False):
    """构建/重建 Milvus 集合"""
    if not HAS_MILVUS:
        print("❌ pymilvus 未安装，请运行: pip install pymilvus>=2.4.0")
        return None

    # 连接 Milvus Lite
    connections.connect(uri=str(MILVUS_DB))

    # 删除旧集合
    if force_recreate and utility.has_collection(COLLECTION_NAME):
        utility.drop_collection(COLLECTION_NAME)
        print(f"  ✓ 已删除旧集合: {COLLECTION_NAME}")

    if utility.has_collection(COLLECTION_NAME):
        print(f"  ✓ 集合已存在: {COLLECTION_NAME}")
        return Collection(COLLECTION_NAME)

    schema = create_schema()
    collection = Collection(name=COLLECTION_NAME, schema=schema)
    print(f"  ✓ 创建集合: {COLLECTION_NAME} (维度: {DIMENSION})")

    # 创建索引
    index_params = {
        "metric_type": "COSINE",
        "index_type": "HNSW",
        "params": {"M": 16, "efConstruction": 200},
    }
    collection.create_index(field_name="embedding", index_params=index_params)
    print("  ✓ 创建 HNSW 向量索引")

    # BM25 稀疏向量索引
    collection.create_index(
        field_name="sparse_vector",
        index_params={
            "metric_type": "IP",
            "index_type": "SPARSE_INVERTED_INDEX",
            "params": {"drop_ratio_build": 0.2},
        }
    )
    print("  ✓ 创建 BM25 稀疏向量索引")

    return collection


def load_clauses():
    """加载增强索引"""
    with open(V2_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["clauses"]


def insert_data(collection, clauses, embedding_client=None):
    """批量插入数据到 Milvus"""
    batch_size = 100
    total = 0

    for i in range(0, len(clauses), batch_size):
        batch = clauses[i:i + batch_size]
        entities = []

        for c in batch:
            # 生成 BM25 稀疏向量（使用 jieba 分词模拟，Milvus 可使用内置分析器）
            # 这里先用占位稀疏向量，实际使用时应配置 Milvus analyzer
            sparse_dict = {hash(w) % 100000: 1.0 for w in c.get("tokens", [])[:50]}

            # 稠密向量 — 使用占位零向量（实际使用时替换为 API 调用结果）
            dense_vector = [0.0] * DIMENSION
            if embedding_client:
                try:
                    dense_vector = embedding_client.embed(c["content"])
                except Exception as e:
                    print(f"    ⚠ 嵌入失败 ({c['source_id']} §{c['clause']}): {e}")

            hierarchy = c.get("hierarchy", {})
            entity = {
                "id": c["clause_id"],
                "clause_id": c["clause_id"],
                "source_id": c["source_id"],
                "version": c.get("version", ""),
                "discipline": c.get("discipline", "") or "general",
                "clause": c["clause"],
                "content": c["content"],
                "source_type": c.get("source_type", "standard"),
                "mandatory": c.get("mandatory", False),
                "keywords": c.get("keywords", [])[:32],
                "hierarchy_chapter": hierarchy.get("chapter", ""),
                "hierarchy_section": hierarchy.get("section", ""),
                "hierarchy_article": hierarchy.get("article", ""),
                "has_cross_refs": len(c.get("outgoing_refs", [])) > 0,
                "embedding": dense_vector,
                "sparse_vector": sparse_dict,
            }
            entities.append(entity)

        collection.insert(entities)
        total += len(entities)
        print(f"\r  ✓ 已插入: {total}/{len(clauses)}", end="", flush=True)

    print()
    collection.flush()
    print(f"  ✓ 插入完成: {total} 条")


def search_hybrid(collection, query_text, discipline=None, top_k=5):
    """混合检索：BM25 + 向量 + RRF 融合"""
    from pymilvus import AnnSearchRequest, RRFRanker

    # 1. 向量搜索（稠密）
    query_vector = [0.0] * DIMENSION  # 占位，实际应为 embedding(query_text)

    vector_req = AnnSearchRequest(
        data=[query_vector],
        anns_field="embedding",
        param={"metric_type": "COSINE", "params": {"ef": 100}},
        limit=top_k * 3,
    )

    # 2. BM25 搜索（稀疏）
    sparse_dict = {hash(w) % 100000: 1.0 for w in query_text.split()[:30]}
    sparse_req = AnnSearchRequest(
        data=[sparse_dict],
        anns_field="sparse_vector",
        param={"metric_type": "IP"},
        limit=top_k * 3,
    )

    # 3. RRF 融合
    ranker = RRFRanker(k=60)
    results = collection.hybrid_search(
        reqs=[vector_req, sparse_req],
        rerank=ranker,
        limit=top_k,
        output_fields=["source_id", "clause", "content", "discipline", "mandatory"],
    )

    return results[0] if results else []


def main():
    print("=" * 60)
    print("VDI Milvus Lite 索引构建器")
    print("=" * 60)

    if not HAS_MILVUS:
        print("❌ 请先安装 pymilvus: pip install pymilvus>=2.4.0")
        sys.exit(1)

    # 加载数据
    print("\n[1/4] 加载增强索引...")
    clauses = load_clauses()
    print(f"  ✓ 加载 {len(clauses)} 条条款")

    # 构建集合
    print("\n[2/4] 构建 Milvus 集合...")
    collection = build_collection(force_recreate=True)
    if collection is None:
        sys.exit(1)

    # 插入数据
    print(f"\n[3/4] 插入数据到 Milvus...")
    # embedding_client = OpenAIClient()  # 实际使用时替换
    insert_data(collection, clauses, embedding_client=None)

    # 加载集合到内存
    print("\n[4/4] 加载集合到内存...")
    collection.load()
    print(f"  ✓ 集合已加载，共 {collection.num_entities} 条实体")

    # 测试搜索
    print("\n--- 测试混合搜索 ---")
    results = search_hybrid(collection, "消防给水管径要求", discipline="water")
    for i, hit in enumerate(results):
        print(f"  {i+1}. [{hit.entity.get('source_id')} §{hit.entity.get('clause')}] "
              f"(分数: {hit.score:.4f})")

    print("\n" + "=" * 60)
    print("✅ Milvus Lite 索引构建完成")
    print(f"   数据库: {MILVUS_DB}")
    print(f"   集合: {COLLECTION_NAME}")
    print(f"   实体数: {collection.num_entities}")
    print("=" * 60)


if __name__ == "__main__":
    main()
