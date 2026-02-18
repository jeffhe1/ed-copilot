import { stableHash, tokenize } from "./utils";

export function textToDeterministicEmbedding(text: string, dim: number): number[] {
  const out = Array.from({ length: dim }, () => 0);
  const tokens = tokenize(text);
  if (!tokens.length) return out;

  for (const token of tokens) {
    const h = stableHash(token);
    const bucket = parseInt(h.slice(0, 8), 16) % dim;
    const sign = parseInt(h.slice(8, 16), 16) % 2 === 0 ? 1 : -1;
    out[bucket] += sign;
  }

  let norm = 0;
  for (let i = 0; i < out.length; i++) norm += out[i] * out[i];
  if (norm === 0) return out;
  const inv = 1 / Math.sqrt(norm);
  for (let i = 0; i < out.length; i++) out[i] *= inv;
  return out;
}
