import { normalizeTemplateText, normalizeText, stableHash } from "./utils";

export function buildExactHash(stem: string, options: string[], answer?: string): string {
  const payload = `${normalizeText(stem)}||${options.map(normalizeText).join("|")}||${normalizeText(answer ?? "")}`;
  return stableHash(payload);
}

export function buildTemplateHash(stem: string): string {
  return stableHash(normalizeTemplateText(stem));
}
