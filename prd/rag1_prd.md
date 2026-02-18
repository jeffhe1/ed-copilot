**Product Requirements Document**

**Product Name**

Hybrid Multimodal RAG System for Question Bank Retrieval

**1\. Overview**

**1.1 Purpose**

Build a Retrieval-Augmented Generation (RAG) system that enables:

- High-precision similar question retrieval
- Duplicate and near-duplicate detection
- Multimodal (text + diagram) question support
- Scalable ingestion of exam papers (PDF/DOCX/Scanned)

The system must support production-level retrieval quality for educational question banks.

**2\. Goals and Objectives**

**2.1 Primary Goals**

1.  Retrieve highly similar questions with strong Top-K precision.
2.  Detect duplicates and template variants.

**2.2 Non-Goals**

- Full generative tutoring system
- Automated grading
- Diagram semantic parsing beyond similarity use case
- Support math/geometry questions with embedded diagrams.
- Ingest new exam papers automatically into the retrieval index.

**3\. System Scope**

**3.1 Supported Inputs**

**Query Types**

- Text-based question input
- Screenshot/image upload(future)
- Internal question ID lookup

**Document Types**

- Digital PDF
- Scanned PDF
- DOCX
- HTML

**4\. Functional Requirements**

**4.1 Ingestion Pipeline**

**FR-1: File Processing**

The system shall:

- Detect file type (digital vs scanned)
- Extract text and layout structure
- Perform OCR when needed

**FR-2: Question Segmentation**

The system shall:

- Detect question boundaries
- Extract sub-questions
- Parse options (A/B/C/D)
- Associate answer keys and explanations

**FR-3: Image Handling**

The system shall:

- Detect diagram regions
- Crop and store diagram images
- Generate:
    - OCR text
    - Short caption/description
    - Visual embedding vector

**FR-4: Deduplication**

The system shall:

- Generate text fingerprints
- Generate diagram hashes
- Detect exact duplicates
- Detect near-duplicates via embedding + rerank threshold

**4.2 Indexing Layer**

**FR-5: Hybrid Retrieval Support**

The system shall index:

**Sparse index (BM25):**

- stem
- options
- explanation
- image OCR text
- image caption
- metadata

**Dense index (vector):**

- stem embedding
- optional explanation embedding
- image embedding (for diagrams)

**4.3 Retrieval Pipeline**

**FR-6: Hybrid Recall**

The system shall:

1.  Perform BM25 retrieval (TopK=300)
2.  Perform dense vector retrieval (TopK=300)
3.  Fuse candidates using RRF (k=60)

**FR-7: Multimodal Recall**

If query includes image:

- Compute image embedding
- Retrieve from image vector index
- Fuse results via RRF

**FR-8: Reranking**

The system shall:

- Apply cross-encoder reranker to TopM=200 candidates
- Produce rerank score
- Output TopN=20 final results

**FR-9: Duplicate Classification**

The system shall classify results as:

- duplicate
- near-duplicate
- similar
- related

Based on rerank score thresholds.

**4.4 Filtering and Constraints**

The system shall support filtering by:

- Subject
- Grade level
- Difficulty
- Question type
- Exam board
- Year

**5\. Non-Functional Requirements**

**5.1 Performance**

- Query latency: <1.5 seconds
- Batch ingestion throughput scalable to 100k+ questions
- Rerank batch inference support

**5.2 Scalability**

- Must support 1M+ questions
- Horizontal scaling for vector search

**5.3 Reliability**

- Idempotent ingestion
- Re-runnable pipeline stages
- Audit logs for paper → question mapping

**5.4 Observability**

Metrics required:

- Recall@K
- MRR@10
- NDCG@20
- Duplicate detection precision
- OCR confidence rate
- Segmentation success rate

**6\. System Architecture**

**6.1 High-Level Architecture**

Paper Input

↓

Extraction + OCR

↓

Segmentation + Parsing

↓

Image Detection + Embedding

↓

Dedup Check

↓

Indexing (BM25 + Vector + Image Vector)

Query Path:

User Query (Text/Image)

↓

Hybrid Retrieval (BM25 + Dense + Image)

↓

RRF Fusion

↓

Cross-Encoder Reranking

↓

Final Ranked Results

**7\. Data Model**

**Question Object Schema**

{

qid,

stem,

options\[\],

answer,

explanation,

images: \[

{

image_id,

path,

ocr_text,

caption,

image_vector

}

\],

tags\[\],

metadata,

fingerprints {

exact_hash,

template_hash

}

}

**8\. Success Criteria**

The system is considered successful if:

- Recall@200 > 0.95 on labeled evaluation set
- MRR@10 improved by >30% vs dense-only baseline
- Duplicate detection precision > 95%
- Diagram-based similarity retrieval works reliably
- Manual QA reports segmentation accuracy > 98%

**9\. Risks & Mitigation**

| **Risk** | **Mitigation** |
| --- | --- |
| OCR noise on diagrams | Combine visual embeddings + OCR |
| Reranker latency | Batch inference + candidate size control |
| Template variants not detected | Add number-normalized fingerprint |
| Poor segmentation | Hybrid rule-based + LLM correction |

**10\. Future Enhancements**

- Knowledge graph augmentation
- Template structure extraction for math problems
- Multimodal cross-encoder reranking
- Query expansion (RAG-Fusion)
- Automatic topic classification

**Executive Summary**

This RAG system is designed as a **precision-first, hybrid, multimodal retrieval architecture** optimized for large-scale English question banks. It integrates:

- BM25 sparse retrieval
- Dense semantic retrieval
- RRF fusion
- Cross-encoder reranking
- Diagram-aware multimodal indexing
- Automated ingestion pipeline

It prioritizes **Top-K precision, duplicate detection, and scalable ingestion** for production educational environments.

If you want, I can also provide:

- A lighter “Investor / Business PRD” version
- A more technical “Engineering Design Spec” version
- Or a 1-page executive slide summary