import { NextResponse } from "next/server";
import OpenAI, { APIError } from "openai";
import { z } from "zod";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type QuestionItem = {
  id: number;
  stem_md: string;
  options: { A: string; B: string; C: string; D: string };
  answer: "A" | "B" | "C" | "D";
  explanation_md: string;
};

/* =============================== MCQ SCHEMAS =============================== */

const Z_MCQ = z.object({
  version: z.literal(1),
  questions: z.array(
    z.object({
      id: z.number().int(),
      stem_md: z.string(),
      options: z.object({
        A: z.string(),
        B: z.string(),
        C: z.string(),
        D: z.string(),
      }),
      answer: z.enum(["A", "B", "C", "D"]),
      explanation_md: z.string(),
    })
  ),
});

const MCQ_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    version: { type: "integer", enum: [1] },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "integer" },
          stem_md: { type: "string" },
          options: {
            type: "object",
            additionalProperties: false,
            properties: {
              A: { type: "string" },
              B: { type: "string" },
              C: { type: "string" },
              D: { type: "string" },
            },
            required: ["A", "B", "C", "D"],
          },
          answer: { type: "string", enum: ["A", "B", "C", "D"] },
          explanation_md: { type: "string" },
        },
        required: ["id", "stem_md", "options", "answer", "explanation_md"],
      },
    },
  },
  required: ["version", "questions"],
} as const;

/* ============================ CLASSIFIER CONFIG ============================ */

// STEM domains we accept
const STEM_DOMAINS = new Set([
  "mathematics",
  "math",
  "physics",
  "chemistry",
  "biology",
  "earth_science",
  "earth science",
  "geology",
  "astronomy",
  "space_science",
  "computer_science",
  "computer science",
  "cs",
  "engineering",
  "statistics",
  "data_science",
]);

// quick local heuristic to avoid a model call for obvious STEM prompts
function quickIsLikelySTEM(s: string): boolean {
  const t = s.toLowerCase();
  const hits = [
    "math", "calculus", "algebra", "geometry", "trigonometry", "differentiation", "integration",
    "probability", "statistics", "matrix", "vector", "complex number",
    "physics", "mechanics", "electric", "magnet", "thermo", "optics", "quantum", "kinematics",
    "chemistry", "stoichiometry", "equilibrium", "acid", "base", "redox", "organic", "bond",
    "biology", "genetics", "cell", "enzyme", "ecology", "evolution", "physiology",
    "geology", "earth", "plate tectonics", "seismology", "mineral",
    "astronomy", "astrophys", "cosmo", "planet", "orbit",
    "computer", "algorithm", "data structure", "complexity", "programming", "cs",
    "engineering", "circuit", "signal", "control", "materials", "mechanical", "electrical",
  ];
  return hits.some((k) => t.includes(k));
}

async function classifyPromptWithModel(prompt: string) {
  const classifierInstruction =
    `Classify the user's prompt. Respond ONLY JSON with keys:
{
  "is_academic": boolean,      // true if the topic is suitable for academic coursework or exam questions
  "domain": string,            // one of: mathematics, physics, chemistry, biology, earth_science, astronomy, computer_science, engineering, statistics, economics, social_science, humanities, arts, other
  "is_stem": boolean,          // true only for: mathematics, physics, chemistry, biology, earth_science, astronomy, computer_science, engineering, statistics
  "confidence": number,        // 0..1
  "why": string                // one short sentence
}

User prompt:
"""${prompt}"""`;

  const resp = await client.responses.create({
    model: "o4-mini",
    input: [{ role: "user", content: classifierInstruction }],
    max_output_tokens: 300,
  });

  const text = (resp as any).output_text as string | undefined;
  if (!text) return undefined;

  try {
    const parsed = JSON.parse(text);
    return parsed as {
      is_academic: boolean;
      domain: string;
      is_stem: boolean;
      confidence: number;
      why?: string;
    };
  } catch {
    return undefined;
  }
}

