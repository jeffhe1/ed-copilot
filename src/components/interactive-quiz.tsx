"use client";

import { useMemo, useState } from "react";
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
// Make sure: import "katex/dist/katex.min.css" in app/layout.tsx

// ---------- Types ----------
const formSchema = z.object({
  prompt: z.string().min(5, "Tell me the kind of math questions to generate (min 5 chars).").max(300),
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
  | { items?: undefined; raw: unknown }
  | { items: QuizItem[]; raw?: unknown }
  | any;

// ---------- Markdown+Math ----------
function MarkdownMath({ content }: { content: string }) {
  return (
    <div className="space-y-2 leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ---------- Interactive Quiz ----------
function InteractiveQuiz({
  items,
  onNewPrompt,
}: {
  items: QuizItem[];
  onNewPrompt: () => void;
}) {
  const [responses, setResponses] = useState<Record<number, "A" | "B" | "C" | "D" | undefined>>({});
  const [submitted, setSubmitted] = useState(false);

  const score = useMemo(() => {
    if (!submitted) return null;
    let correct = 0;
    for (const q of items) if (responses[q.id] === q.answer) correct++;
    return { correct, total: items.length };
  }, [submitted, responses, items]);

  return (
    <div className="space-y-6">
      {submitted && score && (
        <div className="rounded-md border p-3 font-medium">Score: {score.correct}/{score.total}</div>
      )}

      {items.map((q, idx) => {
        const chosen = responses[q.id];

        return (
          <Card key={q.id} className="p-4 border">
            <div className="mb-3 font-semibold">Q{idx + 1}</div>
            <div className="mb-4">
              <MarkdownMath content={q.stem_md} />
            </div>

            <RadioGroup
              value={chosen ?? undefined}
              onValueChange={(v: any) => setResponses((prev) => ({ ...prev, [q.id]: v }))}
              className="space-y-2"
              disabled={submitted}
            >
              {(["A", "B", "C", "D"] as const).map((opt) => {
                const optId = `q${q.id}-${opt}`;
                const content = q.options[opt];

                const isSelected = chosen === opt;
                const isCorrect = submitted && q.answer === opt;
                const isWrong = submitted && chosen === opt && chosen !== q.answer;

                return (
                  <div
                    key={opt}
                    className={[
                      "flex items-start gap-3 rounded-lg border-2 p-3 transition",
                      !submitted ? "hover:border-primary/50" : "",
                      isSelected && !submitted ? "border-primary ring-2 ring-primary/30" : "",
                      isCorrect ? "border-green-600 ring-2 ring-green-300" : "",
                      isWrong ? "border-red-600 ring-2 ring-red-300" : "",
                    ].join(" ")}
                  >
                    {/* keep radio for a11y/keyboard, hide the dot */}
                    <RadioGroupItem id={optId} value={opt} className="sr-only" />
                    <Label htmlFor={optId} className="cursor-pointer w-full">
                      <span className="font-medium mr-2">{opt}.</span>
                      <span className="inline-block align-middle">
                        <MarkdownMath content={content} />
                      </span>
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>

            {submitted && (
              <div className="mt-4">
                <div className="text-sm font-semibold">Correct answer: {q.answer}</div>
                <div className="mt-1 text-sm">
                  <MarkdownMath content={q.explanation_md} />
                </div>
              </div>
            )}
          </Card>
        );
      })}

      <div className="flex gap-3">
        {!submitted ? (
          <Button type="button" onClick={() => setSubmitted(true)} disabled={items.length === 0}>
            Submit
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSubmitted(false);
                setResponses({});
              }}
            >
              Reset answers
            </Button>
            <Button type="button" variant="ghost" onClick={onNewPrompt}>
              New prompt
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- JSON extraction utils ----------
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
function normalizeToItems(payload: any): QuizItem[] | undefined {
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
      if (parsed?.questions && Array.isArray(parsed.questions)) return parsed.questions;
    }
    const pure = tryParseJson(scrubJsonLike(full.trim()));
    if (pure?.questions && Array.isArray(pure.questions)) return pure.questions;
    const matched = extractByBracketMatch(full);
    if (matched) {
      const parsed = tryParseJson(matched);
      if (parsed?.questions && Array.isArray(parsed.questions)) return parsed.questions;
    }
  }
  const textified = coerceString(payload);
  const pure = tryParseJson(scrubJsonLike(textified.trim()));
  if (pure?.questions && Array.isArray(pure.questions)) return pure.questions;
  return undefined;
}

// ---------- Main Prompt Box ----------
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
  const [showForm, setShowForm] = useState(true); // <-- controls hiding the form

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { prompt: "", count: 5 },
    mode: "onChange",
  });

  async function onSubmit(values: FormValues) {
    try {
      setLoading(true);
      setQuizItems(undefined);
      setRaw("");

      const res = await fetch("/api/generate-math", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) throw new Error(await res.text());
      const data: ApiResponse = await res.json();

      const items = normalizeToItems(data);
      if (items && items.length) {
        setQuizItems(items);
        setShowForm(false); // <-- hide the form after questions arrive
      } else {
        const text = coerceString((data as any)?.raw ?? data ?? "");
        setRaw(text || "No content returned.");
        // keep the form visible if we didn't get items
      }
    } catch (err: any) {
      setRaw(`Error: ${err?.message ?? "Something went wrong."}`);
    } finally {
      setLoading(false);
    }
  }

  const count = form.watch("count");

  return (
    <Form {...form}>
      {/* ===== Generator form (hidden once items are ready) ===== */}
      {showForm && (
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card className="w-full max-w-2xl p-4 shadow-md bg-white rounded-lg border border-gray-200">
            <CardHeader>
              <CardTitle>Generate Math Questions</CardTitle>
              <CardDescription>
                Describe the type of questions (topic, level, style). We’ll generate multiple-choice (A–D) with answers.
              </CardDescription>
            </CardHeader>

            <div className="px-4 space-y-4">
              <FormField
                control={form.control}
                name="prompt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prompt</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Year 12 calculus — related rates word problems"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Quick suggestions */}
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => form.setValue("prompt", s, { shouldValidate: true })}
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
            </div>
          </Card>
        </form>
      )}

      {/* ===== Quiz (and a "New prompt" action) ===== */}
      {quizItems && !showForm ? (
        <div className="mt-4">
          <InteractiveQuiz
            items={quizItems}
            onNewPrompt={() => {
              setQuizItems(undefined);
              setRaw("");
              setShowForm(true);
              form.reset({ prompt: "", count: form.getValues("count") });
            }}
          />
        </div>
      ) : !showForm && !quizItems ? (
        // This should be rare—only shown if items failed after we hid form (we don't hide form in that case).
        <div className="mt-4 rounded-md border p-4 overflow-x-auto">
          <MarkdownMath content={raw} />
        </div>
      ) : raw && showForm ? (
        // If parsing failed, keep form visible so user can adjust their prompt.
        <div className="mt-4 rounded-md border p-4 overflow-x-auto">
          <MarkdownMath content={raw} />
        </div>
      ) : null}
    </Form>
  );
}
