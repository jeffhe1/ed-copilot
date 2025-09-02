"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
// Ensure: import "katex/dist/katex.min.css" in app/layout.tsx

/* ============================== Types & Schema ============================== */
const formSchema = z.object({
  prompt: z
    .string()
    .min(5, "Tell me the kind of questions to generate (min 5 chars).")
    .max(300, "Keep it brief (≤300 chars)."),
  count: z.coerce.number().int().min(1).max(10),
});
type FormValues = z.infer<typeof formSchema>;

type QuizItem = {
  id: number;
  stem_md: string;
  options: { A: string; B: string; C: string; D: string };
  answer: "A" | "B" | "C" | "D";
  explanation_md: string;
};

type ApiResponse =
  | { items?: undefined; raw?: unknown; error?: string }
  | { items: QuizItem[]; raw?: unknown; validated?: any }
  | any;

/* ============================== STEM Detection ============================== */
const STEM_HELP =
  "This tool only supports academic STEM prompts (maths, physics, chemistry, biology, earth/space, computer science, engineering, statistics). Please rephrase your prompt to a STEM topic.";

function isLikelySTEM(s: string): boolean {
  const t = s.toLowerCase();
  const hits = [
    "math", "maths", "calculus", "algebra", "geometry", "trigonometry", "differentiation", "integration",
    "limit", "series", "probability", "statistics", "matrix", "vector", "complex number",
    "physics", "mechanics", "electric", "magnet", "thermo", "optics", "quantum", "kinematics",
    "chemistry", "stoichiometry", "equilibrium", "acid", "base", "redox", "organic", "bond",
    "biology", "genetics", "cell", "enzyme", "ecology", "evolution", "physiology",
    "geology", "earth", "plate tectonics", "seismology", "mineral",
    "astronomy", "astrophysics", "cosmology", "planet", "orbit",
    "computer", "algorithm", "data structure", "complexity", "programming", "cs",
    "engineering", "circuit", "signal", "control", "materials", "mechanical", "electrical",
  ];
  return hits.some((k) => t.includes(k));
}

