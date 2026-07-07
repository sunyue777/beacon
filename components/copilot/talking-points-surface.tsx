"use client";

import { useState } from "react";
import { AIOutput } from "@/components/ai/ai-output";
import type { AgentRun } from "@/lib/repo/types";
import { cn } from "@/lib/utils/cn";

type RuntimeChoice = "skill-direct";
type ModelRouteChoice = "live" | "mock";

interface TalkingPointsOutput {
  headline?: string;
  why?: string;
  bullets?: string[];
  evidence?: string[];
  openItems?: string[];
}

interface RunResult {
  ok: boolean;
  reason?: string;
  runId?: string;
  output?: AgentRun;
}

export interface SuggestedTalkingPoint {
  id: string;
  title: string;
  body: string;
  source: string;
  editable?: boolean;
}

const fallbackSuggestedPoints: SuggestedTalkingPoint[] = [
  {
    id: "context",
    title: "Client context",
    body: "Open with the relationship reason.",
    source: "Reason: profile + lifecycle signal"
  },
  {
    id: "risk",
    title: "Risk alignment",
    body: "Check whether portfolio exposure still fits the recorded profile.",
    source: "Reason: holdings + risk profile"
  },
  {
    id: "approval",
    title: "Approval path",
    body: "Confirm any required review before client communication.",
    source: "Reason: suitability + K&E"
  },
  {
    id: "rm-custom",
    title: "RM custom input",
    body: "Prepare a calm pre-call brief and avoid advisory language.",
    source: "RM input",
    editable: true
  }
];

