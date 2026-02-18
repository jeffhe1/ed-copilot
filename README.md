To start the app use

```bash
npm run dev
```

Then go into localhost:3000

# Feature List
[x] Question Generation
[] Generated content matching actual syllabus
[] Cached AI returned answer (for faster content retrieval and validity - store raw output and verified output in separate databases)
[] Mock Exam Generation -> different from ABCD quiz
[x] Interative Quiz Rendering
[] PDF quiz output
[x] Student Profile
[] Study Roadmap
[] Student Leaderboard

# RAG Roadmap (TODO, by increasing complexity)

## A. Standard Similar-Question Retrieval
[] Implement Hybrid Search: BM25 + Dense retrieval, then RRF fusion, then Cross-Encoder rerank
[] Use one-question-per-document indexing, with separate fields for stem, options, and explanation
[] Use dense vectors primarily for question stem; optionally add multi-vector setup (stem vector + explanation vector) for more stable recall
[] Retrieval/rerank pipeline target: Top 200 candidates for recall -> rerank to Top 20/Top 50
[] Use cases: similar-question lookup, deduplication, practice recommendation, query-to-question matching

## B. Query-Enhanced RAG
[] Add query expansion methods: Query Translation, Multi-Query, RAG-Fusion, and HyDE
[] Generate 3-5 semantically equivalent query variants (or same-skill formulations) with LLM
[] Run retrieval for each variant and fuse results with RRF (typical RAG-Fusion pattern: multi-query + RRF)
[] Use cases: short/colloquial user prompts, cross-textbook wording mismatch, high paraphrase variance

## C. Structured / Graph-Enhanced RAG
[] Add GraphRAG or KG-enhanced RAG architecture
[] Graph nodes: skills, questions, chapters, concepts, formulas
[] Graph edges: skill-includes, prerequisite, synonym, commonly-confused, canonical-question-type
[] Retrieval flow: hit target skills -> expand neighboring nodes -> build candidate question set -> rerank for final ranking
[] Use cases: intelligent exam assembly, knowledge-graph-driven recommendation, learning pathing, weak-point diagnosis

## Challenges
[] exam paper processing
[] questions include diagram
