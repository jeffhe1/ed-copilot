"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "@/components/Markdown";

/* ============================ Types (mirror your API schema) ============================ */

type GraphFn = {
  kind: "function";
  title?: string;
  xLabel?: string;
  yLabel?: string;
  expr: string;
  domain?: [number, number];
  samples?: number; // 10..2000
};

type GraphPoints = {
  kind: "points";
  title?: string;
  xLabel?: string;
  yLabel?: string;
  x: number[];
  y: number[];
};

type QuestionItem = {
  id: number; // local id from the generator
  stem_md: string;
  options: { A: string; B: string; C: string; D: string };
  answer: "A" | "B" | "C" | "D";
  explanation_md: string;
  graph?: GraphFn | GraphPoints;
  area: string;     // "Mathematical Methods" | "Specialist Mathematics" | ...
  subject: string;  // e.g., "Calculus"
  topic: string;    // e.g., "Derivatives"
  skillIds?: string[];
  difficulty?: number;
};

type Linkage = {
  localId: number;      // matches QuestionItem.id
  questionId: string;   // DB id (Prisma)
  attemptId: string;    // DB id (Prisma)
  answer: "A" | "B" | "C" | "D";
};

type QuizPacket = {
  items: QuestionItem[];
  links?: Linkage[];
  prompt: string;
  meta?: { createdAt: number; count: number };
};

/* ============================ Small helpers ============================ */