/* ============================== TEXT UTILITIES ============================= */

function getOutputText(resp: any) {
  if (resp?.output_text) return resp.output_text as string;
  if (Array.isArray(resp?.output)) {
    return resp.output
      .map((p: any) =>
        Array.isArray(p.content)
          ? p.content
              .filter((c: any) => c.type === "output_text")
              .map((c: any) => c.text)
              .join("\n")
          : ""
      )
      .join("\n");
  }
  return "";
}
function tryParseJson<T = any>(s: string): T | undefined {
  try { return JSON.parse(s); } catch { return undefined; }
}
function scrubJsonLike(s: string) {
  return s.replace(/\uFEFF/g, "").replace(/^[\s`]+|[\s`]+$/g, "");
}
function stripTrailingCommas(json: string) {
  return json.replace(/,\s*([}\]])/g, "$1");
}
function extractQuestionsFromText(full: string) {
  if (!full) return undefined;
  // 1) ```json ... ```
  let m = full.match(/```(?:json|jsonc)?\s*([\s\S]*?)```/i);
  if (!m) m = full.match(/```+\s*([\s\S]*?)```+/);
  if (m?.[1]) {
    const rawBlock = stripTrailingCommas(scrubJsonLike(m[1]));
    const parsed = tryParseJson(rawBlock);
    if (parsed?.questions && Array.isArray(parsed.questions)) return parsed;
  }
  // 2) pure JSON
  const trimmed = scrubJsonLike(full.trim());
  const pure = tryParseJson(trimmed);
  if (pure?.questions && Array.isArray(pure.questions)) return pure;
  // 3) first {...} slice
  const start = full.indexOf("{");
  const end = full.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const slice = stripTrailingCommas(scrubJsonLike(full.slice(start, end + 1)));
    const parsed = tryParseJson(slice);
    if (parsed?.questions && Array.isArray(parsed.questions)) return parsed;
  }
  return undefined;
}
function normalizeItems(json: any): QuestionItem[] | undefined {
  if (!json?.questions || !Array.isArray(json.questions)) return undefined;
  return json.questions.map((q: any, i: number) => ({
    id: Number.isFinite(q?.id) ? Number(q.id) : i + 1,
    stem_md: String(q?.stem_md ?? "").trim(),
    options: {
      A: String(q?.options?.A ?? "").trim(),
      B: String(q?.options?.B ?? "").trim(),
      C: String(q?.options?.C ?? "").trim(),
      D: String(q?.options?.D ?? "").trim(),
    },
    answer: (String(q?.answer ?? "A").toUpperCase() as "A" | "B" | "C" | "D"),
    explanation_md: String(q?.explanation_md ?? "").trim(),
  }));
}

/* ================================ HANDLER ================================= */

