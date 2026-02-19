from __future__ import annotations

import tempfile
from pathlib import Path
import sys

import streamlit as st

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from rag_python.engine import HybridQuestionRAGPy
from rag_python.logging_utils import setup_logger
from rag_python.paper_extraction import PaperExtractionPipeline


LOG_PATH = ROOT / "logs" / "paper_extract_ui.log"
DEFAULT_BANK_PATH = ROOT / "data" / "paper_extract_bank.jsonl"


def init_state() -> None:
    if "rag" not in st.session_state:
        logger = setup_logger("rag.ui", str(LOG_PATH))
        st.session_state.logger = logger
        st.session_state.rag = HybridQuestionRAGPy(logger=logger)
        st.session_state.pipeline = PaperExtractionPipeline(logger=logger)
        st.session_state.last_result = None


def render_logs() -> None:
    if not LOG_PATH.exists():
        st.info("No logs yet.")
        return
    content = LOG_PATH.read_text(encoding="utf-8")
    st.text_area("Runtime Logs", content[-12000:], height=260)


def clear_logs() -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOG_PATH.write_text("", encoding="utf-8")


def main() -> None:
    st.set_page_config(page_title="Paper Extraction Demo", layout="wide")
    st.title("Paper Extraction Demo UI")
    st.caption("Upload PDF -> Extract Questions -> Save Local Bank -> Run Retrieval")

    init_state()
    rag: HybridQuestionRAGPy = st.session_state.rag
    pipeline: PaperExtractionPipeline = st.session_state.pipeline

    with st.sidebar:
        st.header("Settings")
        bank_path = st.text_input("Local Bank Path", str(DEFAULT_BANK_PATH))
        if st.button("Load Existing Bank"):
            loaded = rag.load_local_bank(bank_path)
            st.success(f"Loaded {loaded} questions")

    uploaded = st.file_uploader("Upload PDF", type=["pdf"])
    if uploaded is not None:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(uploaded.getvalue())
            tmp_path = Path(tmp.name)

        if st.button("Process PDF", type="primary"):
            with st.spinner("Extracting..."):
                result = pipeline.process_pdf(tmp_path)
                st.session_state.last_result = result

            st.subheader("Extraction Summary")
            c1, c2, c3 = st.columns(3)
            c1.metric("PDF Type", result.pdf_type)
            c2.metric("Questions", len(result.questions))
            c3.metric("Issues", len(result.issues))

            if result.issues:
                st.warning("Issues found during validation")
                st.json(
                    [
                        {"level": i.level, "code": i.code, "message": i.message, "question_id": i.question_id}
                        for i in result.issues
                    ]
                )

            preview_rows = []
            for q in result.questions[:20]:
                preview_rows.append(
                    {
                        "qid": q.qid,
                        "stem": q.stem[:120],
                        "options": len(q.options),
                        "answer": q.answer,
                        "doc": q.metadata.get("document_id"),
                    }
                )
            if preview_rows:
                st.dataframe(preview_rows, use_container_width=True)

    if st.session_state.last_result is not None:
        st.subheader("Persist Extracted Questions")
        st.caption("Save current extracted result into local bank.")
        if st.button("Ingest + Save to Local Bank"):
            try:
                payload = pipeline.to_ingestion_payload(st.session_state.last_result)
                ingested = rag.ingest(payload)
                saved = rag.save_local_bank(bank_path)
                st.session_state.logger.info(
                    "UI save success: ingested=%d saved=%d path=%s",
                    len(ingested),
                    saved,
                    bank_path,
                )
                st.success(f"Ingested {len(ingested)} rows. Local bank now has {saved} rows.")
            except Exception as e:
                st.session_state.logger.exception("UI save failed: path=%s", bank_path)
                st.error(f"Save failed: {e}")

    st.subheader("Retrieve Test")
    q = st.text_input("Query")
    top_n = st.slider("Top N", 1, 20, 5)
    if st.button("Run Retrieve"):
        if not q.strip():
            st.error("Please input query text.")
        else:
            resp = rag.retrieve({"text": q, "top_n": top_n})
            st.write("Counts:", resp.counts)
            st.dataframe(
                [
                    {
                        "qid": r.qid,
                        "score": round(r.score, 4),
                        "rerank": round(r.rerank_score, 4),
                        "class": r.duplicate_class,
                        "reason": r.reason,
                        "stem": r.question.stem[:140],
                    }
                    for r in resp.results
                ],
                use_container_width=True,
            )

    c_log, c_btn = st.columns([5, 1])
    with c_log:
        st.subheader("Debug Logs")
    with c_btn:
        if st.button("Clear Logs"):
            clear_logs()
            st.success("Logs cleared.")
    render_logs()


if __name__ == "__main__":
    main()
