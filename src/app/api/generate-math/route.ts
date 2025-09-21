import { NextResponse } from "next/server";
import OpenAI, { APIError } from "openai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* =============================== TAXONOMY =============================== */
// Keep this small and authoritative. You can move it to lib/taxonomy later.
const AREAS = [
  "Mathematics","Physics","Chemistry","Biology","English","Languages","Computer Science"
] as const;
type Area = typeof AREAS[number];

const SUBJECTS: Record<Area, string[]> = {
  Mathematics: ["Algebra","Functions","Calculus","Probability","Statistics","Geometry","Trigonometry"],
  Physics: ["Mechanics","Waves","Electricity","Modern Physics","Thermodynamics"],
  Chemistry: ["Stoichiometry","Atomic Structure","Bonding","Thermochemistry","Equilibrium","Acids & Bases","Redox"],
  Biology: ["Cell Biology","Genetics","Evolution","Human Physiology","Ecology"],
  English: ["Reading","Writing","Language Analysis","Argument"],
  Languages: ["Vocabulary","Grammar","Listening","Reading","Writing","Speaking"],
  "Computer Science": ["Algorithms","Data Structures","Complexity","Programming"],
};

const TOPICS: Record<string, string[]> = {
  Algebra: ["Linear Equations","Quadratics","Inequalities","Exponentials","Logs","Polynomials"],
  Functions: ["Graphing","Transformations","Inverses","Asymptotes"],
  Calculus: ["Limits","Derivatives","Applications of Derivatives","Integrals","Series","Differential Equations"],
  Probability: ["Combinatorics","Discrete RVs","Continuous RVs","Bayes","Markov Chains"],
  Statistics: ["Descriptive","Inference","Regression","Hypothesis Testing"],
  Geometry: ["Euclidean","Coordinate","Circles","Similarity","Congruence"],
  Trigonometry: ["Trig Identities","Radian Measure","Graphs","Equations"],
  // add more as needed
};

function isValidPath(area: string, subject: string, topic: string) {
  if (!AREAS.includes(area as Area)) return false;
  const sOK = SUBJECTS[area as Area]?.includes(subject);
  const tOK = TOPICS[subject]?.includes(topic);
  return Boolean(sOK && tOK);
}

/* =============================== Types =============================== */

type QuestionItem = {
  id: number;
  stem_md: string;
  options: { A: string; B: string; C: string; D: string };
  answer: "A" | "B" | "C" | "D";
  explanation_md: string;
  graph?: {
    kind: "function" | "points";
    title?: string;
    xLabel?: string;
    yLabel?: string;
    // function plot
    expr?: string;
    domain?: [number, number];
    samples?: number;
    // points plot
    x?: number[];
    y?: number[];
  };
  // NEW classification fields
  area: Area;
  subject: string;
  topic: string;
  skillIds?: string[];
  difficulty?: number; // 1..5
};

/* =============================== MCQ SCHEMAS =============================== */

const Z_GRAPH_FN = z.object({
  kind: z.literal("function"),
  title: z.string().optional(),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  expr: z.string(),
  domain: z.tuple([z.number(), z.number()]).optional(),
  samples: z.number().int().min(10).max(2000).optional(),
});

const Z_GRAPH_POINTS = z.object({
  kind: z.literal("points"),
  title: z.string().optional(),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  x: z.array(z.number()),
  y: z.array(z.number()),
});

const Z_GRAPH = z.union([Z_GRAPH_FN, Z_GRAPH_POINTS]);

const Z_MCQ_QUESTION = z.object({
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
  graph: Z_GRAPH.optional(),
  // NEW classification fields (validated later against taxonomy)
  area: z.enum(AREAS),
  subject: z.string(),
  topic: z.string(),
  skillIds: z.array(z.string()).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
});

