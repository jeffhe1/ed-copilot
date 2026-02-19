from __future__ import annotations

from .bm25 import BM25Index
from .fusion import rrf_fuse
from .types import RAGConfig
from .vector_index import VectorIndex


def score_sparse(bm25: BM25Index, query_text: str, top_k: int, allowed_qids: set[str]) -> list[dict]:
    if not query_text.strip():
        return []
    return [x for x in bm25.search(query_text, top_k) if x["qid"] in allowed_qids]


def score_dense(
    stem_index: VectorIndex,
    explanation_index: VectorIndex,
    query_vector: list[float],
    top_k: int,
    allowed_qids: set[str],
) -> list[dict]:
    if not query_vector:
        return []
    stem = stem_index.search(query_vector, top_k)
    exp = explanation_index.search(query_vector, top_k)
    merged: dict[str, float] = {}
    for row in stem:
        merged[row["qid"]] = max(merged.get(row["qid"], -1), row["score"])
    for row in exp:
        merged[row["qid"]] = max(merged.get(row["qid"], -1), row["score"])
    out = [{"qid": qid, "score": score} for qid, score in merged.items() if qid in allowed_qids]
    out.sort(key=lambda x: x["score"], reverse=True)
    return out[:top_k]


def score_image(
    image_index: VectorIndex,
    image_owner: dict[str, str],
    image_vector: list[float] | None,
    top_k: int,
    allowed_qids: set[str],
) -> list[dict]:
    if not image_vector:
        return []
    raw = image_index.search(image_vector, top_k)
    merged: dict[str, float] = {}
    for row in raw:
        qid = image_owner.get(row["qid"])
        if not qid or qid not in allowed_qids:
            continue
        merged[qid] = max(merged.get(qid, -1), row["score"])
    out = [{"qid": qid, "score": score} for qid, score in merged.items()]
    out.sort(key=lambda x: x["score"], reverse=True)
    return out


def _normalize_by_max(rows: list[dict]) -> dict[str, float]:
    if not rows:
        return {}
    mx = max(x["score"] for x in rows)
    if mx <= 0:
        return {}
    return {x["qid"]: x["score"] / mx for x in rows}


def fuse_hybrid_scores(
    bm25_hits: list[dict],
    dense_hits: list[dict],
    image_hits: list[dict],
    config: RAGConfig,
    has_image_query: bool,
) -> list[dict]:
    # Improvement: auto-rebalance image weight when no image query.
    sparse_w, dense_w, image_w = config.sparse_weight, config.dense_weight, config.image_weight
    if not has_image_query and image_w > 0:
        spare = image_w
        sparse_w += spare * 0.5
        dense_w += spare * 0.5
        image_w = 0.0

    bm25_norm = _normalize_by_max(bm25_hits)
    dense_norm = _normalize_by_max(dense_hits)
    image_norm = _normalize_by_max(image_hits)
    rrf = rrf_fuse([bm25_hits, dense_hits, image_hits], config.rrf_k)
    rrf_norm = _normalize_by_max(rrf)

    qids = set()
    for rows in (bm25_hits, dense_hits, image_hits, rrf):
        for row in rows:
            qids.add(row["qid"])

    out = []
    for qid in qids:
        score = (
            sparse_w * bm25_norm.get(qid, 0.0)
            + dense_w * dense_norm.get(qid, 0.0)
            + image_w * image_norm.get(qid, 0.0)
            + config.rrf_weight * rrf_norm.get(qid, 0.0)
        )
        if score > 0:
            out.append({"qid": qid, "score": score})
    out.sort(key=lambda x: x["score"], reverse=True)
    return out
