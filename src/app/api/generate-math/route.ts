
import { NextResponse } from "next/server";
import OpenAI, { APIError } from "openai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import path from "node:path";
// DeepSeek 通过 OpenAI SDK 兼容调用
const deepseekClient = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

async function callDeepSeek(messages: any[], max_tokens = 10000, model = "deepseek-reasoner") {
  const completion = await deepseekClient.chat.completions.create({
    messages,
    model: model,
    max_tokens,
  });
  return {
    choices: [
      {
        message: {
          content: completion.choices?.[0]?.message?.content || ""
        }
      }
    ]
  };
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* =============================== TAXONOMY (VCE-aligned) =============================== */
// Top-level "areas" are the four VCE Mathematics studies
const AREAS = [
  "Mathematical Methods",
  "Specialist Mathematics",
  "General Mathematics",
  "Foundation Mathematics",
] as const;
type Area = typeof AREAS[number];

const SUBJECTS: Record<Area, string[]> = {
  "Mathematical Methods": [
    "Functions and Graphs",
    "Algebra",
    "Calculus",
    "Probability and Statistics",
  ],
  "Specialist Mathematics": [
    "Algebra, Number and Structure",
    "Functions, Relations and Graphs",
    "Calculus",
    "Discrete Mathematics",
    "Space and Measurement",
    "Data Analysis, Probability and Statistics",
  ],
  "General Mathematics": [
    "Data Analysis",
    "Recursion and Financial Modelling",
    "Matrices",
    "Networks and Decision Mathematics",
  ],
  "Foundation Mathematics": [
    "Algebra, Number and Structure",
    "Data Analysis, Probability and Statistics",
    "Discrete Mathematics",
    "Space and Measurement",
  ],
};

const TOPICS: Record<string, string[]> = {
  /* ========== Mathematical Methods ========== */
  "Functions and Graphs": [
    "Function Concepts and Notation",
    "Polynomial Functions",
    "Rational, Power, Exponential, Logarithmic",
    "Circular Trigonometric Functions",
    "Transformations and Combinations",
    "Inverses, Domains and Ranges",
    "Graph Features and Asymptotes",
  ],
  "Algebra": [
    "Indices and Logarithms",
    "Factorisation and Partial Fractions (simple)",
    "Equations and Inequalities",
    "Trig Identities and Exact Values",
  ],
  "Calculus": [
    "Limits and Continuity",
    "Differentiation Rules (chain/product/quotient)",
    "Applications of Differentiation (rates/optima)",
    "Antiderivatives and Definite Integrals",
    "Area Under and Between Curves",
    "Introductory Differential Equations (contexts)",
  ],
  "Probability and Statistics": [
    "Discrete Random Variables (incl. Binomial)",
    "Continuous Random Variables (Normal)",
    "Expected Value and Variance",
    "Conditional Probability and Independence",
    "Sampling and Simulation Ideas",
  ],

  /* ========== Specialist Mathematics ========== */
  "Algebra, Number and Structure": [
    "Complex Numbers (algebra/geometry)",
    "Sequences and Series",
    "Binomial Theorem",
    "Advanced Recursions and Closed Forms",
  ],
  "Functions, Relations and Graphs": [
    "Parametric and Piecewise Definitions",
    "Further Trigonometry (inverse trig, identities)",
    "Alternative Representations (incl. polar where specified)",
  ],
  "Discrete Mathematics": [
    "Statement Logic and Quantifiers",
    "Proof (direct, contrapositive, contradiction)",
    "Mathematical Induction",
  ],
  "Space and Measurement": [
    "Vectors in 2D and 3D",
    "Scalar and Vector Products",
    "Lines and Planes",
    "Kinematics with Vectors",
  ],
  "Data Analysis, Probability and Statistics": [
    "Combinatorics and Counting Arguments",
    "Distributions beyond Methods scope",
    "Expectation, Variance and Transformations",
  ],

  /* ========== General Mathematics ========== */
  "Data Analysis": [
    "Univariate and Bivariate Summaries",
    "Correlation and Least Squares Regression",
    "Residuals and Transformations",
    "Time Series (smoothing/trend/seasonality/forecasting)",
  ],
  "Recursion and Financial Modelling": [
    "Recurrence Relations (linear/geometric)",
    "Simple vs Compound Interest",
    "Annuities and Perpetuities",
    "Amortisation Schedules and Loans",
    "Nominal vs Effective Rates; TVM Concepts",
  ],
  "Matrices": [
    "Matrix Arithmetic and Inverses (2×2 where applicable)",
    "Transition Matrices and Markov Chains",
    "Steady State and Long-Run Behaviour",
    "Applications to Population Models",
  ],
  "Networks and Decision Mathematics": [
    "Graphs, Euler and Hamilton Concepts",
    "Planarity and Trees",
    "Minimum Spanning Trees (Prim/Kruskal)",
    "Shortest Path (Dijkstra)",
    "Max-Flow/Min-Cut",
    "Scheduling and Critical Path (CPM, crashing basics)",
  ],
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

async function persistToLocalRagBank(items: QuestionItem[]) {
  if (!items.length) return;
  const scriptPath = path.join(process.cwd(), "scripts", "ingest_generated_questions.py");
  const bankPath = path.join(process.cwd(), "data", "paper_extract_bank.jsonl");
  const payload = JSON.stringify({ version: 1, questions: items });

  await new Promise<void>((resolve, reject) => {
    const child = spawn("python", [scriptPath, "--bank", bankPath], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: process.cwd(),
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr || `Python ingestion exited with code ${code}`));
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}

/* ================================= Handler ================================= */

export async function POST(req: Request) {
console.log("[generate-math] POST handler invoked");
  try {
    // The client sends these (PromptBox does it in the previous step)
    console.log("[generate-math] Parsing request body...");
    const body = (await req.json()) as {
      prompt?: string;
      count?: number;
      authUserId?: string;   // Supabase user ID
      area?: string;         // optional taxonomy hints
      subject?: string;
      topic?: string;
      model?: string;
    };

    const prompt = body?.prompt;
    const count = body?.count;
    const n = Number.isFinite(count) ? Math.max(1, Math.min(10, Number(count))) : 5;
    const model = body?.model || "o4-mini";
    console.log("[generate-math] prompt:", prompt, "model:", model);

    if (!prompt || prompt.trim().length < 5) {
      console.log("[generate-math] Invalid prompt, aborting.");
      return NextResponse.json({ error: "Please provide a brief description (≥5 chars)." }, { status: 400 });
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

    // ========== 支持模型切换 =============
    let gen: any;
    if (model === "deepseek-chat" || model === "deepseek-reasoner") {
      console.log("[generate-math] Using DeepSeek model:", model);
      gen = await callDeepSeek([
        { role: "system", content: system },
        { role: "user", content: userContent },
      ], 10000, model);
      console.log("[generate-math] DeepSeek response received");
    } else {
      console.log("[generate-math] Using OpenAI model:", model);
      gen = await client.responses.create({
        model,
        input: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        max_output_tokens: 10000,
      });
      console.log("[generate-math] OpenAI response received");
    }

    // DeepSeek 返回格式兼容
    let rawText = "";
    if (gen?.choices?.[0]?.message?.content) {
      rawText = gen.choices[0].message.content;
    } else {
      rawText = getOutputText(gen);
    }
    console.log("[generate-math] rawText length:", rawText.length);

    // --- local extract + validate ---
    // console.log(rawText);
    const extracted = extractQuestionsFromText(rawText);
    // console.log("extracted:", extracted);
    const localParsed = extracted ?? tryParseJson(rawText);
    const localCheck = localParsed ? Z_MCQ.safeParse(localParsed) : ({ success: false } as const);
    console.log("[generate-math] localCheck.success:", localCheck.success);

    // Helper: persist + build links back to created rows
    const maybePersist = async (items: QuestionItem[]) => {
      console.log("[generate-math] maybePersist called, items count:", items.length);
      const authUserId = body?.authUserId?.trim();
      if (!authUserId) return { links: [] as Array<{ localId: number; questionId: string; attemptId: string; answer: "A"|"B"|"C"|"D" }> };

      let student = await prisma.student.findUnique({
        where: { authUserId },
        select: { id: true, email: true, name: true },
      });

      if (!student) {
        try {
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
          );
          const { data: sbStudent } = await supabase
            .from("Student")
            .select("email, name")
            .eq("authUserId", authUserId)
            .maybeSingle();

          if (sbStudent?.email) {
            const name = sbStudent.name || sbStudent.email.split("@")[0];
            try {
              student = await prisma.student.create({
                data: { authUserId, email: sbStudent.email, name },
                select: { id: true, email: true, name: true },
              });
            } catch (createError: any) {
              if (createError.code === "P2002") {
                const existingByEmail = await prisma.student.findUnique({
                  where: { email: sbStudent.email },
                  select: { id: true, email: true, name: true, authUserId: true },
                });
                if (existingByEmail && !existingByEmail.authUserId) {
                  student = await prisma.student.update({
                    where: { email: sbStudent.email },
                    data: { authUserId },
                    select: { id: true, email: true, name: true },
                  });
                }
              }
            }
          }
        } catch {
          // best effort; fall through if we still don't have a student
        }
      }

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
      console.log("[generate-math] Fast path: local JSON valid and taxonomy-compliant");
      const allValid = localParsed!.questions.every((q: any) => isValidPath(q.area, q.subject, q.topic));
      if (allValid) {
        const items = normalizeItems(localParsed) ?? [];
        if (items.length) {
          try {
            await persistToLocalRagBank(items);
          } catch (ingestErr: any) {
            console.error("[generate-math] Local RAG ingest failed:", ingestErr?.message ?? ingestErr);
          }
          const { links } = await maybePersist(items);
          return NextResponse.json({ items, links });
        }
      }
    }

    // --- Repair/validate with model if needed ---
    const validatorPrompt =
      // ...existing code...
      `Validate/repair the following into STRICT JSON that matches this schema and taxonomy. ` +
      `Reject/adjust any subject/topic that is outside the taxonomy by mapping to the closest valid one.\n\n` +
      `SCHEMA:\n${JSON.stringify(MCQ_JSON_SCHEMA, null, 2)}\n\n` +
      `TAXONOMY:\nAREAS=${JSON.stringify(AREAS)}\nSUBJECTS=${JSON.stringify(SUBJECTS)}\nTOPICS=${JSON.stringify(TOPICS)}\n\n` +
      `ORIGINAL OUTPUT:\n${rawText}\n\n` +
      (localParsed ? `PARTIAL JSON:\n${JSON.stringify(localParsed).slice(0, 4000)}\n` : ``);

    console.log("[generate-math] Running OpenAI validator for schema repair...");

    let val: any;
    if (model === "deepseek-chat" || model === "deepseek-reasoner") {
      val = await callDeepSeek([
        { role: "user", content: validatorPrompt },
      ], 10000, model);
    } 
    else {
      val = await client.responses.create({
        model: "o4-mini",
        input: [{ role: "user", content: validatorPrompt }],
        max_output_tokens: 10000,
      });
    }
    console.log("[generate-math] Validator response received");

    const valText = (val as any).output_text as string | undefined;
    const valJson = valText ? tryParseJson(valText) : undefined;
    const finalCheck = valJson ? Z_MCQ.safeParse(valJson) : ({ success: false } as const);

    if (finalCheck.success) {
      console.log("[generate-math] Validator fixed output is valid");
      const fixed = { ...valJson } as any;
      if (Array.isArray(fixed.questions)) {
        fixed.questions = fixed.questions
          .slice(0, n)
          .filter((q: any) => isValidPath(q.area, q.subject, q.topic));
      }
      const items = normalizeItems(fixed) ?? [];
      if (items.length) {
        try {
          await persistToLocalRagBank(items);
        } catch (ingestErr: any) {
          console.error("[generate-math] Local RAG ingest failed:", ingestErr?.message ?? ingestErr);
        }
        const { links } = await maybePersist(items);
        return NextResponse.json({ items, links });
      }
    }

    return NextResponse.json({ error: "Could not normalize output to schema." }, { status: 200 });
  } catch (err: any) {
    if (err instanceof APIError) {
      return NextResponse.json({ error: "Upstream API error.", detail: err.error?.message, stack: err.stack }, { status: err.status ?? 500 });
    }
    console.error("generate-math error:", err);
    return NextResponse.json({ error: err?.message ?? "Unexpected error", stack: err?.stack, raw: err }, { status: 500 });
  }
}
