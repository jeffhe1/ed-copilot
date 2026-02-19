from __future__ import annotations

from .embedding import Embedder
from .utils import clamp01, tokenize


def _token_overlap(a: str, b: str) -> float:
    sa = set(tokenize(a))
    sb = set(tokenize(b))
    if not sa or not sb:
        return 0.0
    inter = len(sa.intersection(sb))
    return inter / max(1, min(len(sa), len(sb)))


def rerank_pair_score(query_text: str, doc_text: str, dense_score: float, embedder: Embedder) -> float:
    overlap = _token_overlap(query_text, doc_text)
    qv = embedder.encode(query_text)
    dv = embedder.encode(doc_text)
    cos = sum(x * y for x, y in zip(qv, dv))
    return clamp01(0.5 * overlap + 0.3 * clamp01((cos + 1) / 2) + 0.2 * clamp01((dense_score + 1) / 2))
