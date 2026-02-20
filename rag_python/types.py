from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional, TypedDict


DuplicateClass = Literal["duplicate", "near-duplicate", "similar", "related"]
DedupStatus = Literal["new", "exact-duplicate", "near-duplicate"]


@dataclass
class QuestionImage:
    image_id: str
    path: Optional[str] = None
    ocr_text: Optional[str] = None
    caption: Optional[str] = None
    image_vector: Optional[List[float]] = None


@dataclass
class QuestionDocument:
    qid: str
    stem: str
    options: List[str]
    answer: Optional[str] = None
    explanation: Optional[str] = None
    images: List[QuestionImage] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    fingerprints: Dict[str, str] = field(default_factory=dict)
    source: Optional[Dict[str, Any]] = None


class MCQOptions(TypedDict):
    A: str
    B: str
    C: str
    D: str


@dataclass
class GeneratedQuestion:
    id: int
    stem_md: str
    options: MCQOptions
    answer: Optional[str] = None
    explanation_md: Optional[str] = None
    area: Optional[str] = None
    subject: Optional[str] = None
    topic: Optional[str] = None
    skillIds: List[str] = field(default_factory=list)
    difficulty: Optional[int] = None


@dataclass
class GeneratedQuestionPayload:
    version: int = 1
    questions: List[GeneratedQuestion] = field(default_factory=list)


@dataclass
class IngestedQuestion:
    question: QuestionDocument
    status: DedupStatus
    matched_qid: Optional[str] = None
    score: Optional[float] = None


@dataclass
class IngestionInput:
    version: Optional[int] = None
    questions: List[Dict[str, Any]] = field(default_factory=list)
    files: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class QueryInput:
    text: Optional[str] = None
    image_vector: Optional[List[float]] = None
    question_id: Optional[str] = None
    filters: Dict[str, Any] = field(default_factory=dict)
    top_k: Optional[int] = None
    top_m: Optional[int] = None
    top_n: Optional[int] = None


@dataclass
class RetrievalResult:
    qid: str
    score: float
    bm25_score: Optional[float]
    dense_score: Optional[float]
    image_score: Optional[float]
    rerank_score: float
    duplicate_class: DuplicateClass
    reason: str
    question: QuestionDocument


@dataclass
class RetrievalResponse:
    took_ms: int
    query: QueryInput
    counts: Dict[str, int]
    results: List[RetrievalResult]


@dataclass
class EvalRecord:
    query_qid: str
    relevant_qids: List[str]


@dataclass
class EvalMetrics:
    recall_at_k: float
    mrr_at_10: float
    ndcg_at_20: float


@dataclass
class RAGConfig:
    dense_dim: int = 512
    bm25_top_k: int = 300
    dense_top_k: int = 300
    image_top_k: int = 300
    rrf_k: int = 60
    sparse_weight: float = 0.45
    dense_weight: float = 0.45
    image_weight: float = 0.10
    rrf_weight: float = 0.15
    rerank_top_m: int = 200
    final_top_n: int = 20
    near_duplicate_threshold: float = 0.85
    duplicate_threshold: float = 0.95