export async function POST(req: Request) {
  try {
    const { prompt, count } = (await req.json()) as { prompt?: string; count?: number };
    const n = Number.isFinite(count) ? Math.max(1, Math.min(10, Number(count))) : 5;

    if (!prompt || prompt.trim().length < 5) {
      return NextResponse.json({ error: "Please provide a brief description (≥5 chars)." }, { status: 400 });
    }

    // ---- 0) SCREEN: block non-academic / non-STEM prompts ----
    let allow = false;
    let classification: any = null;

    if (quickIsLikelySTEM(prompt)) {
      allow = true; // obvious STEM, skip model check
    } else {
      classification = await classifyPromptWithModel(prompt);
      if (classification?.is_academic && (classification?.is_stem || STEM_DOMAINS.has(String(classification?.domain ?? "").toLowerCase()))) {
        allow = true;
      }
    }

    if (!allow) {
      return NextResponse.json(
        {
          error: "This endpoint only accepts academic STEM prompts (e.g., maths, physics, chemistry, biology, earth/space, CS, engineering, statistics).",
          classification: classification ?? { inferred: "non_stem_or_non_academic" },
        },
        { status: 422 }
      );
    }

    // ---- 1) GENERATE (free text; encourage fenced JSON) ----
    const system =
      "You are a careful STEM tutor. Generate multiple-choice (A–D) questions that are easy to render in apps. " +
      "Use Markdown/LaTeX inside strings ($...$ or $$...$$). Keep explanations brief (1–3 lines).";
    const userContent =
      `Generate exactly ${n} multiple-choice questions based on:\n“${prompt.trim()}”.\n\n` +
      `Return a single fenced JSON block FIRST with shape:\n` +
      `{\n  "version": 1,\n  "questions": [ { "id": 1, "stem_md": "...", "options": {"A":"...","B":"...","C":"...","D":"..."}, "answer":"A", "explanation_md":"..." } ]\n}\n` +
      `After the JSON, you MAY include a readable Markdown version.`;

    const gen = await client.responses.create({
      model: "o4-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      max_output_tokens: 10000,
    });

    const rawText = getOutputText(gen);

    // ---- 1a) Local extract + validate ----
    const extracted = extractQuestionsFromText(rawText);
    const localParsed = extracted ?? tryParseJson(rawText);
    const localCheck = localParsed ? Z_MCQ.safeParse(localParsed) : ({ success: false } as const);

    if (localCheck.success && localParsed!.questions.length === n) {
      const items = normalizeItems(localParsed);
      if (items?.length) {
        return NextResponse.json({
          items,
          validated: { ok: true, method: "local", errors: [] },
        });
      }
    }

    // ---- 2) Model validate/repair to JSON schema (pure JSON, no fences) ----
    const validatorPrompt =
      `Validate and repair the following content into STRICT JSON that conforms to this schema.\n` +
      `- Produce exactly ${n} questions.\n` +
      `- Do NOT include code fences or any extra text — only a single JSON object.\n\n` +
      `SCHEMA (JSON Schema):\n${JSON.stringify(MCQ_JSON_SCHEMA, null, 2)}\n\n` +
      `ORIGINAL MODEL OUTPUT (may contain Markdown):\n${rawText}\n\n` +
      (localParsed ? `POSSIBLE PARTIAL JSON:\n${JSON.stringify(localParsed).slice(0, 4000)}\n` : ``);

    const val = await client.responses.create({
      model: "o4-mini",
      input: [{ role: "user", content: validatorPrompt }],
      text: { format: "json" }, // return clean JSON only
      temperature: 0,
      max_output_tokens: 10000,
    });

    const valText = getOutputText(val);
    const valJson = tryParseJson(valText);
    const finalCheck = valJson ? Z_MCQ.safeParse(valJson) : ({ success: false } as const);

    if (finalCheck.success) {
      const fixed = { ...valJson } as any;
      if (Array.isArray(fixed.questions)) fixed.questions = fixed.questions.slice(0, n);
      const items = normalizeItems(fixed);
      if (items?.length) {
        return NextResponse.json({
          items,
          validated: { ok: true, method: "model", errors: [] },
        });
      }
    }

    // ---- 3) Last resort: expose raw for debugging (client will show nicely) ----
    return NextResponse.json(
      {
        error: "Could not normalize output to schema.",
        raw: rawText,
      },
      { status: 200 }
    );
  } catch (err: any) {
    if (err instanceof APIError) {
      if (err.status === 429) {
        return NextResponse.json(
          {
            error:
              "Your API project has insufficient quota. Ensure your Project has billing enabled and use a Project API key.",
            detail: err.error?.message ?? "insufficient_quota",
          },
          { status: 429 }
        );
      }
      if (err.status === 401) {
        return NextResponse.json(
          {
            error: "Unauthorized. Check OPENAI_API_KEY (Project key).",
            detail: err.error?.message ?? "unauthorized",
          },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: "Upstream API error.", detail: err.error?.message },
        { status: err.status ?? 500 }
      );
    }
    console.error("generate-math error:", err);
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}
