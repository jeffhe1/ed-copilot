from __future__ import annotations

import math
from collections import defaultdict

from .utils import tokenize


class BM25Index:
    def __init__(self, k1: float = 1.2, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.docs: dict[str, list[str]] = {}
        self.doc_len: dict[str, int] = {}
        self.inverted: dict[str, list[tuple[str, int]]] = defaultdict(list)
        self.total_docs = 0
        self.avg_doc_len = 0.0

    def add_documents(self, rows: list[dict[str, str]]) -> None:
        for row in rows:
            self.docs[row["qid"]] = tokenize(row["text"])
        self._rebuild()

    def remove_documents(self, qids: list[str]) -> None:
        for qid in qids:
            self.docs.pop(qid, None)
        self._rebuild()

    def _rebuild(self) -> None:
        self.doc_len.clear()
        self.inverted = defaultdict(list)
        total_len = 0

        for qid, tokens in self.docs.items():
            total_len += len(tokens)
            self.doc_len[qid] = len(tokens)
            tf: dict[str, int] = defaultdict(int)
            for t in tokens:
                tf[t] += 1
            for term, count in tf.items():
                self.inverted[term].append((qid, count))

        self.total_docs = len(self.docs)
        self.avg_doc_len = total_len / self.total_docs if self.total_docs else 0.0

    def search(self, query: str, top_k: int) -> list[dict[str, float]]:
        q_terms = set(tokenize(query))
        if not q_terms or self.total_docs == 0:
            return []

        scores: dict[str, float] = defaultdict(float)
        avgdl = max(self.avg_doc_len, 1.0)

        for term in q_terms:
            posting = self.inverted.get(term)
            if not posting:
                continue
            df = len(posting)
            idf = math.log(1 + (self.total_docs - df + 0.5) / (df + 0.5))
            for qid, tf in posting:
                dl = max(self.doc_len.get(qid, 0), 1)
                num = tf * (self.k1 + 1)
                den = tf + self.k1 * (1 - self.b + self.b * (dl / avgdl))
                scores[qid] += idf * (num / den)

        out = [{"qid": qid, "score": score} for qid, score in scores.items() if score > 0]
        out.sort(key=lambda x: x["score"], reverse=True)
        return out[:top_k]