const Z_MCQ = z.object({
  version: z.literal(1),
  questions: z.array(Z_MCQ_QUESTION),
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
          graph: {
            anyOf: [
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  kind: { type: "string", enum: ["function"] },
                  title: { type: "string" },
                  xLabel: { type: "string" },
                  yLabel: { type: "string" },
                  expr: { type: "string" },
                  domain: {
                    type: "array",
                    items: { type: "number" },
                    minItems: 2,
                    maxItems: 2,
                  },
                  samples: { type: "integer", minimum: 10, maximum: 2000 },
                },
                required: ["kind", "expr"],
              },
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  kind: { type: "string", enum: ["points"] },
                  title: { type: "string" },
                  xLabel: { type: "string" },
                  yLabel: { type: "string" },
                  x: { type: "array", items: { type: "number" } },
                  y: { type: "array", items: { type: "number" } },
                },
                required: ["kind", "x", "y"],
              },
            ],
          },
          // NEW classification in JSON schema
          area: { type: "string", enum: [...AREAS] },
          subject: { type: "string" },
          topic: { type: "string" },
          skillIds: { type: "array", items: { type: "string" } },
          difficulty: { type: "integer", minimum: 1, maximum: 5 },
        },
        required: ["id", "stem_md", "options", "answer", "explanation_md", "area", "subject", "topic"],
      },
    },
  },
  required: ["version", "questions"],
} as const;

/* ============================ STEM Gate (client still does heuristic) ============================ */

const STEM_DOMAINS = new Set([
  "mathematics","math","physics","chemistry","biology","earth_science","earth science",
  "geology","astronomy","space_science","computer_science","computer science","cs",
  "engineering","statistics","data_science",
]);

function quickIsLikelySTEM(s: string) {
  const t = s.toLowerCase();
  const hits = [
    "math","maths","calculus","algebra","geometry","trigonometry","differentiation","integration","limit","series",
    "probability","statistics","matrix","vector","complex number",
    "physics","mechanics","electric","magnet","thermo","optics","quantum","kinematics",
    "chemistry","stoichiometry","equilibrium","acid","base","redox","organic","bond",
    "biology","genetics","cell","enzyme","ecology","evolution","physiology",
    "geology","earth","plate tectonics","seismology","mineral",
    "astronomy","astrophysics","cosmology","planet","orbit",
    "computer","algorithm","data structure","complexity","programming","cs",
    "engineering","circuit","signal","control","materials","mechanical","electrical",
  ];
  return hits.some((k) => t.includes(k));
}

async function classifyPromptWithModel(prompt: string) {
  const classifierInstruction =
    `Classify the user's prompt. Respond ONLY JSON:
{"is_academic": boolean, "domain": string, "is_stem": boolean, "confidence": number}
Prompt:
"""${prompt}"""`;

  const resp = await client.responses.create({
    model: "o4-mini",
    input: [{ role: "user", content: classifierInstruction }],
    max_output_tokens: 200,
  });

  try { return JSON.parse((resp as any).output_text || "{}"); } catch { return undefined; }
}

/* ============================== Helpers (unchanged+small tweaks) ============================== */

function getOutputText(resp: any) {
  if (resp?.output_text) return resp.output_text as string;
  if (Array.isArray(resp?.output)) {
    return resp.output
      .map((p: any) =>
        Array.isArray(p.content)
          ? p.content.filter((c: any) => c.type === "output_text").map((c: any) => c.text).join("\n")
          : ""
      )
      .join("\n");
  }
  return "";
}
function tryParseJson<T = any>(s: string) { try { return JSON.parse(s); } catch { return undefined; } }
function scrubJsonLike(s: string) { return s.replace(/\uFEFF/g, "").replace(/^[\s`]+|[\s`]+$/g, ""); }
function stripTrailingCommas(json: string) { return json.replace(/,\s*([}\]])/g, "$1"); }
function extractQuestionsFromText(full: string) {
  if (!full) return undefined;
  let m = full.match(/```(?:json|jsonc)?\s*([\s\S]*?)```/i) || full.match(/```+\s*([\s\S]*?)```+/);
  if (m?.[1]) {
    const raw = stripTrailingCommas(scrubJsonLike(m[1]));
    const parsed = tryParseJson(raw);
    if (parsed?.questions && Array.isArray(parsed.questions)) return parsed;
  }
  const trimmed = scrubJsonLike(full.trim());
  const pure = tryParseJson(trimmed);
  if (pure?.questions && Array.isArray(pure.questions)) return pure;
  const start = full.indexOf("{"), end = full.lastIndexOf("}");
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
    graph: q?.graph,
    area: (q?.area ?? "Mathematics") as Area,
    subject: String(q?.subject ?? "Algebra"),
    topic: String(q?.topic ?? "Linear Equations"),
    skillIds: Array.isArray(q?.skillIds) ? q.skillIds.map((s: any) => String(s)) : undefined,
    difficulty: Number.isFinite(q?.difficulty) ? Number(q.difficulty) : undefined,
  })).filter((q: { area: string; subject: string; topic: string; }) => isValidPath(q.area, q.subject, q.topic)); // drop invalid paths defensively
}