/* ============================ Markdown + KaTeX ============================= */
function MarkdownMath({ content }: { content: string }) {
  return (
    <div className="space-y-2 leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

/* ============================ Interactive Quiz ============================= */
function InteractiveQuiz({
  items,
  onNewPrompt,
}: {
  items: QuizItem[];
  onNewPrompt: () => void;
}) {
  const [responses, setResponses] = useState<Record<number, "A" | "B" | "C" | "D" | undefined>>({});
  const [submitted, setSubmitted] = useState(false);
  const [idx, setIdx] = useState(0);

  const q = items[idx];
  const isFirst = idx === 0;
  const isLast = idx === items.length - 1;

  const score = useMemo(() => {
    if (!submitted) return null;
    let correct = 0;
    for (const it of items) if (responses[it.id] === it.answer) correct++;
    return { correct, total: items.length };
  }, [submitted, responses, items]);

  function setAnswer(value: "A" | "B" | "C" | "D") {
    setResponses((prev) => ({ ...prev, [q.id]: value }));
  }
  const goNext = () => { if (!isLast) setIdx((i) => i + 1); };
  const goBack = () => { if (!isFirst) setIdx((i) => i - 1); };

  /* ---------- sizing tokens ---------- */
  // Fixed desktop width (760px), full width on small screens
  const WRAP_WIDTH  = "w-full sm:w-[760px]";
  const CARD_HEIGHT = "h-[720px]";     // total card height
  const STEM_HEIGHT = "h-[100px]";     // question stem zone
  const EXPL_HEIGHT = "h-[100px]";     // explanation zone
  const OPTION_H    = "h-16";          // per-option row height (64px)
  /* ---------------------------------- */

  return (
    <div className={`${WRAP_WIDTH} mx-auto space-y-6`}>
      {/* Top nav (match width) */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={goBack} disabled={isFirst}>
            Back
          </Button>
          <Button type="button" variant="outline" onClick={goNext} disabled={isLast}>
            Next
          </Button>
        </div>
        <div className="text-sm font-medium">
          Q{idx + 1} / {items.length}
        </div>
      </div>

      {submitted && score && (
        <div className="rounded-md border p-3 font-medium">
          Score: {score.correct}/{score.total}
        </div>
      )}

      {/* Fixed-width, fixed-height card */}
      <Card className={`w-full p-4 border flex flex-col ${CARD_HEIGHT}`}>
        <div className="shrink-0 mb-2 font-semibold">Question {idx + 1}</div>

        {/* Stem — fixed height; prevent horizontal overflow */}
        <div className={`shrink-0 mb-3 overflow-auto overflow-x-hidden pr-1 ${STEM_HEIGHT}`}>
          <div className="break-words [word-break:break-word]">
            <MarkdownMath content={q.stem_md} />
          </div>
        </div>

        {/* Options — fill remaining space; each row fixed height */}
        <div className="flex-1 overflow-auto overflow-x-hidden pr-1">
          <RadioGroup
            value={responses[q.id] ?? undefined}
            onValueChange={(v: any) => setAnswer(v)}
            className="space-y-2"
            disabled={submitted}
          >
            {(["A", "B", "C", "D"] as const).map((opt) => {
              const optId = `q${q.id}-${opt}`;
              const content = q.options[opt];
              const chosen = responses[q.id];

              const isSelected = chosen === opt;
              const isCorrect  = submitted && q.answer === opt;
              const isWrong    = submitted && chosen === opt && chosen !== q.answer;

              return (
                <div
                  key={opt}
                  className={[
                    "flex items-center gap-3 rounded-lg border-2 px-3 transition w-full",
                    OPTION_H,
                    !submitted ? "hover:border-primary/50" : "",
                    isSelected && !submitted ? "border-primary ring-2 ring-primary/30" : "",
                    isCorrect ? "border-green-600 ring-2 ring-green-300" : "",
                    isWrong   ? "border-red-600 ring-2 ring-red-300" : "",
                  ].join(" ")}
                  title={content.replace(/\s+/g, " ").trim()}
                >
                  <RadioGroupItem id={optId} value={opt} className="sr-only" />
                  <Label htmlFor={optId} className="cursor-pointer w-full flex items-center gap-2">
                    <span className="w-6 text-right font-medium">{opt}.</span>
                    <span className="inline-block align-middle leading-relaxed w-full overflow-hidden text-ellipsis whitespace-normal line-clamp-2 break-words [word-break:break-word]">
                      <MarkdownMath content={content} />
                    </span>
                  </Label>
                </div>
              );
            })}
          </RadioGroup>
        </div>

        {/* Explanation — fixed height after submit */}
        {submitted ? (
          <div className={`shrink-0 mt-3 border-t pt-3 overflow-auto overflow-x-hidden pr-1 ${EXPL_HEIGHT}`}>
            <div className="text-sm font-semibold">Correct answer: {q.answer}</div>
            <div className="mt-1 text-sm break-words [word-break:break-word]">
              <MarkdownMath content={q.explanation_md} />
            </div>
          </div>
        ) : (
          <div className="shrink-0" />
        )}
      </Card>

      {/* Bottom actions */}
      {!submitted ? (
        isLast ? (
          <div className="flex justify-end">
            <Button type="button" onClick={() => setSubmitted(true)}>
              Submit
            </Button>
          </div>
        ) : null
      ) : (
        <div className={`${WRAP_WIDTH} flex items-center justify-between`}>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSubmitted(false);
                // keep selections; uncomment to clear:
                // setResponses({});
              }}
            >
              Review again
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSubmitted(false);
                setResponses({});
                setIdx(0);
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



/* ======================= Robust client-side extraction ===================== */
function coerceString(v: unknown) {
  if (typeof v === "string") return v;
  try { return JSON.stringify(v ?? ""); } catch { return String(v ?? ""); }
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
function extractByFence(text: string) {
  let m = text.match(/```(?:json|jsonc|javascript|js)?\s*([\s\S]*?)```/i);
  if (!m) m = text.match(/```+\s*([\s\S]*?)```+/);
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
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
  }
  if (depth !== 0) return undefined;
  const slice = text.slice(start, i);
  return stripTrailingCommas(scrubJsonLike(slice));
}
function extractItemsFromPayload(payload: any): QuizItem[] | undefined {
  if (!payload) return;
  if (Array.isArray(payload.items) && payload.items.length) return payload.items;
  if (Array.isArray(payload.questions)) return payload.questions;
  if (payload.raw && typeof payload.raw === "object" && Array.isArray(payload.raw.questions)) {
    return payload.raw.questions;
  }
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
  "VCE Methods — differentiation (chain rule) practice",
  "Year 10 algebra — factorising quadratics",
  "Intro probability — Bayes theorem word problems",
  "VCE Specialist — complex numbers (Argand) mixed set",
];

export function PromptBox() {
  const [loading, setLoading] = useState(false);
  const [quizItems, setQuizItems] = useState<QuizItem[] | undefined>(undefined);
  const [raw, setRaw] = useState<string>("");
  const [showForm, setShowForm] = useState(true);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { prompt: "", count: 5 },
    mode: "onChange",
  });
  const count = form.watch("count");
  const promptValue = form.watch("prompt");

  // Clear STEM error as the user edits (optional heuristic)
  useEffect(() => {
    if (!promptValue) return;
    // if user starts typing STEM-y content, clear any prior STEM error
    if (isLikelySTEM(promptValue)) {
      if (form.formState.errors.prompt?.message === STEM_HELP) {
        form.clearErrors("prompt");
      }
    }
  }, [promptValue]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(values: FormValues) {
    // 1) Client-side STEM gate (avoid unnecessary API calls)
    if (!isLikelySTEM(values.prompt)) {
      form.setError("prompt", { type: "manual", message: STEM_HELP });
      return;
    }

    try {
      setLoading(true);
      setQuizItems(undefined);
      setRaw("");

      const res = await fetch("/api/generate-math", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (res.status === 422) {
        // Server says non-STEM/non-academic
        const data = await res.json();
        form.setError("prompt", {
          type: "server",
          message: data?.error || STEM_HELP,
        });
        return;
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Request failed (${res.status})`);
      }

      const data: ApiResponse = await res.json();

      // Prefer normalized items
      const items = extractItemsFromPayload(data);
      if (items && items.length) {
        setQuizItems(items);
        setShowForm(false);
        return;
      }

      // Fallback: show raw (and keep form visible)
      const text = coerceString((data as any)?.raw ?? data ?? "");
      setRaw(text || "No content returned.");
    } catch (err: any) {
      setRaw(`Error: ${err?.message ?? "Something went wrong."}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Form {...form}>
      {/* ===== Form (hidden once items are generated) ===== */}
      {showForm && (
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card className="w-full max-w-2xl p-4 shadow-md bg-white rounded-lg border border-gray-200">
            <CardHeader>
              <CardTitle>Generate STEM Multiple-Choice Questions</CardTitle>
              <CardDescription>
                Describe the topic/level. We’ll generate multiple-choice (A–D) questions with answers.
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
                            placeholder="e.g., Year 12 calculus — related rates word problems"
                            {...field}
                            onChange={(e) => {
                            field.onChange(e);
                            // Clear only the STEM error as the user types
                            if (form.formState.errors.prompt?.message === STEM_HELP) {
                                form.clearErrors("prompt");
                            }
                            }}
                            className={[
                            promptErr ? "border-red-500 focus-visible:ring-red-500" : "",
                            ].join(" ")}
                        />
                        </FormControl>

                        {/* Show either Zod/other errors OR our STEM help, not both */}
                        {!isStemError && <FormMessage />}
                        {isStemError && (
                        <p className="text-sm text-red-600 mt-1">{STEM_HELP}</p>
                        )}
                    </FormItem>
                    );
                }}
                />

              {/* Quick suggestions */}
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

              {/* Count slider */}
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

      {/* ===== Quiz (only shown once items arrive) ===== */}
      {quizItems && !showForm ? (
        <div className="mt-4">
          <InteractiveQuiz
            items={quizItems}
            onNewPrompt={() => {
              setQuizItems(undefined);
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
