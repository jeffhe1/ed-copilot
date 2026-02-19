# Python RAG Module (Standalone)

This is a Python rewrite of the standalone RAG module, designed for future integration with the existing project.

## What Is Improved

- Inverted-index BM25 for sparse retrieval
- NumPy-accelerated dense retrieval path in `VectorIndex` (falls back to pure Python)
- Adaptive hybrid weighting:
  - if query has no image vector, image weight is redistributed to sparse/dense
- Cleaner architecture:
  - scoring logic is separated from orchestration
  - engine focuses on pipeline control

## Quick Run

```bash
python scripts/rag_smoke_py.py
```

## Demo Local Question Bank (JSONL)

Generate a local test bank (default 1000 questions):

```bash
python scripts/build_rag_demo_bank.py
```

Output file:

- `data/rag_demo_bank.jsonl`

Engine APIs for local persistence:

- `HybridQuestionRAGPy.save_local_bank(path)`
- `HybridQuestionRAGPy.load_local_bank(path)`

## Core API

- `HybridQuestionRAGPy.ingest(...)`
- `HybridQuestionRAGPy.retrieve(...)`
- `HybridQuestionRAGPy.evaluate(...)`
- `PaperExtractionPipeline.process_pdf(...)`

## Notes

- Default embedding is deterministic hash embedding for local reproducible testing.
- You can inject your own embedder by implementing:
  - `encode(text: str) -> list[float]`

## Paper Extraction Demo (from PRD)

Run extraction on one PDF and directly build local question bank:

```bash
python scripts/paper_extract_demo.py --pdf path/to/paper.pdf
```

The script will:

1. detect PDF type (`text_pdf` / `scanned_pdf`)
2. extract text (text extraction or OCR fallback)
3. parse question structure (stem/options/answer/explanation)
4. validate constraints and emit issues
5. ingest into RAG engine and save local bank JSONL

## Simple UI (PDF Upload + Processing + Logs)

Install Streamlit first:

```bash
pip install streamlit
```

Run UI:

```bash
streamlit run scripts/paper_extract_ui.py
```

UI features:

1. Upload PDF and run extraction
2. Show extraction summary and validation issues
3. Ingest extracted questions and save local JSONL bank
4. Run retrieval tests
5. Display runtime logs from `logs/paper_extract_ui.log`