/* ================================= Handler ================================= */
export async function POST(req: Request) {
  try {
    // The client sends these (PromptBox does it in the previous step)
    const body = (await req.json()) as {
      prompt?: string;
      count?: number;
      authUserId?: string;   // Supabase user ID
      area?: string;         // optional taxonomy hints
      subject?: string;
      topic?: string;
    };

    const prompt = body?.prompt;
    const count = body?.count;
    const n = Number.isFinite(count) ? Math.max(1, Math.min(10, Number(count))) : 5;

    if (!prompt || prompt.trim().length < 5) {
      return NextResponse.json({ error: "Please provide a brief description (≥5 chars)." }, { status: 400 });
    }

    // --- STEM gate ---
    let allow = quickIsLikelySTEM(prompt);
    if (!allow) {
      const cls = await classifyPromptWithModel(prompt);
      if (cls?.is_academic && (cls?.is_stem || STEM_DOMAINS.has(String(cls?.domain ?? "").toLowerCase()))) {
        allow = true;
      }
    }
    if (!allow) {
      return NextResponse.json({ error: "This endpoint only accepts academic STEM prompts." }, { status: 422 });
    }

    // --- Generation prompt (same shape you already had) ---
    const system =
      "You are a careful STEM tutor. Generate high-quality multiple-choice (A–D) questions. " +
      "Use Markdown/LaTeX inside strings. Keep explanations brief (1–3 lines). " +
      'If a simple plot would help, include an optional "graph" object. ' +
      "Every question MUST include classification fields: area, subject, topic, and SHOULD include skillIds and difficulty when reasonable. " +
      `Allowed areas: ${AREAS.join(", ")}. Subjects must belong to area; topics must belong to subject.`;

    const schemaSnippet =
`Return a fenced JSON object EXACTLY like:
{
  "version": 1,
  "questions": [
    {
      "id": 1,
      "stem_md": "...",
      "options": {"A":"...","B":"...","C":"...","D":"..."},
      "answer":"A",
      "explanation_md":"...",
      "graph": { "kind":"function","expr":"sin(x)","domain":[-6.283,6.283],"samples":300,"title":"y = sin(x)","xLabel":"x","yLabel":"y" },
      "area": "Mathematics",
      "subject": "Calculus",
      "topic": "Derivatives",
      "skillIds": ["calculus.derivative.rules"],
      "difficulty": 3
    }
  ]
}`;

    const taxonomySnippet =
`Authoritative taxonomy:
AREAS = ${JSON.stringify(AREAS)}
SUBJECTS = ${JSON.stringify(SUBJECTS)}
TOPICS = ${JSON.stringify(TOPICS)}`;

    const userContent =
      `Generate exactly ${n} multiple-choice questions for:\n“${prompt.trim()}”.\n\n` +
      `${taxonomySnippet}\n\n` +
      `${schemaSnippet}\n\n` +
      `Only include topics that exist in the taxonomy for the chosen subject. ` +
      `Return the fenced JSON FIRST. After the JSON you MAY include a readable Markdown copy for humans.`;

    const gen = await client.responses.create({
      model: "o4-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      max_output_tokens: 10000,
    });

    const rawText = getOutputText(gen);

    // --- local extract + validate ---
    const extracted = extractQuestionsFromText(rawText);
    const localParsed = extracted ?? tryParseJson(rawText);
    const localCheck = localParsed ? Z_MCQ.safeParse(localParsed) : ({ success: false } as const);

    // Helper: persist + build links back to created rows
    const maybePersist = async (items: QuestionItem[]) => {
      const authUserId = body?.authUserId?.trim();
      if (!authUserId) return { links: [] as Array<{ localId: number; questionId: string; attemptId: string; answer: "A"|"B"|"C"|"D" }> };

      const student = await prisma.student.findUnique({
        where: { authUserId },
        select: { id: true },
      });
      if (!student) return { links: [] };

      const links: Array<{ localId: number; questionId: string; attemptId: string; answer: "A"|"B"|"C"|"D" }> = [];

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        for (const it of items) {
          // Create the Question (store classification + difficulty)
          const q = await tx.question.create({
            data: {
              prompt: it.stem_md.slice(0, 5000),
              area: it.area,
              subject: it.subject,
              topic: it.topic,
              difficulty: it.difficulty ?? null,
            },
            select: { id: true },
          });

          // Create the Attempt as a pending result (correct=false until the student submits)
          const a = await tx.attempt.create({
            data: {
              studentId: student.id,
              questionId: q.id,
              correct: false,                // will be updated on submit
              skillIds: it.skillIds ?? [],
              difficulty: it.difficulty ?? null,
              timeTakenMs: null,
              area: it.area,
              subject: it.subject,
              topic: it.topic,
            },
            select: { id: true },
          });

          // Return linkage + the expected answer so client can check on submit
          links.push({ localId: it.id, questionId: q.id, attemptId: a.id, answer: it.answer });
        }
      });

      return { links };
    };

    // Fast path – local JSON is valid and taxonomy-compliant
    if (localCheck.success && localParsed!.questions.length === n) {
      const allValid = localParsed!.questions.every((q: any) => isValidPath(q.area, q.subject, q.topic));
      if (allValid) {
        const items = normalizeItems(localParsed) ?? [];
        if (items.length) {
          const { links } = await maybePersist(items);
          return NextResponse.json({ items, links });
        }
      }
    }

    // --- Repair/validate with model if needed ---
    const validatorPrompt =
      `Validate/repair the following into STRICT JSON that matches this schema and taxonomy. ` +
      `Reject/adjust any subject/topic that is outside the taxonomy by mapping to the closest valid one.\n\n` +
      `SCHEMA:\n${JSON.stringify(MCQ_JSON_SCHEMA, null, 2)}\n\n` +
      `TAXONOMY:\nAREAS=${JSON.stringify(AREAS)}\nSUBJECTS=${JSON.stringify(SUBJECTS)}\nTOPICS=${JSON.stringify(TOPICS)}\n\n` +
      `ORIGINAL OUTPUT:\n${rawText}\n\n` +
      (localParsed ? `PARTIAL JSON:\n${JSON.stringify(localParsed).slice(0, 4000)}\n` : ``);

    const val = await client.responses.create({
      model: "o4-mini",
      input: [{ role: "user", content: validatorPrompt }],
      max_output_tokens: 10000,
    });

    const valText = (val as any).output_text as string | undefined;
    const valJson = valText ? tryParseJson(valText) : undefined;
    const finalCheck = valJson ? Z_MCQ.safeParse(valJson) : ({ success: false } as const);

    if (finalCheck.success) {
      const fixed = { ...valJson } as any;
      if (Array.isArray(fixed.questions)) {
        fixed.questions = fixed.questions
          .slice(0, n)
          .filter((q: any) => isValidPath(q.area, q.subject, q.topic));
      }
      const items = normalizeItems(fixed) ?? [];
      if (items.length) {
        const { links } = await maybePersist(items);
        return NextResponse.json({ items, links });
      }
    }

    return NextResponse.json({ error: "Could not normalize output to schema." }, { status: 200 });
  } catch (err: any) {
    if (err instanceof APIError) {
      return NextResponse.json({ error: "Upstream API error.", detail: err.error?.message }, { status: err.status ?? 500 });
    }
    console.error("generate-math error:", err);
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}