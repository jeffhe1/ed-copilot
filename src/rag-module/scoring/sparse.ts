import { BM25Index } from "../bm25";
import type { ScoreHit } from "./types";

export function scoreSparse(
  bm25: BM25Index,
  queryText: string,
  topK: number,
  allowedQids: Set<string>
): ScoreHit[] {
  if (!queryText.trim()) return [];
  return bm25.search(queryText, topK).filter((x) => allowedQids.has(x.qid));
}
