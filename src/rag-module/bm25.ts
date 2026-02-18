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
  private termFreq = new Map<string, Map<string, number>>();
  private docFreq = new Map<string, number>();
  private avgDocLen = 0;
  private k1 = 1.2;
  private b = 0.75;

  addDocuments(rows: DocField[]): void {
    for (const row of rows) {
      const tokens = tokenize(row.text);
      this.docs.set(row.qid, tokens);

      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      this.termFreq.set(row.qid, tf);
    }
    this.rebuildDocFreq();
  }

  removeDocuments(qids: string[]): void {
    for (const qid of qids) {
      this.docs.delete(qid);
      this.termFreq.delete(qid);
    }
    this.rebuildDocFreq();
  }

  private rebuildDocFreq(): void {
    this.docFreq.clear();
    let totalLen = 0;

    for (const [, tokens] of this.docs) {
      totalLen += tokens.length;
      const uniq = new Set(tokens);
      for (const t of uniq) this.docFreq.set(t, (this.docFreq.get(t) ?? 0) + 1);
    }

    this.avgDocLen = this.docs.size ? totalLen / this.docs.size : 0;
  }

  search(query: string, topK: number): BM25Row[] {
    const qTokens = tokenize(query);
    if (!qTokens.length || this.docs.size === 0) return [];

    const N = this.docs.size;
    const scores: BM25Row[] = [];

    for (const [qid, tokens] of this.docs.entries()) {
      const tf = this.termFreq.get(qid);
      if (!tf) continue;
      const dl = Math.max(tokens.length, 1);
      let score = 0;

      for (const qt of qTokens) {
        const f = tf.get(qt) ?? 0;
        if (!f) continue;
        const df = this.docFreq.get(qt) ?? 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const numerator = f * (this.k1 + 1);
        const denominator = f + this.k1 * (1 - this.b + this.b * (dl / Math.max(this.avgDocLen, 1)));
        score += idf * (numerator / denominator);
      }

      if (score > 0) scores.push({ qid, score });
    }

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK);
  }
}
