import { cosineSimilarity } from "./utils";

type VectorRow = {
  qid: string;
  vector: number[];
};

type VectorHit = {
  qid: string;
  score: number;
};

export class VectorIndex {
  private rows = new Map<string, number[]>();

  upsert(rows: VectorRow[]): void {
    for (const row of rows) this.rows.set(row.qid, row.vector);
  }

  remove(qids: string[]): void {
    for (const qid of qids) this.rows.delete(qid);
  }

  search(vector: number[], topK: number): VectorHit[] {
    if (!vector.length) return [];
    const hits: VectorHit[] = [];
    for (const [qid, v] of this.rows.entries()) {
      if (v.length !== vector.length) continue;
      const score = cosineSimilarity(vector, v);
      if (score > 0) hits.push({ qid, score });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, topK);
  }
}
