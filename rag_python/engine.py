from __future__ import annotations

import json
import math
import time
from dataclasses import asdict
from typing import Any, Dict, List, Optional
import logging

from .bm25 import BM25Index
from .embedding import DeterministicHashEmbedder, Embedder
from .fingerprint import build_exact_hash, build_template_hash
from .ingestion import parse_questions_from_file
from .local_store import load_questions_jsonl, save_questions_jsonl
from .reranker import rerank_pair_score
from .scoring import fuse_hybrid_scores, score_dense, score_image, score_sparse
from .types import (
    EvalMetrics,
    EvalRecord,
    IngestedQuestion,
    IngestionInput,
    QueryInput,
    QuestionDocument,
    QuestionImage,
    RAGConfig,
    RetrievalResponse,
    RetrievalResult,
)
from .utils import stable_hash
from .vector_index import VectorIndex


class HybridQuestionRAGPy:
    def __init__(
        self,
        config: Optional[RAGConfig] = None,
        embedder: Optional[Embedder] = None,
        logger: Optional[logging.Logger] = None,
    ):
        self.config = config or RAGConfig()
        self.embedder = embedder or DeterministicHashEmbedder(self.config.dense_dim)
        self.logger = logger or logging.getLogger("rag.engine")
        self.docs: Dict[str, QuestionDocument] = {}
        self.vectors: Dict[str, Dict[str, List[float]]] = {}
        self.exact_hash_map: Dict[str, str] = {}
        self.template_hash_map: Dict[str, List[str]] = {}
        self.bm25 = BM25Index()
        self.stem_index = VectorIndex()
        self.explanation_index = VectorIndex()
        self.image_index = VectorIndex()
        self.image_owner: Dict[str, str] = {}

    def ingest(self, payload: IngestionInput | dict) -> List[IngestedQuestion]:
        self.logger.info("Ingest start")
        inp = payload if isinstance(payload, IngestionInput) else IngestionInput(**payload)
        normalized = self._normalize_input(inp)
        self.logger.info("Normalized incoming questions: %d", len(normalized))
        out: List[IngestedQuestion] = []

        for q in normalized:
            matched_exact = self.exact_hash_map.get(q.fingerprints["exact_hash"])
            if matched_exact:
                out.append(IngestedQuestion(question=q, status="exact-duplicate", matched_qid=matched_exact, score=1.0))
                continue

            near = self._find_near_duplicate(q)
            if near and near["score"] >= self.config.near_duplicate_threshold:
                out.append(
                    IngestedQuestion(
                        question=q,
                        status="near-duplicate",
                        matched_qid=near["qid"],
                        score=near["score"],
                    )
                )
            else:
                out.append(IngestedQuestion(question=q, status="new"))

            self._store_question(q)

        self._rebuild_indexes()
        self.logger.info("Ingest done: total_docs=%d", len(self.docs))
        return out

    def retrieve(self, q: QueryInput | dict) -> RetrievalResponse:
        started = time.time()
        query = q if isinstance(q, QueryInput) else QueryInput(**q)
        self.logger.info("Retrieve start: text_len=%d question_id=%s", len(query.text or ""), query.question_id)
        query_text = self._resolve_query_text(query)
        top_k = query.top_k or self.config.bm25_top_k
        top_m = query.top_m or self.config.rerank_top_m
        top_n = query.top_n or self.config.final_top_n

        filtered_qids = self._filter_qids(query)
        if not filtered_qids:
            self.logger.warning("Retrieve empty due to filters. filters=%s", query.filters)
            return RetrievalResponse(
                took_ms=int((time.time() - started) * 1000),
                query=query,
                counts={
                    "bm25Candidates": 0,
                    "denseCandidates": 0,
                    "imageCandidates": 0,
                    "fusedCandidates": 0,
                    "rerankedCandidates": 0,
                    "finalResults": 0,
                },
                results=[],
            )

        bm25_hits = score_sparse(self.bm25, query_text, top_k, filtered_qids)
        q_vector = self.embedder.encode(query_text) if query_text else []
        dense_hits = score_dense(self.stem_index, self.explanation_index, q_vector, self.config.dense_top_k, filtered_qids)
        image_hits = score_image(self.image_index, self.image_owner, query.image_vector, self.config.image_top_k, filtered_qids)
        fused = fuse_hybrid_scores(bm25_hits, dense_hits, image_hits, self.config, bool(query.image_vector))
        rerank_candidates = fused[:top_m]

        bm25_map = {x["qid"]: x["score"] for x in bm25_hits}
        dense_map = {x["qid"]: x["score"] for x in dense_hits}
        image_map = {x["qid"]: x["score"] for x in image_hits}

        reranked = []
        for cand in rerank_candidates:
            doc = self.docs.get(cand["qid"])
            if not doc:
                continue
            doc_text = "\n".join([doc.stem, *doc.options, doc.explanation or ""])
            dense_score = dense_map.get(doc.qid, 0.0)
            rr = rerank_pair_score(query_text, doc_text, dense_score, self.embedder)
            reranked.append(
                {
                    "qid": doc.qid,
                    "score": cand["score"],
                    "rerank_score": rr,
                    "bm25_score": bm25_map.get(doc.qid),
                    "dense_score": dense_score,
                    "image_score": image_map.get(doc.qid),
                    "question": doc,
                }
            )
        reranked.sort(key=lambda x: x["rerank_score"], reverse=True)

        results: List[RetrievalResult] = []
        for row in reranked[:top_n]:
            results.append(
                RetrievalResult(
                    qid=row["qid"],
                    score=row["score"],
                    bm25_score=row["bm25_score"],
                    dense_score=row["dense_score"],
                    image_score=row["image_score"],
                    rerank_score=row["rerank_score"],
                    duplicate_class=self._classify(row["rerank_score"]),
                    reason=self._reason_text(row),
                    question=row["question"],
                )
            )

        return RetrievalResponse(
            took_ms=int((time.time() - started) * 1000),
            query=query,
            counts={
                "bm25Candidates": len(bm25_hits),
                "denseCandidates": len(dense_hits),
                "imageCandidates": len(image_hits),
                "fusedCandidates": len(fused),
                "rerankedCandidates": len(reranked),
                "finalResults": len(results),
            },
            results=results,
        )

    def evaluate(self, records: List[EvalRecord]) -> EvalMetrics:
        if not records:
            return EvalMetrics(0.0, 0.0, 0.0)
        recall_hits = 0
        recall_total = 0
        mrr_sum = 0.0
        ndcg_sum = 0.0

        for rec in records:
            source = self.docs.get(rec.query_qid)
            if not source:
                continue
            resp = self.retrieve(QueryInput(text=source.stem, top_n=200))
            ranked = [r.qid for r in resp.results]
            relevant = set(rec.relevant_qids)
            if not relevant:
                continue

            recall_hits += len([qid for qid in ranked[:200] if qid in relevant])
            recall_total += len(relevant)

            rr = 0.0
            for i, qid in enumerate(ranked[:10]):
                if qid in relevant:
                    rr = 1.0 / (i + 1)
                    break
            mrr_sum += rr

            dcg = 0.0
            for i, qid in enumerate(ranked[:20]):
                if qid in relevant:
                    dcg += 1.0 / math.log2(i + 2)
            ideal_count = min(20, len(relevant))
            idcg = sum(1.0 / math.log2(i + 2) for i in range(ideal_count))
            ndcg_sum += (dcg / idcg) if idcg > 0 else 0.0

        denom = max(1, len(records))
        return EvalMetrics(
            recall_at_k=(recall_hits / recall_total) if recall_total > 0 else 0.0,
            mrr_at_10=mrr_sum / denom,
            ndcg_at_20=ndcg_sum / denom,
        )

    def save_local_bank(self, path: str) -> int:
        count = save_questions_jsonl(path, self.docs.values())
        self.logger.info("Saved local bank: path=%s count=%d", path, count)
        return count

    def load_local_bank(self, path: str) -> int:
        rows = load_questions_jsonl(path)
        if not rows:
            self.logger.warning("Local bank load: file empty or not found. path=%s", path)
            return 0
        self.docs = {}
        self.vectors = {}
        self.exact_hash_map = {}
        self.template_hash_map = {}
        payload = IngestionInput(questions=rows)
        self.ingest(payload)
        self.logger.info("Loaded local bank: path=%s count=%d", path, len(self.docs))
        return len(self.docs)

    def to_json(self) -> str:
        return json.dumps(
            {
                "config": asdict(self.config),
                "docs": [asdict(v) for v in self.docs.values()],
            },
            ensure_ascii=False,
            indent=2,
        )

    def _normalize_input(self, inp: IngestionInput) -> List[QuestionDocument]:
        out: List[QuestionDocument] = []
        for i, row in enumerate(inp.questions or []):
            stem = self._resolve_stem(row)
            qid = row.get("qid") or (f"q_{row.get('id')}" if row.get("id") is not None else f"q_{stable_hash(f'{stem}:{i}')}")
            options = self._normalize_options(row.get("options"))
            explanation = self._resolve_explanation(row)
            answer = self._normalize_answer(row.get("answer"))
            images = self._normalize_images(row.get("images") or [], qid)
            metadata = self._normalize_metadata(row)
            out.append(
                QuestionDocument(
                    qid=qid,
                    stem=stem,
                    options=options,
                    answer=answer,
                    explanation=explanation,
                    images=images,
                    tags=list(row.get("tags") or []),
                    metadata=metadata,
                    fingerprints={
                        "exact_hash": build_exact_hash(stem, options, answer),
                        "template_hash": build_template_hash(stem),
                    },
                )
            )

        for file_row in inp.files or []:
            parsed = parse_questions_from_file(file_row)
            for p in parsed:
                file_id = file_row.get("fileId", "f")
                question_no = p.get("source_question_no")
                stem_text = p.get("stem", "")
                qid = f"q_{stable_hash(f'{file_id}:{question_no}:{stem_text}')}"
                out.append(
                    QuestionDocument(
                        qid=qid,
                        stem=p["stem"],
                        options=list(p.get("options") or []),
                        answer=p.get("answer"),
                        explanation=p.get("explanation"),
                        images=[],
                        tags=[],
                        metadata={
                            "sourceMimeType": file_row.get("mimeType"),
                            "scanned": bool(file_row.get("scanned")),
                        },
                        fingerprints={
                            "exact_hash": build_exact_hash(p["stem"], list(p.get("options") or []), p.get("answer")),
                            "template_hash": build_template_hash(p["stem"]),
                        },
                        source={"fileId": file_row.get("fileId"), "questionNo": p.get("source_question_no")},
                    )
                )
        return out

    def _resolve_stem(self, row: dict) -> str:
        return str(row.get("stem") or row.get("stem_md") or "").strip()

    def _resolve_explanation(self, row: dict) -> Optional[str]:
        value = row.get("explanation")
        if value is None:
            value = row.get("explanation_md")
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    def _normalize_options(self, options: Any) -> List[str]:
        if isinstance(options, dict):
            return [str(options[k]).strip() for k in ("A", "B", "C", "D") if k in options and str(options[k]).strip()]
        if isinstance(options, list):
            return [str(x).strip() for x in options if str(x).strip()]
        return []

    def _normalize_answer(self, answer: Any) -> Optional[str]:
        if answer is None:
            return None
        text = str(answer).strip().upper()
        return text or None

    def _normalize_metadata(self, row: dict) -> Dict[str, Any]:
        metadata = dict(row.get("metadata") or {})
        if row.get("id") is not None and "source_id" not in metadata:
            metadata["source_id"] = row.get("id")
        for key in ("area", "subject", "topic", "difficulty"):
            if row.get(key) is not None and key not in metadata:
                metadata[key] = row.get(key)
        if isinstance(row.get("skillIds"), list) and "skillIds" not in metadata:
            metadata["skillIds"] = list(row.get("skillIds") or [])
        return metadata

    def _normalize_images(self, rows: list[dict], qid: str) -> List[QuestionImage]:
        out: List[QuestionImage] = []
        for idx, img in enumerate(rows):
            image_id = img.get("imageId") or f"{qid}_img_{idx + 1}"
            image_vector = img.get("imageVector")
            if not image_vector:
                image_vector = self.embedder.encode(f"{img.get('caption', '')}\n{img.get('ocrText', '')}")
            out.append(
                QuestionImage(
                    image_id=image_id,
                    path=img.get("path"),
                    ocr_text=img.get("ocrText"),
                    caption=img.get("caption"),
                    image_vector=image_vector,
                )
            )
        return out

    def _find_near_duplicate(self, q: QuestionDocument) -> Optional[dict]:
        qv = self.embedder.encode("\n".join([q.stem, *q.options]))
        hits = self.stem_index.search(qv, 5)
        return hits[0] if hits else None

    def _store_question(self, q: QuestionDocument) -> None:
        self.docs[q.qid] = q
        self.exact_hash_map[q.fingerprints["exact_hash"]] = q.qid
        self.template_hash_map.setdefault(q.fingerprints["template_hash"], []).append(q.qid)
        stem_vec = self.embedder.encode("\n".join([q.stem, *q.options]))
        exp_vec = self.embedder.encode(q.explanation) if q.explanation else None
        self.vectors[q.qid] = {"stem": stem_vec, "exp": exp_vec or []}

    def _rebuild_indexes(self) -> None:
        docs = list(self.docs.values())
        self.bm25 = BM25Index()
        self.stem_index = VectorIndex()
        self.explanation_index = VectorIndex()
        self.image_index = VectorIndex()
        self.image_owner = {}

        self.bm25.add_documents(
            [
                {
                    "qid": d.qid,
                    # Improvement: field-weighted sparse doc (stem duplicated to increase weight).
                    "text": "\n".join(
                        [
                            d.stem,
                            d.stem,
                            *d.options,
                            d.explanation or "",
                            " ".join((i.ocr_text or "") for i in d.images),
                            " ".join((i.caption or "") for i in d.images),
                            json.dumps(d.metadata, ensure_ascii=False),
                        ]
                    ),
                }
                for d in docs
            ]
        )
        self.stem_index.upsert([{"qid": d.qid, "vector": self.vectors[d.qid]["stem"]} for d in docs])
        self.explanation_index.upsert(
            [{"qid": d.qid, "vector": self.vectors[d.qid]["exp"]} for d in docs if self.vectors[d.qid]["exp"]]
        )
        image_rows = []
        for d in docs:
            for img in d.images:
                if not img.image_vector:
                    continue
                image_rows.append({"qid": img.image_id, "vector": img.image_vector})
                self.image_owner[img.image_id] = d.qid
        self.image_index.upsert(image_rows)

    def _resolve_query_text(self, query: QueryInput) -> str:
        if query.text and query.text.strip():
            return query.text.strip()
        if query.question_id:
            d = self.docs.get(query.question_id)
            return d.stem if d else ""
        return ""

    def _filter_qids(self, query: QueryInput) -> set[str]:
        f = query.filters or {}
        out = set()
        for d in self.docs.values():
            md = d.metadata or {}
            if f.get("subject") and md.get("subject") != f.get("subject"):
                continue
            if f.get("gradeLevel") and md.get("gradeLevel") != f.get("gradeLevel"):
                continue
            if f.get("difficulty") and md.get("difficulty") != f.get("difficulty"):
                continue
            if f.get("questionType") and md.get("questionType") != f.get("questionType"):
                continue
            if f.get("examBoard") and md.get("examBoard") != f.get("examBoard"):
                continue
            if f.get("year") is not None and md.get("year") != f.get("year"):
                continue
            out.add(d.qid)
        return out

    def _classify(self, score: float):
        if score >= self.config.duplicate_threshold:
            return "duplicate"
        if score >= self.config.near_duplicate_threshold:
            return "near-duplicate"
        if score >= 0.65:
            return "similar"
        return "related"

    def _reason_text(self, row: dict) -> str:
        parts = []
        if row.get("bm25_score") is not None:
            parts.append(f"bm25={row['bm25_score']:.3f}")
        if row.get("dense_score") is not None:
            parts.append(f"dense={row['dense_score']:.3f}")
        if row.get("image_score") is not None:
            parts.append(f"image={row['image_score']:.3f}")
        parts.append(f"rerank={row['rerank_score']:.3f}")
        return ", ".join(parts)