export function TalkingPointsSurface({
  customerId,
  suggestedPoints = fallbackSuggestedPoints
}: {
  customerId: string;
  suggestedPoints?: SuggestedTalkingPoint[];
}) {
  const [runtime, setRuntime] = useState<RuntimeChoice>("skill-direct");
  const [modelRoute, setModelRoute] = useState<ModelRouteChoice>("live");
  const [habits, setHabits] = useState("Prefers phone before email\nLikes concise evidence before scenarios");
  const normalizedPoints = normalizeSuggestedPoints(suggestedPoints);
  const [selectedPointId, setSelectedPointId] = useState(normalizedPoints[0]?.id ?? "context");
  const [rmInput, setRmInput] = useState(normalizedPoints.find((point) => point.editable)?.body ?? "Prepare a calm pre-call brief and avoid advisory language.");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  async function runCopilot() {
    const selectedPoint = resolveSelectedPoint();
    setLoading(true);
    setResult(null);
    const response = await fetch("/api/copilot/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        module: "talking_points",
        customerId,
        intent: selectedPoint.body,
        runtimeOverride: runtime,
        ...(modelRoute === "mock" ? { modelRoute: "mock" } : {}),
        personalization: {
          customerHabits: habits.split("\n").map((item) => item.trim()).filter(Boolean),
          rmCustomInput: selectedPoint.editable ? rmInput : selectedPoint.body
        },
        uiContext: {
          surface: "client-360-copilot",
          selectedTalkingPoint: selectedPoint
        }
      })
    });
    const payload = (await response.json()) as RunResult;
    setResult(payload);
    setLoading(false);
  }

  const run = result?.output;
  const output = run?.output as TalkingPointsOutput | undefined;
  const selectedPoint = resolveSelectedPoint();
  const runLabel = "Prepare talking points";

  return (
    <section className="rounded-[14px] border border-dashed border-[hsl(var(--ai-border)/0.55)] bg-card/70 p-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[13px] font-semibold" style={{ color: "hsl(var(--ai-foreground))" }}>
            Select one point to prepare
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Each point links to the customer evidence that produced it.
          </p>
        </div>
        <span className="rounded-full border border-border bg-background px-2.5 py-1 font-mono text-[10px] uppercase text-muted-foreground">
          4 points
        </span>
      </header>
      <div className="mt-3 grid gap-3">
        <div className="grid gap-2 md:grid-cols-2">
          {normalizedPoints.map((point, index) => {
            const selected = selectedPoint.id === point.id;
            const body = point.editable ? rmInput : point.body;
            return (
              <button
                className={cn(
                  "min-h-[92px] rounded-[12px] border p-3 text-left transition",
                  selected ? "bg-[hsl(var(--brand-gold)/0.16)] shadow-soft" : "bg-background/78 hover:bg-[hsl(var(--brand-gold)/0.08)]"
                )}
                key={point.id}
                onClick={() => setSelectedPointId(point.id)}
                style={{
                  borderColor: selected ? "hsl(var(--ai-accent-pink) / 0.58)" : "hsl(var(--ai-border) / 0.34)"
                }}
                type="button"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px]" style={{ color: "hsl(var(--ai-accent-pink))" }}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="rounded-full border border-[hsl(var(--brand-gold)/0.38)] px-2 py-0.5 text-[10px] text-muted-foreground">
                    {point.editable ? "RM input" : "Beacon"}
                  </span>
                </div>
                <div className="mt-2 text-[13px] font-semibold">{point.title}</div>
                {point.editable ? (
                  <textarea
                    className="mt-2 min-h-[54px] w-full resize-y rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground"
                    onChange={(event) => setRmInput(event.target.value)}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedPointId(point.id);
                    }}
                    placeholder="Write the RM's own talking point..."
                    value={rmInput}
                  />
                ) : (
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{body}</p>
                )}
                <div className="mt-2 text-[11px] text-[hsl(var(--ai-accent-pink))]">{point.source}</div>
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 md:grid-cols-[260px_1fr]">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Engine
            <select
              className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
              value={modelRoute}
              onChange={(event) => setModelRoute(event.target.value as ModelRouteChoice)}
            >
              <option value="live">Live LLM</option>
              <option value="mock">Local mock</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Customer habits
            <textarea
              className="min-h-[76px] resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              placeholder="One habit per line, e.g. prefers WhatsApp, asks for concise evidence, family context matters."
              value={habits}
              onChange={(event) => setHabits(event.target.value)}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md px-3 py-2 text-xs font-semibold text-[hsl(var(--brand-navy))] transition disabled:cursor-not-allowed disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, hsl(var(--ai-accent-pink) / 0.92), hsl(var(--brand-gold) / 0.92))" }}
            onClick={runCopilot}
            disabled={loading}
          >
            {loading ? "Preparing..." : runLabel}
          </button>
          {result ? (
            <span className="text-[11px] text-muted-foreground">
              {result.ok ? "Trace ready" : `Error: ${result.reason}`}
            </span>
          ) : null}
        </div>

        {output ? (
          <div className="grid gap-3 rounded-md border bg-background p-3" style={{ borderColor: "hsl(var(--ai-border) / 0.45)" }}>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "hsl(var(--ai-accent-pink))" }}>
                Selected talking point
              </div>
              <div className="mt-1 text-sm font-semibold">{selectedPoint.title}</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{selectedPoint.body}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Prepared output: <span className="font-medium text-foreground">{output.headline}</span> - {output.why}
              </p>
            </div>
            {run ? (
              <AIOutput
                title="Prepared talking points"
                status={run.fallbackMode ? "Fallback trace" : run.llmProvider === "mock" ? "Rules trace" : "Live trace"}
                generatedAt={run.finishedAt}
                summary={(output.bullets ?? []).join(" ")}
                run={run}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );

  function resolveSelectedPoint() {
    const point = normalizedPoints.find((item) => item.id === selectedPointId) ?? normalizedPoints[0] ?? fallbackSuggestedPoints[0];
    return point.editable ? { ...point, body: rmInput || point.body } : point;
  }
}

function normalizeSuggestedPoints(points: SuggestedTalkingPoint[]) {
  const merged = [...points];
  while (merged.length < 4) {
    merged.push(fallbackSuggestedPoints[merged.length]);
  }
  return merged.slice(0, 4).map((point, index) => ({
    ...point,
    id: point.id || `point-${index + 1}`
  }));
}
