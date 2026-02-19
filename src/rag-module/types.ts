export type QuestionMetadata = {
  subject?: string;
  gradeLevel?: string;
  difficulty?: string;
  questionType?: string;
  examBoard?: string;
  year?: number;
  [key: string]: unknown;
};

export type QuestionImage = {
  imageId: string;
  path?: string;
  ocrText?: string;
  caption?: string;
  imageVector?: number[];
};

export type QuestionDocument = {
  qid: string;
  stem: string;
  options: string[];
  answer?: string;
  explanation?: string;
  images: QuestionImage[];
  tags: string[];
  metadata: QuestionMetadata;
  fingerprints: {
    exactHash: string;
    templateHash: string;
  };
  source?: {
    fileId?: string;
    questionNo?: number;
  };
};

export type IngestedQuestion = QuestionDocument & {
  dedup: {
    status: "new" | "exact-duplicate" | "near-duplicate";
    matchedQid?: string;
    score?: number;
  };
};

export type IngestionFile = {
  fileId: string;
  mimeType: "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "text/html" | "text/plain";
  content: string;
  scanned?: boolean;
};

export type IngestionInput = {
  questions?: Array<{
    qid?: string;
    stem: string;
    options?: string[];
    answer?: string;
    explanation?: string;
    tags?: string[];
    metadata?: QuestionMetadata;
    images?: Array<{
      imageId?: string;
      path?: string;
      ocrText?: string;
      caption?: string;
      imageVector?: number[];
    }>;
  }>;
  files?: IngestionFile[];
};

export type QueryFilters = {
  subject?: string;
  gradeLevel?: string;
  difficulty?: string;
  questionType?: string;
  examBoard?: string;
  year?: number;
};

export type QueryInput = {
  text?: string;
  imageVector?: number[];
  questionId?: string;
  filters?: QueryFilters;
  topK?: number;
  topM?: number;
  topN?: number;
};

export type RetrievalResult = {
  qid: string;
  score: number;
  bm25Score?: number;
  denseScore?: number;
  imageScore?: number;
  rerankScore?: number;
  duplicateClass: "duplicate" | "near-duplicate" | "similar" | "related";
  reason?: string;
  question: QuestionDocument;
};

export type RetrievalResponse = {
  tookMs: number;
  query: QueryInput;
  counts: {
    bm25Candidates: number;
    denseCandidates: number;
    imageCandidates: number;
    fusedCandidates: number;
    rerankedCandidates: number;
    finalResults: number;
  };
  results: RetrievalResult[];
};

export type RAGConfig = {
  denseDim: number;
  bm25TopK: number;
  denseTopK: number;
  imageTopK: number;
  rrfK: number;
  sparseWeight: number;
  denseWeight: number;
  imageWeight: number;
  rrfWeight: number;
  rerankTopM: number;
  finalTopN: number;
  nearDuplicateThreshold: number;
  duplicateThreshold: number;
};

export type EvalRecord = {
  queryQid: string;
  relevantQids: string[];
};

export type EvalMetrics = {
  recallAtK: number;
  mrrAt10: number;
  ndcgAt20: number;
};
