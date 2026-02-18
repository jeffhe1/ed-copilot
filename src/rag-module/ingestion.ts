import { buildExactHash, buildTemplateHash } from "./fingerprint";
import type { IngestionFile } from "./types";

type ParsedQuestion = {
  stem: string;
  options: string[];
  answer?: string;
  explanation?: string;
  sourceQuestionNo?: number;
};

function cleanupText(input: string): string {
  return input.replace(/\r/g, "").replace(/\t/g, " ").replace(/\u00a0/g, " ").trim();
}

function parseOptions(block: string): string[] {
  const lines = cleanupText(block).split("\n");
  const options: string[] = [];
  const optionRe = /^\s*([A-D])[).:\-]\s*(.+)$/i;
  for (const line of lines) {
    const m = line.match(optionRe);
    if (m) options.push(m[2].trim());
  }
  return options;
}

export function parseQuestionsFromPlainText(content: string): ParsedQuestion[] {
  const text = cleanupText(content);
  if (!text) return [];

  const boundaryRe = /(?:^|\n)\s*(?:question\s*\d+[\).:]|\d+[\).:])\s+/gi;
  const chunks = text.split(boundaryRe).map((x) => x.trim()).filter(Boolean);
  const candidates = chunks.length > 1 ? chunks : [text];
  const out: ParsedQuestion[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const chunk = candidates[i];
    const answer = chunk.match(/\banswer\s*[:\-]\s*([A-D])\b/i)?.[1]?.toUpperCase();
    const explanation = chunk.match(/\bexplanation\s*[:\-]\s*([\s\S]*)$/i)?.[1]?.trim();
    const stem = chunk.split(/\n\s*[A-D][).:\-]\s+/i)[0]?.trim();
    const options = parseOptions(chunk);

    if (!stem) continue;
    out.push({
      stem,
      options,
      answer,
      explanation,
      sourceQuestionNo: i + 1,
    });
  }

  return out;
}

export function parseQuestionsFromFile(file: IngestionFile): ParsedQuestion[] {
  // Stageable parser: current version expects extracted text, but keeps per-file entry point.
  return parseQuestionsFromPlainText(file.content);
}

export function buildFingerprints(stem: string, options: string[], answer?: string): { exactHash: string; templateHash: string } {
  return {
    exactHash: buildExactHash(stem, options, answer),
    templateHash: buildTemplateHash(stem),
  };
}
