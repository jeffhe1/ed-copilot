# Standalone Hybrid RAG Module

This module is a standalone implementation of the PRD in `prd/rag1_prd.md`, designed for future integration into the main app.

## Current Capabilities

- Ingestion from structured question payloads or plain text file payloads
- Basic question segmentation for plain text sources
- Exact duplicate detection via fingerprint hash
- Near-duplicate detection via dense similarity threshold
- Hybrid retrieval:
  - BM25 sparse retrieval
  - Dense retrieval (stem + optional explanation vector)
  - Optional image-vector retrieval
  - RRF fusion
  - Reranking and duplicate class labeling
- Metadata filtering (`subject`, `gradeLevel`, `difficulty`, `questionType`, `examBoard`, `year`)
- Evaluation helpers (`Recall@200`, `MRR@10`, `NDCG@20`)

## Not Yet Implemented

- Real OCR and layout extraction for PDF/DOCX/image inputs
- Production cross-encoder reranker (current reranker is deterministic placeholder logic)
- External vector DB / sparse engine integration
- Advanced segmentation and audit logging pipeline

## Example

```ts
import { HybridQuestionRAG } from "@/rag-module";

const rag = new HybridQuestionRAG();

rag.ingest({
  questions: [
    {
      stem: "Find the derivative of x^2 + 3x.",
      options: ["2x + 3", "x + 3", "2x", "3x"],
      answer: "A",
      explanation: "d/dx(x^2)=2x and d/dx(3x)=3",
      metadata: { subject: "Mathematics", difficulty: "easy", year: 2025 },
    },
  ],
});

const results = rag.retrieve({
  text: "Differentiate x^2 + 3x",
  filters: { subject: "Mathematics" },
});
```

## Integration Plan

When integrating into app routes/services:

1. Replace deterministic embeddings with provider-backed embedding calls.
2. Replace in-memory BM25/vector indexes with persistent engines.
3. Replace `parseQuestionsFromFile` with extraction + OCR workers.
4. Replace placeholder reranker with a true cross-encoder service.
5. Add ingestion job IDs and stage-level audit logs.
