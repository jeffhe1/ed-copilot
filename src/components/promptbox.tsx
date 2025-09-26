"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

import { compile } from "mathjs";
import { supabase } from "@/lib/supabaseClient";

/* ============================== Types & Schema ============================== */

const formSchema = z.object({
  prompt: z.string().min(5).max(300),
  count: z.coerce.number().int().min(1).max(10),
});
type FormValues = z.infer<typeof formSchema>;

type GraphSpec =
  | {
      kind: "function";
      title?: string;
      xLabel?: string;
      yLabel?: string;
      expr: string;
      domain?: [number, number];
      samples?: number;
    }
  | {
      kind: "points";
      title?: string;
      xLabel?: string;
      yLabel?: string;
      x: number[];
      y: number[];
    };

type QuizItem = {
  id: number;
  stem_md: string;
  options: { A: string; B: string; C: string; D: string };
  answer: "A" | "B" | "C" | "D";
  explanation_md: string;
  graph?: GraphSpec;
};

type ApiResponse =
  | { items?: undefined; links?: any; raw?: unknown; error?: string }
  | { items: QuizItem[]; links?: any; raw?: unknown }
  | any;

type LinkMap = { localId: number; questionId: string; attemptId: string; answer: "A" | "B" | "C" | "D" };

/* ============================== STEM Detection ============================== */

const STEM_HELP =
  "This tool only supports academic STEM prompts (maths, physics, chemistry, biology, earth/space, computer science, engineering, statistics). Please rephrase your prompt to a STEM topic.";