function classNames(...xs: Array<string | null | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function EmptyState() {
  return (
    <div className="rounded-xl border p-6 text-center text-gray-600">
      Generate questions with the prompt box to start an interactive quiz.
    </div>
  );
}

/* ============================ Safe tiny math evaluator for function plots ============================ */
/** Very conservative sanitizer: allow digits, whitespace, x, arithmetic ops, parentheses, commas,
 * and a whitelist of Math.* identifiers. Also convert ^ to ** for exponentiation. */
const SAFE_TOKENS =
  /^(?:[0-9.\s()+\-*/,%]|x|PI|E|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|exp|log|sqrt|abs|floor|ceil|round|min|max|pow)+$/i;

function buildSafeFn(exprRaw: string): ((x: number) => number) | null {
  const expr = exprRaw.replace(/\^/g, "**").trim();
  if (!expr || !SAFE_TOKENS.test(expr.replace(/[A-Za-z]+/g, (m) => m))) {
    return null;
  }
  try {
    // eslint-disable-next-line no-new-func
    const f = new Function(
      "x",
      `
      const {PI,E,sin,cos,tan,asin,acos,atan,atan2,sinh,cosh,tanh,exp,log,sqrt,abs,floor,ceil,round,min,max,pow} = Math;
      return (${expr});
    `
    );
    // quick probe
    // @ts-ignore
    const test = f(0);
    if (Number.isFinite(test)) {
      // @ts-ignore
      return (x: number) => {
        const y = f(x);
        return Number.isFinite(y) ? (y as number) : NaN;
      };
    }
    return null;
  } catch {
    return null;
  }
}

/* ============================ SVG Plotters ============================ */

function PointsPlot({ g }: { g: GraphPoints }) {
  const { x, y, title, xLabel, yLabel } = g;
  if (!Array.isArray(x) || !Array.isArray(y) || x.length === 0 || y.length === 0 || x.length !== y.length) {
    return null;
  }
  const minX = Math.min(...x), maxX = Math.max(...x);
  const minY = Math.min(...y), maxY = Math.max(...y);
  const pad = 24, W = 560, H = 260;

  const sx = (vx: number) => pad + ((vx - minX) / (maxX - minX || 1)) * (W - 2 * pad);
  const sy = (vy: number) => H - pad - ((vy - minY) / (maxY - minY || 1)) * (H - 2 * pad);

  return (
    <div className="mt-3 rounded-lg border bg-white p-3">
      {title && <div className="mb-2 text-sm font-medium">{title}</div>}
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
        {/* Axes */}
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="currentColor" strokeWidth="1" />
        <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="currentColor" strokeWidth="1" />
        {/* Points */}
        {x.map((vx, i) => (
          <circle key={i} cx={sx(vx)} cy={sy(y[i])} r={3} />
        ))}
        {/* Labels */}
        {xLabel && (
          <text x={W - pad} y={H - 6} fontSize="10" textAnchor="end">
            {xLabel}
          </text>
        )}
        {yLabel && (
          <text x={10} y={pad} fontSize="10" textAnchor="start">
            {yLabel}
          </text>
        )}
      </svg>
    </div>
  );
}

function FunctionPlot({ g }: { g: GraphFn }) {
  const { expr, title, xLabel, yLabel } = g;
  const domain = g.domain ?? [-10, 10];
  const samples = Math.max(10, Math.min(2000, g.samples ?? 300));
  const pad = 24, W = 560, H = 260;

  const safeFn = buildSafeFn(expr);
  if (!safeFn) {
    return (
      <div className="mt-3 rounded-lg border bg-white p-3 text-sm text-gray-600">
        <div className="font-medium mb-1">{title ?? "Function plot"}</div>
        <div>Expression: <code>{expr}</code></div>
        <div className="text-xs mt-1">Unable to plot (expression not supported).</div>
      </div>
    );
  }

  // sample points
  const xs: number[] = [];
  const ys: number[] = [];
  const [x0, x1] = domain;
  for (let i = 0; i <= samples; i++) {
    const x = x0 + (i * (x1 - x0)) / samples;
    const y = safeFn(x);
    if (Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    } else {
      // NaN: push a break marker via nulls
      xs.push(Number.NaN);
      ys.push(Number.NaN);
    }
  }

  // bounds
  const finiteYs = ys.filter((v) => Number.isFinite(v));
  const minX = x0, maxX = x1;
  const minY = finiteYs.length ? Math.min(...finiteYs) : -1;
  const maxY = finiteYs.length ? Math.max(...finiteYs) : 1;
  const yspan = maxY - minY || 1;

  const sx = (vx: number) => pad + ((vx - minX) / (maxX - minX || 1)) * (W - 2 * pad);
  const sy = (vy: number) => H - pad - ((vy - minY) / yspan) * (H - 2 * pad);

  // build polyline segments, breaking on NaNs
  const segments: Array<[number, number][]> = [];
  let current: Array<[number, number]> = [];
  for (let i = 0; i < xs.length; i++) {
    const vx = xs[i], vy = ys[i];
    if (Number.isFinite(vx) && Number.isFinite(vy)) {
      current.push([sx(vx), sy(vy)]);
    } else if (current.length) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length) segments.push(current);

  return (
    <div className="mt-3 rounded-lg border bg-white p-3">
      {title && <div className="mb-2 text-sm font-medium">{title}</div>}
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
        {/* Axes */}
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="currentColor" strokeWidth="1" />
        <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="currentColor" strokeWidth="1" />
        {/* Curve segments */}
        {segments.map((seg, i) => (
          <polyline
            key={i}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            points={seg.map(([X, Y]) => `${X},${Y}`).join(" ")}
          />
        ))}
        {/* Labels */}
        {xLabel && (
          <text x={W - pad} y={H - 6} fontSize="10" textAnchor="end">
            {xLabel}
          </text>
        )}
        {yLabel && (
          <text x={10} y={pad} fontSize="10" textAnchor="start">
            {yLabel}
          </text>
        )}
      </svg>
      <div className="mt-1 text-xs text-gray-600">
        Expr: <code>{expr}</code> · Domain: {domain[0]} to {domain[1]} · Samples: {samples}
      </div>
    </div>
  );
}

/* ============================ Main Quiz ============================ */

export default function InteractiveQuiz() {
  const [packet, setPacket] = useState<QuizPacket | null>(null);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<"A" | "B" | "C" | "D" | null>(null);
  const [revealed, setRevealed] = useState(false);

  // Map localId -> linkage for analytics (if provided)
  const linkageMap = useMemo(() => {
    const m = new Map<number, Linkage>();
    if (packet?.links) {
      for (const l of packet.links) m.set(l.localId, l);
    }
    return m;
  }, [packet]);

  useEffect(() => {
    const onNew = (e: Event) => {
      const detail = (e as CustomEvent).detail as QuizPacket;
      if (!detail?.items?.length) return;
      setPacket(detail);
      setIndex(0);
      setChosen(null);
      setRevealed(false);
    };
    window.addEventListener("quiz:new", onNew as EventListener);
    return () => window.removeEventListener("quiz:new", onNew as EventListener);
  }, []);

  const q = useMemo(() => (packet ? packet.items[index] : null), [packet, index]);
  const total = packet?.items?.length ?? 0;

  const select = (k: "A" | "B" | "C" | "D") => {
    if (revealed) return;
    setChosen(k);
  };
  const reveal = async () => {
    if (!q || revealed) return;
    setRevealed(true);

    // If you later add submission to DB, you'll have the attemptId here:
    // const link = linkageMap.get(q.id);
    // if (link) {
    //   await fetch("/api/submit-answer", {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({
    //       attemptId: link.attemptId,
    //       chosen,
    //       correct: chosen === q.answer,
    //       timeTakenMs: /* track a per-question timer and send it here */,
    //     }),
    //   });
    // }
  };
  const next = () => {
    if (!packet) return;
    if (index >= packet.items.length - 1) return;
    setIndex(index + 1);
    setChosen(null);
    setRevealed(false);
  };
  const prev = () => {
    if (!packet) return;
    if (index <= 0) return;
    setIndex(index - 1);
    setChosen(null);
    setRevealed(false);
  };

  return (
    <div className="w-full max-w-[720px] rounded-2xl border bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Interactive Quiz</h2>
        {total > 0 && (
          <div className="text-sm text-gray-600">
            Q{index + 1} / {total}
          </div>
        )}
      </div>

      {!q ? (
        <div className="mt-4">
          <EmptyState />
        </div>
      ) : (
        <>
          {/* Breadcrumb from classification */}
          <div className="mt-2 text-xs text-gray-500">
            {q.area} ▸ {q.subject} ▸ {q.topic}
            {typeof q.difficulty === "number" && (
              <span className="ml-2 rounded-full border px-2 py-0.5 text-[10px]">Difficulty {q.difficulty}</span>
            )}
          </div>

          {/* Stem */}
          <div className="mt-4 rounded-xl border bg-gray-50 p-4">
            <div className="prose max-w-none">
              <div className="min-h-24">
                <Markdown>{q.stem_md}</Markdown>
              </div>
            </div>

            {/* Graph rendering */}
            {q.graph?.kind === "points" && <PointsPlot g={q.graph as GraphPoints} />}
            {q.graph?.kind === "function" && <FunctionPlot g={q.graph as GraphFn} />}
          </div>

          {/* Options */}
          <div className="mt-4 grid grid-cols-1 gap-3">
            {(Object.keys(q.options) as Array<"A" | "B" | "C" | "D">).map((k) => {
              const opt = q.options[k];
              const isCorrect = revealed && k === q.answer;
              const isWrong = revealed && chosen === k && k !== q.answer;
              return (
                <button
                  key={k}
                  onClick={() => select(k)}
                  className={optionClass(isCorrect, isWrong, chosen === k, revealed)}
                >
                  <span className="mr-3 font-semibold">{k}.</span>
                  <span className="flex-1 text-left line-clamp-3">
                    <Markdown>{opt}</Markdown>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Controls */}
          <div className="mt-5 flex items-center gap-2">
            <button
              onClick={prev}
              disabled={index === 0}
              className="rounded-lg border px-3 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Prev
            </button>

            {!revealed ? (
              <button
                onClick={reveal}
                disabled={chosen == null}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Check Answer
              </button>
            ) : (
              <button
                onClick={next}
                disabled={index >= (packet?.items.length ?? 1) - 1}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            )}

            <div className="ml-auto text-sm text-gray-600">
              {revealed ? (
                <>Correct answer: <span className="font-semibold">{q.answer}</span></>
              ) : chosen ? (
                <>Selected: <span className="font-semibold">{chosen}</span></>
              ) : (
                <>Select an option</>
              )}
            </div>
          </div>

          {/* Explanation */}
          {revealed && (
            <div className="mt-4 rounded-xl border bg-emerald-50 p-4">
              <div className="mb-2 text-xs uppercase tracking-wide text-emerald-700">Explanation</div>
              <div className="prose max-w-none">
                <Markdown>{q.explanation_md}</Markdown>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function optionClass(
  isCorrect: boolean,
  isWrong: boolean,
  isChosen: boolean,
  revealed: boolean
) {
  const base = "flex items-start gap-2 rounded-xl border p-3 text-left transition min-h-16";
  if (revealed) {
    if (isCorrect) return base + " border-emerald-500 bg-emerald-50";
    if (isWrong) return base + " border-red-400 bg-red-50";
    return base + " border-gray-200 bg-white";
  }
  return base + (isChosen ? " border-emerald-400 bg-emerald-50" : " border-gray-200 hover:bg-gray-50");
}
