from __future__ import annotations

import heapq
from typing import List

try:
    import numpy as np
except Exception:  # pragma: no cover
    np = None

from .utils import cosine_similarity


class VectorIndex:
    def __init__(self):
        self.rows: dict[str, List[float]] = {}

    def upsert(self, rows: list[dict[str, list[float] | str]]) -> None:
        for row in rows:
            self.rows[str(row["qid"])] = list(row["vector"])  # type: ignore[arg-type]

    def remove(self, qids: list[str]) -> None:
        for qid in qids:
            self.rows.pop(qid, None)

    def search(self, vector: list[float], top_k: int) -> list[dict[str, float]]:
        if not vector:
            return []
        if np is not None and self.rows:
            return self._search_numpy(vector, top_k)
        return self._search_heap(vector, top_k)

    def _search_numpy(self, vector: list[float], top_k: int) -> list[dict[str, float]]:
        qids = list(self.rows.keys())
        mat = np.array([self.rows[q] for q in qids], dtype=np.float32)  # type: ignore[union-attr]
        q = np.array(vector, dtype=np.float32)  # type: ignore[union-attr]
        if mat.shape[1] != q.shape[0]:
            return []
        mat_norm = np.linalg.norm(mat, axis=1) + 1e-12  # type: ignore[union-attr]
        q_norm = np.linalg.norm(q) + 1e-12  # type: ignore[union-attr]
        sims = (mat @ q) / (mat_norm * q_norm)
        if top_k >= len(qids):
            idx = np.argsort(-sims)  # type: ignore[union-attr]
        else:
            partial = np.argpartition(-sims, top_k - 1)[:top_k]  # type: ignore[union-attr]
            idx = partial[np.argsort(-sims[partial])]  # type: ignore[union-attr]
        out: list[dict[str, float]] = []
        for i in idx.tolist():
            score = float(sims[i])
            if score > 0:
                out.append({"qid": qids[i], "score": score})
        return out

    def _search_heap(self, vector: list[float], top_k: int) -> list[dict[str, float]]:
        heap: list[tuple[float, str]] = []
        for qid, v in self.rows.items():
            if len(v) != len(vector):
                continue
            score = cosine_similarity(vector, v)
            if score <= 0:
                continue
            if len(heap) < top_k:
                heapq.heappush(heap, (score, qid))
            elif score > heap[0][0]:
                heapq.heapreplace(heap, (score, qid))
        out = [{"qid": qid, "score": score} for score, qid in sorted(heap, reverse=True)]
        return out