function isLikelySTEM(s: string): boolean {
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

/* ============================ Markdown + KaTeX ============================= */

function maskSegments(s: string) {
  type Seg = { ph: string; content: string };
  const segs: Seg[] = [];
  let text = s;
  let i = 0;

  const add = (re: RegExp) => {
    text = text.replace(re, (m) => {
      const ph = `\uE000PH${i++}\uE001`;
      segs.push({ ph, content: m });
      return ph;
    });
  };

  // Mask fences, inline code, links, images, HTML, then math
  add(/```[\s\S]*?```/g);                 // fenced code
  add(/`[^`]*`/g);                        // inline code
  add(/!\[[^\]]*\]\([^)]+\)/g);           // images
  add(/\[[^\]]*\]\([^)]+\)/g);            // links
  add(/<[^>]+>/g);                        // simple HTML tags
  add(/\$\$[\s\S]*?\$\$/g);               // block math
  add(/(?<!\$)\$[^$]*\$(?!\$)/g);         // inline math

  return {
    text,
    restore: (t: string) => segs.reduce((acc, { ph, content }) => acc.replace(ph, content), t),
  };
}

// A conservative whitelist of TeX commands to auto-wrap.
// Add more if your generator uses them.
const TEX_WHITELIST = new Set([
  // functions/symbols
  "alpha","beta","gamma","delta","epsilon","varepsilon","zeta","eta","theta","vartheta","iota","kappa","lambda","mu","nu","xi",
  "pi","varpi","rho","varrho","sigma","varsigma","tau","upsilon","phi","varphi","chi","psi","omega",
  "sin","cos","tan","csc","sec","cot","arcsin","arccos","arctan","sinh","cosh","tanh","ln","log","exp","sqrt",
  "frac","binom","cdot","times","pm","mp","le","ge","neq","infty","sum","prod","int","lim","deg",
  "overline","underline","vec","overrightarrow","to","rightarrow","left","Rightarrow","Rightarrow","dots","ldots","cdots","text",
]);

/**
 * Auto-wrap common LaTeX outside code/math:
 *  - \alpha, \frac{...}{...}, \sqrt(...), \text{...}
 *  - simple x^2, x_1 forms
 * Skips \\escaped, \* markdown escapes, and unknown \words.
 */
function autoWrapConservative(src: string): string {
  if (!src) return src;
  const mask = maskSegments(src);
  let s = mask.text;

  // Wrap whitelisted TeX commands with optional ^.../_... and ()/{...} groups.
  // This handles cases like:
  //   \sin^5(4x^2)      → $...$
  //   \sum_{i=1}^n      → $...$
  //   \frac{a}{b}       → $...$
  //   \sqrt{x+1}        → $...$
  // The big tail allows repeats of ^.../_... and ()/{...} in any order.
  s = s.replace(
    /(?<![\$\\])\\([A-Za-z]+)((?:\s*(?:\{[^{}]*\}|\([^()]*\)|\^(?:\{[^{}]*\}|\w+)|_(?:\{[^{}]*\}|\w+))*))/g,
    (_m, name: string, tail: string) => {
      if (!TEX_WHITELIST.has(name)) return `\\${name}${tail}`;
      return `$\\${name}${tail}$`;
    }
  );

  // Simple powers/subscripts outside math/code (kept for bare x^2, x_1 cases)
  s = s.replace(/(?<![\w$])([A-Za-z0-9])\^(\d+)(?![\w$])/g, (_m, b: string, e: string) => `$${b}^{${e}}$`);
  s = s.replace(/(?<![\w$])([A-Za-z])_(\d+)(?![\w$])/g, (_m, b: string, sub: string) => `$${b}_{${sub}}$`);

  return mask.restore(s);
}


export function MarkdownMath({ content }: { content: string }) {
  const safe = autoWrapConservative(content);
  return (
    <div className="space-y-2 leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]} // fail-soft
      >
        {safe}
      </ReactMarkdown>
    </div>
  );
}

/* =============================== Graph Renderer ============================ */

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

function GraphRenderer({ graph }: { graph: GraphSpec }) {
  const data = useMemo(() => {
    try {
      if (graph.kind === "function") {
        const expr = compile(graph.expr);
        const [a, b] = graph.domain ?? [-10, 10];
        const n = graph.samples ?? 300;
        const xs: number[] = [];
        const ys: number[] = [];
        const step = (b - a) / (n - 1);
        for (let i = 0; i < n; i++) {
          const x = a + i * step;
          const y = Number(expr.evaluate({ x }));
          if (Number.isFinite(y)) {
            xs.push(x);
            ys.push(y);
          }
        }
        return [{ x: xs, y: ys, type: "scatter", mode: "lines" as const }];
      } else {
        return [{ x: graph.x, y: graph.y, type: "scatter", mode: "markers" as const }];
      }
    } catch {
      return null;
    }
  }, [graph]);

  if (!data) return null;

  return (
    <div className="w-full my-2">
      <Plot
        data={data as any}
        layout={{
          title: graph.title ?? "",
          xaxis: { title: graph.xLabel ?? "x" },
          yaxis: { title: graph.yLabel ?? "y" },
          margin: { l: 40, r: 20, t: graph.title ? 40 : 10, b: 40 },
          autosize: true,
        }}
        useResizeHandler
        style={{ width: "100%", height: "280px" }}
        config={{ displayModeBar: false, responsive: true }}
      />
    </div>
  );
}

/* ============================ Interactive Quiz ============================= */

function InteractiveQuiz({
  items,
  links,
  authUserId,
  onNewPrompt,
}: {
  items: QuizItem[];
  links: LinkMap[];
  authUserId: string;
  onNewPrompt: () => void;
}) {
  const [responses, setResponses] = useState<Record<number, "A" | "B" | "C" | "D" | undefined>>({});
  const [submitted, setSubmitted] = useState(false);
  const [idx, setIdx] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState(false);

  const q = items[idx];
  const isFirst = idx === 0;
  const isLast = idx === items.length - 1;

  const score = useMemo(() => {
    if (!submitted) return null;
    let correct = 0;
    for (const it of items) if (responses[it.id] === it.answer) correct++;
    return { correct, total: items.length };
  }, [submitted, responses, items]);

  const linkByLocalId = useMemo(() => {
    const m = new Map<number, LinkMap>();
    for (const l of links || []) m.set(l.localId, l);
    return m;
  }, [links]);

  function setAnswer(value: "A" | "B" | "C" | "D") {
    setResponses((prev) => ({ ...prev, [q.id]: value }));
  }
  const goNext = () => { if (!isLast) setIdx((i) => i + 1); };
  const goBack = () => { if (!isFirst) setIdx((i) => i - 1); };

  /* ---------- NEW: per-question shuffled options ---------- */

  type ShuffledEntry = {
    originalKey: "A" | "B" | "C" | "D";   // original answer letter from payload
    displayKey: "A" | "B" | "C" | "D";    // letter shown after shuffle
    content: string;
  };

  function shuffleInPlace<T>(arr: T[]) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Build once per items load (stable across navigation)
  const shuffledById = useMemo(() => {
    const map = new Map<number, ShuffledEntry[]>();
    for (const it of items) {
      const entries = (["A", "B", "C", "D"] as const).map((k) => ({
        originalKey: k,
        content: it.options[k],
      }));
      const shuffled = shuffleInPlace(entries.slice());
      const labeled = shuffled.map((e, i) => ({
        ...e,
        displayKey: (["A", "B", "C", "D"][i] as "A" | "B" | "C" | "D"),
      }));
      map.set(it.id, labeled);
    }
    return map;
  }, [items]);

  const handleSubmitAll = async () => {
    setSubmitted(true);
    setSubmitError(null);
    setSubmitOk(false);

    const submissions = items
      .map((it) => {
        const link = linkByLocalId.get(it.id);
        const chosenOriginalKey = responses[it.id]; // <-- we stored ORIGINAL key
        if (!link || !chosenOriginalKey) return null;
        return {
          attemptId: link.attemptId,
          questionId: link.questionId,
          chosen: String(chosenOriginalKey).trim().toUpperCase() as "A" | "B" | "C" | "D",
          expected: String(link.answer).trim().toUpperCase() as "A" | "B" | "C" | "D",
        };
      })
      .filter(Boolean) as Array<{
        attemptId: string;
        questionId: string;
        chosen: "A" | "B" | "C" | "D";
        expected: "A" | "B" | "C" | "D";
      }>;

    if (submissions.length === 0) {
      setSubmitError("Nothing to submit. Please answer at least one question.");
      return;
    }

    try {
      const res = await fetch("/api/submit-attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authUserId, submissions }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to submit attempts");
      setSubmitOk(true);
    } catch (e: any) {
      setSubmitError(e?.message ?? "Unexpected error while submitting attempts.");
    }
  };

  const displayKeyFor = (qid: number, original: "A" | "B" | "C" | "D") => {
    const list = shuffledById.get(qid);
      return list?.find((e) => e.originalKey === original)?.displayKey ?? original;
  };

  const WRAP_WIDTH = "w-full sm:w-[760px]";

  return (
    <div className={`${WRAP_WIDTH} mx-auto space-y-6`}>
      {/* Top nav */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={goBack} disabled={isFirst}>
            Back
          </Button>
          <Button type="button" variant="outline" onClick={goNext} disabled={isLast}>
            Next
          </Button>
        </div>
        <div className="text-sm font-medium">Q{idx + 1} / {items.length}</div>
      </div>

      {submitted && score && (
        <div className="rounded-md border p-3 font-medium">
          Score: {score.correct}/{score.total}
        </div>
      )}
      {submitOk && <div className="rounded-md border p-3 text-green-700">Saved! Your answers have been recorded.</div>}
      {submitError && <div className="rounded-md border p-3 text-red-700">{submitError}</div>}

      {/* Question Card */}
      <Card className="w-full p-4 border bg-white flex flex-col">
        <div className="mb-2 font-semibold">Question {idx + 1}</div>

        {/* Stem */}
        <div className="mb-3 break-words [word-break:break-word]">
          <MarkdownMath content={q.stem_md} />
        </div>

        {/* Optional graph */}
        {q.graph ? <GraphRenderer graph={q.graph} /> : null}

        {/* Options (SHUFFLED) */}
        <div className="mt-2 space-y-2">
          <RadioGroup
            key={q.id} // remount when question changes
            value={responses[q.id] ?? ""}  // value = ORIGINAL KEY we store
            onValueChange={(v: "A" | "B" | "C" | "D") => setAnswer(v)}
            className="space-y-2"
            disabled={submitted}
          >
            {(shuffledById.get(q.id) ?? []).map(({ originalKey, displayKey, content }) => {
              const optId = `q${q.id}-${displayKey}`;
              const chosen = responses[q.id];
              const isSelected = chosen === originalKey;           // compare to original key
              const isCorrect  = submitted && q.answer === originalKey;
              const isWrong    = submitted && chosen === originalKey && chosen !== q.answer;

              return (
                <div
                  key={displayKey}
                  className={[
                    "flex items-center gap-3 rounded-lg border-2 px-3 py-3 transition w-full",
                    !submitted ? "hover:border-primary/50" : "",
                    isSelected && !submitted ? "border-primary ring-2 ring-primary/30" : "",
                    isCorrect ? "border-green-600 ring-2 ring-green-300" : "",
                    isWrong   ? "border-red-600 ring-2 ring-red-300" : "",
                  ].join(" ")}
                >
                  {/* IMPORTANT: Radio value is ORIGINAL KEY */}
                  <RadioGroupItem id={optId} value={originalKey} className="sr-only" />
                  <Label htmlFor={optId} className="cursor-pointer w-full flex items-center gap-2">
                    <span className="w-6 text-right font-medium">{displayKey}.</span>
                    <span className="inline-block align-middle leading-relaxed w-full break-words [word-break:break-word]">
                      <MarkdownMath content={content} />
                    </span>
                  </Label>
                </div>
              );
            })}
          </RadioGroup>
        </div>

        {/* Explanation after submit */}
        {submitted && (
          <div className="mt-4 border-t pt-3">
            <div className="text-sm font-semibold">
              Correct answer: {displayKeyFor(q.id, q.answer)}
            </div>
            <div className="mt-1 text-sm break-words [word-break:break-word]">
              <MarkdownMath content={q.explanation_md} />
            </div>
          </div>
        )}
      </Card>

      {/* Bottom actions */}
      {!submitted ? (
        isLast ? (
          <div className="flex justify-end">
            <Button type="button" onClick={handleSubmitAll}>
              Submit
            </Button>
          </div>
        ) : null
      ) : (
        <div className={`${WRAP_WIDTH} flex items-center justify-between`}>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => setSubmitted(false)}>
              Review again
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSubmitted(false);
                setResponses({});
                setIdx(0);
                setSubmitOk(false);
                setSubmitError(null);
              }}
            >
              Reset answers
            </Button>
          </div>
          <Button type="button" variant="ghost" onClick={onNewPrompt}>
            New prompt
          </Button>
        </div>
      )}
    </div>
  );
}


/* ======================= Robust payload → items ====================== */

function coerceString(v: unknown) {
  if (typeof v === "string") return v;
  try { return JSON.stringify(v ?? ""); } catch { return String(v ?? ""); }
}
function tryParseJson<T = any>(s: string) { try { return JSON.parse(s); } catch { return undefined; } }
function scrubJsonLike(s: string) { return s.replace(/\uFEFF/g, "").replace(/^[\s`]+|[\s`]+$/g, ""); }
function stripTrailingCommas(json: string) { return json.replace(/,\s*([}\]])/g, "$1"); }
function extractByFence(text: string) {
  let m = text.match(/```(?:json|jsonc|javascript|js)?\s*([\s\S]*?)```/i) || text.match(/```+\s*([\s\S]*?)```+/);
  return m?.[1] ? stripTrailingCommas(scrubJsonLike(m[1])) : undefined;
}
function extractByBracketMatch(text: string) {
  const keyIdx = text.search(/"questions"\s*:/);
  if (keyIdx < 0) return undefined;
  let start = text.lastIndexOf("{", keyIdx);
  if (start < 0) return undefined;
  let i = start, depth = 0, inStr = false, esc = false;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (esc) { esc = false; continue; } if (ch === "\\") { esc = true; continue; } if (ch === '"') inStr = false; }
    else { if (ch === '"') inStr = true; else if (ch === "{") depth++; else if (ch === "}") { depth--; if (depth === 0) { i++; break; } } }
  }
  if (depth !== 0) return undefined;
  const slice = text.slice(start, i);
  return stripTrailingCommas(scrubJsonLike(slice));
}
function extractItemsFromPayload(payload: any): QuizItem[] | undefined {
  if (!payload) return;
  if (Array.isArray(payload.items) && payload.items.length) return payload.items;
  if (Array.isArray(payload.questions)) return payload.questions;
  if (payload.raw && typeof payload.raw === "object" && Array.isArray(payload.raw.questions)) return payload.raw.questions;
  if (typeof payload.raw === "string") {
    const full = payload.raw;
    const fenced = extractByFence(full);
    if (fenced) {
      const parsed = tryParseJson(fenced);
      if (parsed?.questions && Array.isArray(parsed.questions)) return parsed.questions as QuizItem[];
    }
    const pure = tryParseJson(scrubJsonLike(full.trim()));
    if (pure?.questions && Array.isArray(pure.questions)) return pure.questions as QuizItem[];
    const matched = extractByBracketMatch(full);
    if (matched) {
      const parsed = tryParseJson(matched);
      if (parsed?.questions && Array.isArray(parsed.questions)) return parsed.questions as QuizItem[];
    }
  }
  const textified = coerceString(payload);
  const pure = tryParseJson(scrubJsonLike(textified.trim()));
  if (pure?.questions && Array.isArray(pure.questions)) return pure.questions as QuizItem[];
  return undefined;
}

/* ================================ Main UI ================================= */

const SUGGESTIONS = [
  // Mathematical Methods
  "VCE Methods — sketching transformations of logarithmic functions",

  // Specialist Mathematics
  "VCE Specialist — complex numbers in polar form (cis notation)",

  // General Mathematics
  "VCE General — time series analysis (trend + seasonality)",

  // Foundation Mathematics
  "VCE Foundation — linear relations in real-world contexts",
];

export function PromptBox() {
  const [loading, setLoading] = useState(false);
  const [quizItems, setQuizItems] = useState<QuizItem[] | undefined>(undefined);
  const [links, setLinks] = useState<LinkMap[]>([]);
  const [raw, setRaw] = useState<string>("");
  const [showForm, setShowForm] = useState(true);
  const [authUserId, setAuthUserId] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { prompt: "", count: 5 },
    mode: "onChange",
  });

  // Load Supabase user id once
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      setAuthUserId(data.user?.id ?? null);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthUserId(session?.user?.id ?? null);
    });
    return () => {
      sub.subscription.unsubscribe();
      alive = false;
    };
  }, []);

  const count = form.watch("count");
  const promptValue = form.watch("prompt");

  useEffect(() => {
    if (!promptValue) return;
    if (isLikelySTEM(promptValue) && form.formState.errors.prompt?.message === STEM_HELP) {
      form.clearErrors("prompt");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptValue]);

  async function onSubmit(values: FormValues) {
    if (!isLikelySTEM(values.prompt)) {
      form.setError("prompt", { type: "manual", message: STEM_HELP });
      return;
    }
    if (!authUserId) {
      form.setError("prompt", { type: "manual", message: "Please sign in to generate and record your questions." });
      return;
    }

    // Optional taxonomy (adjust as needed)
    const area = "Mathematics";
    const subject = "General";
    const topic = "Mixed";

    try {
      setLoading(true);
      setQuizItems(undefined);
      setLinks([]);
      setRaw("");

      const res = await fetch("/api/generate-math", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, authUserId, area, subject, topic }),
      });

      if (res.status === 422) {
        const data = await res.json();
        form.setError("prompt", { type: "server", message: data?.error || STEM_HELP });
        return;
      }
      if (!res.ok) throw new Error(await res.text());

      const data: ApiResponse = await res.json();

      // ✅ capture links; fall back to []
      const gotLinks = Array.isArray((data as any).links) ? ((data as any).links as LinkMap[]) : [];
      setLinks(gotLinks);

      const items = extractItemsFromPayload(data);
      if (items && items.length) {
        setQuizItems(items);
        setShowForm(false);
        return;
      }
      setRaw("No content returned.");
    } catch (err: any) {
      setRaw(`Error: ${err?.message ?? "Something went wrong."}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Form {...form}>
      {showForm && (
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card className="w-full max-w-2xl p-4 bg-white rounded-lg border border-gray-200">
            <CardHeader>
              <CardTitle>Generate STEM Multiple-Choice Questions</CardTitle>
              <CardDescription>
                Describe the topic/level. We’ll generate multiple-choice (A–D) with answers. Some questions may include a graph when helpful.
              </CardDescription>
            </CardHeader>

            <div className="px-4 space-y-4">
              <FormField
                control={form.control}
                name="prompt"
                render={({ field }) => {
                  const promptErr = form.formState.errors.prompt?.message;
                  const isStemError = promptErr === STEM_HELP;
                  return (
                    <FormItem>
                      <FormLabel>Prompt</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Sketching and properties of y = sin(2x) + 0.5"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            if (form.formState.errors.prompt?.message === STEM_HELP) {
                              form.clearErrors("prompt");
                            }
                          }}
                          className={[promptErr ? "border-red-500 focus-visible:ring-red-500" : ""].join(" ")}
                        />
                      </FormControl>
                      {!isStemError && <FormMessage />}
                      {isStemError && <p className="text-sm text-red-600 mt-1">{STEM_HELP}</p>}
                    </FormItem>
                  );
                }}
              />

              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      form.setValue("prompt", s, { shouldValidate: true });
                      form.clearErrors("prompt");
                    }}
                    className="text-sm px-2 py-1 rounded-full border hover:bg-gray-50"
                  >
                    {s}
                  </button>
                ))}
              </div>

              <FormField
                control={form.control}
                name="count"
                render={() => (
                  <FormItem>
                    <FormLabel className="flex items-center justify-between">
                      Number of questions
                      <span className="text-sm font-medium tabular-nums">{count}</span>
                    </FormLabel>
                    <FormControl>
                      <Slider
                        min={1}
                        max={10}
                        step={1}
                        value={[count]}
                        onValueChange={(v) => form.setValue("count", v[0], { shouldValidate: true })}
                        aria-label="Number of questions (1 to 10)"
                        className="w-full"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">1–10</p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="mt-2" disabled={loading || !form.formState.isValid}>
                {loading ? "Generating…" : "Submit"}
              </Button>

              {raw && (
                <div className="mt-4 rounded-md border p-4 overflow-x-auto">
                  <MarkdownMath content={raw} />
                </div>
              )}
            </div>
          </Card>
        </form>
      )}

      {quizItems && !showForm ? (
        <div className="mt-4">
          <InteractiveQuiz
            items={quizItems}
            links={links}
            authUserId={authUserId!}
            onNewPrompt={() => {
              setQuizItems(undefined);
              setLinks([]);
              setRaw("");
              setShowForm(true);
              form.reset({ prompt: "", count: form.getValues("count") });
              form.clearErrors("prompt");
            }}
          />
        </div>
      ) : null}
    </Form>
  );
}
