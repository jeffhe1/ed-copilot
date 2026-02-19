from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional
import logging

from .fingerprint import build_exact_hash, build_template_hash
from .types import QuestionDocument
from .utils import stable_hash


PdfType = Literal["text_pdf", "scanned_pdf", "unknown"]


@dataclass
class ExtractionIssue:
    level: Literal["warning", "error"]
    code: str
    message: str
    question_id: Optional[str] = None


@dataclass
class ExtractionResult:
    document_id: str
    source_path: str
    pdf_type: PdfType
    raw_text: str
    questions: List[QuestionDocument] = field(default_factory=list)
    issues: List[ExtractionIssue] = field(default_factory=list)


class PaperExtractionPipeline:
    """
    Demo-oriented extraction pipeline based on PRD:
    1) detect pdf type
    2) extract text
    3) parse questions/options/answer/explanation
    4) validate schema constraints
    """

    def __init__(self, logger: Optional[logging.Logger] = None):
        self.logger = logger or logging.getLogger("rag.paper_extraction")

    def detect_pdf_type(self, pdf_path: str | Path) -> PdfType:
        self.logger.info("Detecting PDF type: %s", pdf_path)
        text = self._extract_text_pdf(pdf_path)
        if text and text.strip():
            self.logger.info("PDF type detected as text_pdf: %s", pdf_path)
            return "text_pdf"
        # If direct text extraction is empty, treat as scanned as default assumption.
        self.logger.info("PDF type detected as scanned_pdf: %s", pdf_path)
        return "scanned_pdf"

    def process_pdf(self, pdf_path: str | Path) -> ExtractionResult:
        p = Path(pdf_path)
        document_id = p.stem
        self.logger.info("Start processing PDF: %s", p)
        pdf_type = self.detect_pdf_type(p)
        issues: List[ExtractionIssue] = []

        if pdf_type == "text_pdf":
            raw_text = self._extract_text_pdf(p)
            self.logger.info("Text extraction completed for text_pdf: chars=%d", len(raw_text))
        else:
            raw_text = self._extract_text_scanned(p)
            self.logger.info("OCR extraction completed for scanned_pdf: chars=%d", len(raw_text))
            if not raw_text.strip():
                issues.append(
                    ExtractionIssue(
                        level="warning",
                        code="OCR_EMPTY",
                        message="Scanned PDF OCR returned empty text. Install OCR dependencies or check source quality.",
                    )
                )
                self.logger.warning("OCR returned empty text for scanned PDF: %s", p)

        parsed_rows = self._parse_questions(raw_text, document_id=document_id)
        self.logger.info("Parsed candidate questions: %d", len(parsed_rows))
        questions = [self._to_question_document(row, document_id=document_id, idx=i) for i, row in enumerate(parsed_rows, 1)]

        issues.extend(self._validate_questions(questions))
        self.logger.info("Validation completed: questions=%d issues=%d", len(questions), len(issues))
        return ExtractionResult(
            document_id=document_id,
            source_path=str(p),
            pdf_type=pdf_type,
            raw_text=raw_text,
            questions=questions,
            issues=issues,
        )

    def process_batch(self, input_dir: str | Path, pattern: str = "*.pdf") -> List[ExtractionResult]:
        d = Path(input_dir)
        self.logger.info("Batch processing start: dir=%s pattern=%s", d, pattern)
        results: List[ExtractionResult] = []
        for pdf in sorted(d.glob(pattern)):
            results.append(self.process_pdf(pdf))
        self.logger.info("Batch processing done: files=%d", len(results))
        return results

    def to_ingestion_payload(self, result: ExtractionResult) -> Dict[str, Any]:
        return {"questions": [self._question_to_ingest_dict(q) for q in result.questions]}

    def _extract_text_pdf(self, pdf_path: str | Path) -> str:
        # Preferred: PyMuPDF (fitz)
        try:
            import fitz  # type: ignore

            doc = fitz.open(str(pdf_path))
            chunks = []
            for page in doc:
                chunks.append(page.get_text() or "")
            return self._normalize_extracted_text("\n".join(chunks))
        except Exception:
            pass

        # Fallback: pypdf
        try:
            from pypdf import PdfReader  # type: ignore

            reader = PdfReader(str(pdf_path))
            chunks = []
            for page in reader.pages:
                chunks.append(page.extract_text() or "")
            return self._normalize_extracted_text("\n".join(chunks))
        except Exception:
            return ""

    def _extract_text_scanned(self, pdf_path: str | Path) -> str:
        # Optional OCR path. If dependencies are missing, return empty string.
        try:
            from pdf2image import convert_from_path  # type: ignore
            import pytesseract  # type: ignore
        except Exception:
            return ""

        text_chunks: List[str] = []
        try:
            images = convert_from_path(str(pdf_path))
            for img in images:
                text_chunks.append(pytesseract.image_to_string(img, lang="eng"))
            return self._normalize_extracted_text("\n".join(text_chunks))
        except Exception:
            return ""

    def _normalize_extracted_text(self, text: str) -> str:
        # keep line boundaries but clean obvious OCR spacing noise
        text = text.replace("\r", "\n")
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    def _parse_questions(self, text: str, document_id: str) -> List[Dict[str, Any]]:
        if not text.strip():
            return []

        # Preferred: robust split by explicit question header line.
        qline = re.compile(
            r"(?im)^\s*question\s*\d+\s*(?:\(\s*\d+\s*marks?\s*\))?\s*$"
        )
        starts = list(qline.finditer(text))
        chunks: List[str] = []
        if starts:
            for i, m in enumerate(starts):
                s = m.start()
                e = starts[i + 1].start() if i + 1 < len(starts) else len(text)
                chunks.append(text[s:e].strip())
        else:
            # Fallback: broader boundary patterns: "Question 1", "Question 1.", "Question 1 (5 marks)", "1.", "（1）"
            boundary = re.compile(
                r"(?:^|\n)\s*(?:"
                r"Q(?:uestion)?\s*\d+\s*(?:\(\s*\d+\s*marks?\s*\))?\s*[\).:]?"
                r"|\d+[\).:]"
                r"|[（(]\d+[）)]"
                r")\s+",
                re.IGNORECASE,
            )
            chunks = [c.strip() for c in boundary.split(text) if c.strip()]
            if len(chunks) == 1:
                chunks = [text.strip()]

        out: List[Dict[str, Any]] = []
        for idx, chunk in enumerate(chunks, 1):
            # Remove question header line to avoid polluting stem.
            chunk = re.sub(
                r"(?im)^\s*question\s*\d+\s*(?:\(\s*\d+\s*marks?\s*\))?\s*$",
                "",
                chunk,
            ).strip()

            # Extract answer line if present: "Answer: A"
            ans_match = re.search(r"\b(?:Answer|Ans)\s*[:：\-]\s*([A-D])\b", chunk, flags=re.IGNORECASE)
            answer = ans_match.group(1).upper() if ans_match else None

            # Extract explanation line if present.
            exp_match = re.search(r"\b(?:Explanation|解析)\s*[:：\-]\s*([\s\S]*)$", chunk, flags=re.IGNORECASE)
            explanation = exp_match.group(1).strip() if exp_match else None

            # Options patterns: A. / (A) / A)
            option_map: Dict[str, str] = {}
            for line in chunk.split("\n"):
                m = re.match(r"^\s*(?:\(?([A-D])\)|([A-D]))[).:\-]\s*(.+)$", line.strip(), flags=re.IGNORECASE)
                if m:
                    key = (m.group(1) or m.group(2) or "").upper()
                    option_map[key] = m.group(3).strip()

            options = [option_map[k] for k in ("A", "B", "C", "D") if k in option_map]

            # stem = chunk before first option marker
            stem = re.split(
                r"\n\s*(?:\(?[A-D]\)|[A-D])[).:\-]\s*",
                chunk,
                maxsplit=1,
                flags=re.IGNORECASE,
            )[0].strip()
            stem = re.sub(r"\b(?:Answer|Ans|Explanation|解析)\s*[:：\-].*$", "", stem, flags=re.IGNORECASE).strip()

            if not stem:
                continue

            out.append(
                {
                    "question_no": idx,
                    "document_id": document_id,
                    "stem": stem,
                    "options": options,
                    "answer": answer,
                    "explanation": explanation,
                    "metadata": {"source": "paper_extraction_demo"},
                }
            )
        return out

    def _to_question_document(self, row: Dict[str, Any], document_id: str, idx: int) -> QuestionDocument:
        stem = str(row.get("stem", "")).strip()
        options = list(row.get("options") or [])
        answer = row.get("answer")
        qid = f"{document_id}_q_{idx:04d}_{stable_hash(stem)[:8]}"
        return QuestionDocument(
            qid=qid,
            stem=stem,
            options=options,
            answer=answer,
            explanation=row.get("explanation"),
            images=[],
            tags=[],
            metadata={
                "document_id": document_id,
                "question_no": idx,
                **dict(row.get("metadata") or {}),
            },
            fingerprints={
                "exact_hash": build_exact_hash(stem, options, answer),
                "template_hash": build_template_hash(stem),
            },
            source={"fileId": document_id, "questionNo": idx},
        )

    def _validate_questions(self, questions: List[QuestionDocument]) -> List[ExtractionIssue]:
        issues: List[ExtractionIssue] = []
        seen = set()
        for q in questions:
            if q.qid in seen:
                issues.append(
                    ExtractionIssue(
                        level="error",
                        code="DUPLICATE_QID",
                        message=f"Duplicate question_id detected: {q.qid}",
                        question_id=q.qid,
                    )
                )
            seen.add(q.qid)

            if q.options and len(q.options) < 2:
                issues.append(
                    ExtractionIssue(
                        level="error",
                        code="TOO_FEW_OPTIONS",
                        message="MCQ must have at least 2 options",
                        question_id=q.qid,
                    )
                )

            if q.answer and q.options:
                # In demo parser, options are stored as values; answer is A/B/C/D.
                # Validate by index mapping.
                valid_answers = {"A", "B", "C", "D"} & {chr(ord("A") + i) for i in range(len(q.options))}
                if q.answer not in valid_answers:
                    issues.append(
                        ExtractionIssue(
                            level="error",
                            code="ANSWER_OUT_OF_RANGE",
                            message=f"Answer '{q.answer}' not in parsed options range",
                            question_id=q.qid,
                        )
                    )
        return issues

    def _question_to_ingest_dict(self, q: QuestionDocument) -> Dict[str, Any]:
        return {
            "qid": q.qid,
            "stem": q.stem,
            "options": q.options,
            "answer": q.answer,
            "explanation": q.explanation,
            "images": [
                {
                    "imageId": x.image_id,
                    "path": x.path,
                    "ocrText": x.ocr_text,
                    "caption": x.caption,
                    "imageVector": x.image_vector,
                }
                for x in q.images
            ],
            "tags": q.tags,
            "metadata": q.metadata,
        }
