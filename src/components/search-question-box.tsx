"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { compile } from "mathjs";

import MarkdownMath from "@/components/markdown-math";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

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

type QuestionImage = {
  imageId?: string;
  path?: string;
  ocrText?: string;
  caption?: string;
};

type SearchResult = {
  qid: string;
  confidence?: number;
  duplicate_class?: string;
  reason?: string;
  question?: {
    stem?: string;
    options?: string[];
    answer?: string;
    explanation?: string;
    graph?: GraphSpec;
    images?: QuestionImage[];
    metadata?: Record<string, unknown>;
  };
};

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
      }
      return [{ x: graph.x, y: graph.y, type: "scatter", mode: "markers" as const }];
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

export function SearchQuestionBox() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [threshold, setThreshold] = useState(0.65);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedQid, setSelectedQid] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ loaded: number; raw: number; filtered: number } | null>(null);

  const selected = useMemo(
    () => results.find((r) => r.qid === selectedQid) ?? null,
    [results, selectedQid]
  );

  const doSearch = async () => {
    setError(null);
    if (query.trim().length < 2) {
      setError("Please enter at least 2 characters.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/search-rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          threshold,
          topN: 20,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Search failed");
      }
      const nextResults = Array.isArray(data?.results) ? data.results : [];
      setResults(nextResults);
      setCounts(data?.counts ?? null);
      setSelectedQid(nextResults[0]?.qid ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Search failed");
      setResults([]);
      setSelectedQid(null);
      setCounts(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle>Search Questions From RAG Bank</CardTitle>
          <CardDescription>Return only questions with confidence above threshold</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Enter keywords, e.g. derivative chain rule"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Confidence threshold</span>
              <span className="tabular-nums">{threshold.toFixed(2)}</span>
            </div>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[threshold]}
              onValueChange={(v) => setThreshold(v[0] ?? threshold)}
              aria-label="confidence-threshold"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={doSearch} disabled={loading}>
              {loading ? "Searching..." : "Search questions"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push("/app")}>
              Go to create page
            </Button>
          </div>

          {error ? <div className="text-sm text-destructive">{error}</div> : null}
          {counts ? (
            <div className="text-sm text-muted-foreground">
              Bank size: {counts.loaded}, retrieved: {counts.raw}, after threshold: {counts.filtered}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {selected ? (
        <Card className="w-full max-w-3xl border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Selected Question: {selected.qid}</CardTitle>
            <CardDescription>
              Confidence: {(selected.confidence ?? 0).toFixed(3)} | Class: {selected.duplicate_class ?? "unknown"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <MarkdownMath content={selected.question?.stem ?? ""} />

            {selected.question?.graph ? <GraphRenderer graph={selected.question.graph} /> : null}

            {Array.isArray(selected.question?.images) && selected.question.images.length ? (
              <div className="space-y-2">
                {selected.question.images.map((img, idx) => (
                  <div key={`${selected.qid}-img-${img.imageId ?? idx}`} className="space-y-1">
                    {img.path ? (
                      // If path is an http/data/public URL, browser can render directly.
                      <img
                        src={img.path}
                        alt={img.caption || `question image ${idx + 1}`}
                        className="max-h-80 rounded-md border object-contain"
                      />
                    ) : null}
                    {img.caption ? <div className="text-xs text-muted-foreground">{img.caption}</div> : null}
                  </div>
                ))}
              </div>
            ) : null}

            {Array.isArray(selected.question?.options) && selected.question.options.length ? (
              <div className="space-y-1">
                {selected.question.options.map((opt, idx) => (
                  <div key={`${selected.qid}-selected-opt-${idx}`}>
                    {String.fromCharCode(65 + idx)}. <MarkdownMath content={opt} />
                  </div>
                ))}
              </div>
            ) : null}

            {selected.question?.answer ? (
              <div className="text-xs text-muted-foreground">Answer: {selected.question.answer}</div>
            ) : null}
            {selected.question?.explanation ? <MarkdownMath content={selected.question.explanation} /> : null}
            {selected.reason ? <div className="text-xs text-muted-foreground">{selected.reason}</div> : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-3 w-full max-w-3xl">
        {results.map((r) => (
          <Card
            key={r.qid}
            className={selectedQid === r.qid ? "border-primary ring-1 ring-primary/20" : ""}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Question ID: {r.qid}</CardTitle>
              <CardDescription>
                Confidence: {(r.confidence ?? 0).toFixed(3)} | Class: {r.duplicate_class ?? "unknown"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedQid(r.qid)}
              >
                Open and render
              </Button>
              <MarkdownMath content={r.question?.stem ?? ""} />
              {r.question?.graph ? <div className="text-xs text-muted-foreground">Includes graph payload</div> : null}
              {Array.isArray(r.question?.images) && r.question.images.length ? (
                <div className="text-xs text-muted-foreground">Includes {r.question.images.length} image(s)</div>
              ) : null}
              {r.reason ? <div className="text-xs text-muted-foreground">{r.reason}</div> : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
