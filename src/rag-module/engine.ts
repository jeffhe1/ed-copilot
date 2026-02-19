import { BM25Index } from "./bm25";
import { textToDeterministicEmbedding } from "./embedding";
import { buildFingerprints, parseQuestionsFromFile } from "./ingestion";
import { rerankPairScore } from "./reranker";
import { scoreDense } from "./scoring/dense";
import { fuseHybridScores } from "./scoring/hybrid";
import { scoreImage } from "./scoring/image";
import { scoreSparse } from "./scoring/sparse";
import type {
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
} from "./types";
import { stableHash } from "./utils";
import { VectorIndex } from "./vector-index";

const DEFAULT_CONFIG: RAGConfig = {
  denseDim: 512,
  bm25TopK: 300,
  denseTopK: 300,
  imageTopK: 300,
  rrfK: 60,
  sparseWeight: 0.45,
  denseWeight: 0.45,
  imageWeight: 0.1,
  rrfWeight: 0.15,
  rerankTopM: 200,
  finalTopN: 20,
  nearDuplicateThreshold: 0.85,
  duplicateThreshold: 0.95,
};

type StoredVectors = {
  stemVector: number[];
  explanationVector?: number[];
};

export class HybridQuestionRAG {
  private config: RAGConfig;
  private docs = new Map<string, QuestionDocument>();
  private vectors = new Map<string, StoredVectors>();
  private exactHashMap = new Map<string, string>();
  private templateHashMap = new Map<string, string[]>();
  private bm25 = new BM25Index();
  private stemIndex = new VectorIndex();
  private explanationIndex = new VectorIndex();
  private imageIndex = new VectorIndex();
  private imageOwner = new Map<string, string>();

