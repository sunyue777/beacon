"use client";

import { useEffect, useMemo, useState } from "react";

type MarketFocus = "asia" | "us-rates" | "fx" | "china-hk";

type MarketBrief = {
  focus: MarketFocus;
  label: string;
  source: "live-web" | "demo-fallback";
  asOf: string;
  headline: string;
  headlines: string[];
  indices: { name: string; value: number; changePct: number }[];
};

const focusOptions: { id: MarketFocus; label: string }[] = [
  { id: "asia", label: "Asia" },
  { id: "us-rates", label: "Rates" },
  { id: "fx", label: "FX" },
  { id: "china-hk", label: "China/HK" }
];

export function MarketTonePanel({
  fallback
}: {
  fallback?: {
    headline: string;
    sentiment: string;
    indices: { name: string; value: number; changePct: number }[];
  } | null;
}) {
  const [focus, setFocus] = useState<MarketFocus>("asia");
  const [brief, setBrief] = useState<MarketBrief | null>(null);
  const [loading, setLoading] = useState(false);

  const fallbackBrief = useMemo<MarketBrief>(
    () => ({
      focus: "asia",
      label: "Asia",
      source: "demo-fallback",
      asOf: new Date().toISOString(),
      headline: fallback?.headline ?? "Market scan prepared from fallback demo data.",
      headlines: [],
      indices: fallback?.indices ?? []
    }),
    [fallback]
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/market/brief?focus=${focus}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: MarketBrief) => {
        if (alive) setBrief(payload);
      })
      .catch(() => {
        if (alive) setBrief({ ...fallbackBrief, focus, label: focusOptions.find((item) => item.id === focus)?.label ?? "Asia" });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [fallbackBrief, focus]);

  const view = brief ?? fallbackBrief;
  const asOf = new Date(view.asOf);

  return (
    <div className="rounded-[16px] border border-primary/20 bg-card shadow-soft">
      <header className="border-b border-primary/15 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[15px] font-semibold text-primary">Market tone</div>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Daily web scan · {Number.isNaN(asOf.getTime()) ? "today" : asOf.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </p>
          </div>
          <span className="rounded-full border border-primary/25 bg-primary-soft px-2.5 py-1 text-[11px] font-medium text-primary">
            {loading ? "refreshing" : view.source === "live-web" ? "live" : "fallback"}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {focusOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                focus === option.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-primary/20 bg-background text-primary hover:bg-primary-soft"
              }`}
              onClick={() => setFocus(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>
      <div className="px-6 py-5">
        <p className="text-[14px] leading-[1.55] text-foreground">{view.headline}</p>
        {view.headlines.length > 0 ? (
          <div className="mt-3 space-y-1.5">
            {view.headlines.slice(0, 3).map((title) => (
              <div className="truncate text-[11px] text-muted-foreground" key={title}>
                {title}
              </div>
            ))}
          </div>
        ) : null}
        {view.indices.length > 0 ? (
          <>
            <div className="mt-4 grid grid-cols-3 gap-2 tabular">
              {view.indices.slice(0, 3).map((idx) => (
                <div className="rounded-[8px] border border-primary/15 bg-primary-soft/60 px-3 py-2.5" key={idx.name}>
                  <div className="truncate text-[10px] uppercase tracking-wider text-primary/75">{idx.name}</div>
                  <div className="font-display mt-1.5 text-[16px] font-semibold leading-none tracking-tight text-primary">
                    {idx.value.toLocaleString(undefined, { maximumFractionDigits: idx.value > 100 ? 0 : 2 })}
                  </div>
                  <div className={`mt-1 text-[11px] font-medium ${idx.changePct >= 0 ? "text-success" : "text-danger"}`}>
                    {idx.changePct >= 0 ? "+" : ""}
                    {idx.changePct.toFixed(2)}%
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-[12px] border border-primary/15 bg-primary-soft/35 px-3 py-3">
              <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>Intraday movement</span>
                <span>demo chart</span>
              </div>
              <div className="space-y-2.5">
                {view.indices.slice(0, 4).map((idx) => {
                  const pct = Math.min(100, Math.max(8, Math.abs(idx.changePct) * 42));
                  const positive = idx.changePct >= 0;
                  return (
                    <div className="grid grid-cols-[88px_1fr_44px] items-center gap-2" key={`${idx.name}-bar`}>
                      <div className="truncate text-[11px] text-muted-foreground">{idx.name}</div>
                      <div className="relative h-2 overflow-hidden rounded-full bg-background">
                        <div
                          className={`absolute top-0 h-full rounded-full ${positive ? "left-1/2 bg-success" : "right-1/2 bg-danger"}`}
                          style={{ width: `${pct / 2}%` }}
                        />
                        <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
                      </div>
                      <div className={`text-right font-mono text-[10px] ${positive ? "text-success" : "text-danger"}`}>
                        {idx.changePct >= 0 ? "+" : ""}
                        {idx.changePct.toFixed(2)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
