import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";

const Z_SEARCH_BODY = z.object({
  query: z.string().trim().min(2).max(300),
  threshold: z.number().min(0).max(1).default(0.65),
  topN: z.number().int().min(1).max(50).default(10),
});

type SearchResult = {
  qid: string;
  confidence?: number;
  score?: number;
  duplicate_class?: string;
  reason?: string;
  question?: {
    stem?: string;
    options?: string[];
    answer?: string;
    explanation?: string;
    metadata?: Record<string, unknown>;
  };
};

function runPythonSearch(payload: { query: string; top_n: number }) {
  const scriptPath = path.join(process.cwd(), "scripts", "search_rag_questions.py");
  const bankPath = path.join(process.cwd(), "data", "paper_extract_bank.jsonl");

  return new Promise<any>((resolve, reject) => {
    const child = spawn("python", [scriptPath, "--bank", bankPath], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: process.cwd(),
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Python search exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("Python search returned invalid JSON"));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = Z_SEARCH_BODY.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload." }, { status: 400 });
    }

    const { query, threshold, topN } = parsed.data;
    const py = await runPythonSearch({ query, top_n: topN });
    const rawResults: SearchResult[] = Array.isArray(py?.results) ? py.results : [];
    const results = rawResults.filter((r) => Number(r.confidence ?? 0) > threshold);

    return NextResponse.json({
      query,
      threshold,
      tookMs: py?.took_ms ?? null,
      counts: {
        loaded: py?.counts?.loaded ?? 0,
        raw: rawResults.length,
        filtered: results.length,
      },
      results,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unexpected error when searching RAG bank." },
      { status: 500 }
    );
  }
}