  constructor(config?: Partial<RAGConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...(config ?? {}) };
  }

  ingest(input: IngestionInput): IngestedQuestion[] {
    const normalized = this.normalizeInput(input);
    const out: IngestedQuestion[] = [];

    for (const q of normalized) {
      const matchedExactQid = this.exactHashMap.get(q.fingerprints.exactHash);
      if (matchedExactQid) {
        out.push({
          ...q,
          dedup: { status: "exact-duplicate", matchedQid: matchedExactQid, score: 1 },
        });
        continue;
      }

      const near = this.findNearDuplicate(q);
      if (near && near.score >= this.config.nearDuplicateThreshold) {
        out.push({
          ...q,
          dedup: { status: "near-duplicate", matchedQid: near.qid, score: near.score },
        });
      } else {
        out.push({
          ...q,
          dedup: { status: "new" },
        });
      }

      this.storeQuestion(q);
    }

    this.rebuildIndexes();
    return out;
  }

  retrieve(query: QueryInput): RetrievalResponse {
    const started = Date.now();
    const q = this.resolveQueryText(query);
    const topK = query.topK ?? this.config.bm25TopK;
    const topM = query.topM ?? this.config.rerankTopM;
    const topN = query.topN ?? this.config.finalTopN;

    const filteredQids = this.filterQids(query);
    if (filteredQids.size === 0) {
      return {
        tookMs: Date.now() - started,
        query,
        counts: {
          bm25Candidates: 0,
          denseCandidates: 0,
          imageCandidates: 0,
          fusedCandidates: 0,
          rerankedCandidates: 0,
          finalResults: 0,
        },
        results: [],
      };
    }

    const bm25Hits = scoreSparse(this.bm25, q, topK, filteredQids);
    const qVector = q ? textToDeterministicEmbedding(q, this.config.denseDim) : [];
    const denseHits = scoreDense(
      this.stemIndex,
      this.explanationIndex,
      qVector,
      this.config.denseTopK,
      filteredQids
    );
    const imageHits = scoreImage(
      this.imageIndex,
      this.imageOwner,
      query.imageVector,
      this.config.imageTopK,
      filteredQids
    );

    const fused = fuseHybridScores(bm25Hits, denseHits, imageHits, this.config);
    const rerankCandidates = fused.slice(0, topM);

    const reranked = rerankCandidates
      .map((cand) => {
        const doc = this.docs.get(cand.qid);
        if (!doc) return null;
        const docText = [doc.stem, ...doc.options, doc.explanation ?? ""].join("\n");
        const denseScore = denseHits.find((x) => x.qid === doc.qid)?.score ?? 0;
        const rr = rerankPairScore(q, docText, denseScore, this.config.denseDim);
        return {
          qid: doc.qid,
          score: cand.score, // hybrid fused score (weighted sparse+dense+image+rrf)
          rerankScore: rr,
          bm25Score: bm25Hits.find((x) => x.qid === doc.qid)?.score,
          denseScore,
          imageScore: imageHits.find((x) => x.qid === doc.qid)?.score,
          question: doc,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .sort((a, b) => b.rerankScore - a.rerankScore);

    const results: RetrievalResult[] = reranked.slice(0, topN).map((r) => ({
      qid: r.qid,
      score: r.score,
      bm25Score: r.bm25Score,
      denseScore: r.denseScore,
      imageScore: r.imageScore,
      rerankScore: r.rerankScore,
      duplicateClass: this.classify(r.rerankScore),
      reason: this.reasonText(r),
      question: r.question,
    }));

    return {
      tookMs: Date.now() - started,
      query,
      counts: {
        bm25Candidates: bm25Hits.length,
        denseCandidates: denseHits.length,
        imageCandidates: imageHits.length,
        fusedCandidates: fused.length,
        rerankedCandidates: reranked.length,
        finalResults: results.length,
      },
      results,
    };
  }

  getQuestion(qid: string): QuestionDocument | undefined {
    return this.docs.get(qid);
  }

  listQuestions(): QuestionDocument[] {
    return Array.from(this.docs.values());
  }

  evaluate(records: EvalRecord[]): EvalMetrics {
    if (!records.length) return { recallAtK: 0, mrrAt10: 0, ndcgAt20: 0 };
    let recallHits = 0;
    let recallTotal = 0;
    let mrrSum = 0;
    let ndcgSum = 0;

    for (const rec of records) {
      const source = this.docs.get(rec.queryQid);
      if (!source) continue;

      const resp = this.retrieve({ text: source.stem, topN: 200 });
      const ranked = resp.results.map((r) => r.qid);
      const relevant = new Set(rec.relevantQids);
      if (!relevant.size) continue;

      let relInTop200 = 0;
      for (const qid of ranked.slice(0, 200)) if (relevant.has(qid)) relInTop200++;
      recallHits += relInTop200;
      recallTotal += relevant.size;

      let rr = 0;
      for (let i = 0; i < Math.min(10, ranked.length); i++) {
        if (relevant.has(ranked[i])) {
          rr = 1 / (i + 1);
          break;
        }
      }
      mrrSum += rr;

      let dcg = 0;
      for (let i = 0; i < Math.min(20, ranked.length); i++) {
        if (relevant.has(ranked[i])) dcg += 1 / Math.log2(i + 2);
      }
      const idealCount = Math.min(20, relevant.size);
      let idcg = 0;
      for (let i = 0; i < idealCount; i++) idcg += 1 / Math.log2(i + 2);
      ndcgSum += idcg > 0 ? dcg / idcg : 0;
    }

    const denom = records.length;
    return {
      recallAtK: recallTotal > 0 ? recallHits / recallTotal : 0,
      mrrAt10: mrrSum / denom,
      ndcgAt20: ndcgSum / denom,
    };
  }

  private normalizeInput(input: IngestionInput): QuestionDocument[] {
    const fromQuestions = (input.questions ?? []).map((q, i): QuestionDocument => {
      const qid = q.qid ?? `q_${stableHash(`${q.stem}:${i}`)}`;
      const options = q.options ?? [];
      const images = this.normalizeImages(q.images ?? [], qid);
      const fingerprints = buildFingerprints(q.stem, options, q.answer);
      return {
        qid,
        stem: q.stem.trim(),
        options,
        answer: q.answer,
        explanation: q.explanation,
        images,
        tags: q.tags ?? [],
        metadata: q.metadata ?? {},
        fingerprints,
      };
    });

    const fromFiles: QuestionDocument[] = [];
    for (const file of input.files ?? []) {
      const parsed = parseQuestionsFromFile(file);
      for (const row of parsed) {
        const qid = `q_${stableHash(`${file.fileId}:${row.sourceQuestionNo}:${row.stem}`)}`;
        const images: QuestionImage[] = [];
        const fingerprints = buildFingerprints(row.stem, row.options, row.answer);
        fromFiles.push({
          qid,
          stem: row.stem,
          options: row.options,
          answer: row.answer,
          explanation: row.explanation,
          images,
          tags: [],
          metadata: { sourceMimeType: file.mimeType, scanned: Boolean(file.scanned) },
          fingerprints,
          source: { fileId: file.fileId, questionNo: row.sourceQuestionNo },
        });
      }
    }

    return [...fromQuestions, ...fromFiles];
  }

  private normalizeImages(
    images: Array<{
      imageId?: string;
      path?: string;
      ocrText?: string;
      caption?: string;
      imageVector?: number[];
    }>,
    qid: string
  ): QuestionImage[] {
    return images.map((img, idx) => {
      const imageId = img.imageId ?? `${qid}_img_${idx + 1}`;
      const imageVector =
        img.imageVector ??
        textToDeterministicEmbedding(`${img.caption ?? ""}\n${img.ocrText ?? ""}`, this.config.denseDim);
      return {
        imageId,
        path: img.path,
        ocrText: img.ocrText,
        caption: img.caption,
        imageVector,
      };
    });
  }

  private findNearDuplicate(q: QuestionDocument): { qid: string; score: number } | null {
    const qv = textToDeterministicEmbedding([q.stem, ...q.options].join("\n"), this.config.denseDim);
    const hits = this.stemIndex.search(qv, 5);
    if (!hits.length) return null;
    return { qid: hits[0].qid, score: hits[0].score };
  }

  private storeQuestion(q: QuestionDocument): void {
    this.docs.set(q.qid, q);
    this.exactHashMap.set(q.fingerprints.exactHash, q.qid);

    const existing = this.templateHashMap.get(q.fingerprints.templateHash) ?? [];
    existing.push(q.qid);
    this.templateHashMap.set(q.fingerprints.templateHash, existing);

    const stemVector = textToDeterministicEmbedding([q.stem, ...q.options].join("\n"), this.config.denseDim);
    const explanationVector = q.explanation
      ? textToDeterministicEmbedding(q.explanation, this.config.denseDim)
      : undefined;
    this.vectors.set(q.qid, { stemVector, explanationVector });
  }

  private rebuildIndexes(): void {
    const docs = Array.from(this.docs.values());
    this.bm25 = new BM25Index();
    this.stemIndex = new VectorIndex();
    this.explanationIndex = new VectorIndex();
    this.imageIndex = new VectorIndex();
    this.imageOwner.clear();

    this.bm25.addDocuments(
      docs.map((d) => ({
        qid: d.qid,
        text: [d.stem, ...d.options, d.explanation ?? "", d.images.map((i) => i.ocrText ?? "").join(" "), d.images.map((i) => i.caption ?? "").join(" "), JSON.stringify(d.metadata)].join("\n"),
      }))
    );

    this.stemIndex.upsert(
      docs.map((d) => ({ qid: d.qid, vector: this.vectors.get(d.qid)?.stemVector ?? [] }))
    );

    this.explanationIndex.upsert(
      docs
        .filter((d) => Boolean(this.vectors.get(d.qid)?.explanationVector))
        .map((d) => ({ qid: d.qid, vector: this.vectors.get(d.qid)?.explanationVector ?? [] }))
    );

    const imageRows: Array<{ qid: string; vector: number[] }> = [];
    for (const d of docs) {
      for (const img of d.images) {
        if (!img.imageVector?.length) continue;
        imageRows.push({ qid: img.imageId, vector: img.imageVector });
        this.imageOwner.set(img.imageId, d.qid);
      }
    }
    this.imageIndex.upsert(imageRows);
  }

  private resolveQueryText(query: QueryInput): string {
    if (query.text?.trim()) return query.text.trim();
    if (query.questionId) return this.docs.get(query.questionId)?.stem ?? "";
    return "";
  }

  private filterQids(query: QueryInput): Set<string> {
    const out = new Set<string>();
    const f = query.filters;
    for (const doc of this.docs.values()) {
      const md = doc.metadata ?? {};
      if (f?.subject && md.subject !== f.subject) continue;
      if (f?.gradeLevel && md.gradeLevel !== f.gradeLevel) continue;
      if (f?.difficulty && md.difficulty !== f.difficulty) continue;
      if (f?.questionType && md.questionType !== f.questionType) continue;
      if (f?.examBoard && md.examBoard !== f.examBoard) continue;
      if (typeof f?.year === "number" && md.year !== f.year) continue;
      out.add(doc.qid);
    }
    return out;
  }

  private classify(score: number): "duplicate" | "near-duplicate" | "similar" | "related" {
    if (score >= this.config.duplicateThreshold) return "duplicate";
    if (score >= this.config.nearDuplicateThreshold) return "near-duplicate";
    if (score >= 0.65) return "similar";
    return "related";
  }

  private reasonText(row: {
    bm25Score?: number;
    denseScore?: number;
    imageScore?: number;
    rerankScore: number;
  }): string {
    const parts: string[] = [];
    if (typeof row.bm25Score === "number") parts.push(`bm25=${row.bm25Score.toFixed(3)}`);
    if (typeof row.denseScore === "number") parts.push(`dense=${row.denseScore.toFixed(3)}`);
    if (typeof row.imageScore === "number") parts.push(`image=${row.imageScore.toFixed(3)}`);
    parts.push(`rerank=${row.rerankScore.toFixed(3)}`);
    return parts.join(", ");
  }
}
