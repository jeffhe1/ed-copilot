import { tokenize } from "./utils";

type DocField = {
  qid: string;
  text: string;
};

type BM25Row = {
  qid: string;
  score: number;
};

export class BM25Index {
  private docs = new Map<string, string[]>();
  private docLen = new Map<string, number>();
  private inverted = new Map<string, Array<{ qid: string; tf: number }>>();
  private avgDocLen = 0;
  private totalDocs = 0;
  private k1 = 1.2;
  private b = 0.75;

  addDocuments(rows: DocField[]): void {
    for (const row of rows) {
      const tokens = tokenize(row.text);
      this.docs.set(row.qid, tokens);
    }
    this.rebuildInverted();
  }

  removeDocuments(qids: string[]): void {
    for (const qid of qids) {
      this.docs.delete(qid);
    }
    this.rebuildInverted();
  }

  private rebuildInverted(): void {
    this.inverted.clear();
    this.docLen.clear();
    let totalLen = 0;

    for (const [qid, tokens] of this.docs) {
      totalLen += tokens.length;
      this.docLen.set(qid, tokens.length);

      const tf = new Map<string, number>();
      for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);

      for (const [term, count] of tf.entries()) {
        const posting = this.inverted.get(term) ?? [];
        posting.push({ qid, tf: count });
        this.inverted.set(term, posting);
      }
    }

    this.totalDocs = this.docs.size;
    this.avgDocLen = this.totalDocs ? totalLen / this.totalDocs : 0;
  }

  search(query: string, topK: number): BM25Row[] {
    const qTokens = tokenize(query);
    if (!qTokens.length || this.totalDocs === 0) return [];

    const queryTerms = new Set(qTokens);
    const scores = new Map<string, number>();

    for (const term of queryTerms.values()) {
      const posting = this.inverted.get(term);
      if (!posting || posting.length === 0) continue;

      const df = posting.length;
      const idf = Math.log(1 + (this.totalDocs - df + 0.5) / (df + 0.5));

      for (const { qid, tf } of posting) {
        const dl = Math.max(this.docLen.get(qid) ?? 0, 1);
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (dl / Math.max(this.avgDocLen, 1)));
        const add = idf * (numerator / denominator);
        scores.set(qid, (scores.get(qid) ?? 0) + add);
      }
    }

    return Array.from(scores.entries())
      .map(([qid, score]) => ({ qid, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
