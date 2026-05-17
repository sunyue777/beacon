import { NextResponse } from "next/server";
import { getRepo } from "@/lib/repo";

type MarketFocus = "asia" | "us-rates" | "fx" | "china-hk";

const focusConfig: Record<MarketFocus, { label: string; query: string; symbols: { symbol: string; name: string }[] }> = {
  asia: {
    label: "Asia markets",
    query: "Asia markets wealth management stocks bonds",
    symbols: [
      { symbol: "^HSI", name: "Hang Seng" },
      { symbol: "^N225", name: "Nikkei 225" },
      { symbol: "000001.SS", name: "Shanghai" }
    ]
  },
  "us-rates": {
    label: "US rates",
    query: "US Treasury yields equities Asia wealth management",
    symbols: [
      { symbol: "^GSPC", name: "S&P 500" },
      { symbol: "^IXIC", name: "Nasdaq" },
      { symbol: "^TNX", name: "US 10Y" }
    ]
  },
  fx: {
    label: "FX",
    query: "Asian currencies USD SGD HKD JPY markets",
    symbols: [
      { symbol: "SGD=X", name: "USD/SGD" },
      { symbol: "HKD=X", name: "USD/HKD" },
      { symbol: "JPY=X", name: "USD/JPY" }
    ]
  },
  "china-hk": {
    label: "China / HK",
    query: "China Hong Kong markets wealth management",
    symbols: [
      { symbol: "^HSI", name: "Hang Seng" },
      { symbol: "000001.SS", name: "Shanghai" },
      { symbol: "399001.SZ", name: "Shenzhen" }
    ]
  }
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const focus = normalizeFocus(url.searchParams.get("focus"));
  const config = focusConfig[focus];
  const repo = getRepo();
  const fallback = await repo.getLatestMarketSnapshot();

  try {
    const [indices, headlines] = await Promise.all([
      Promise.all(config.symbols.map((item) => fetchYahooChart(item.symbol, item.name))),
      fetchNewsTitles(config.query)
    ]);
    const goodIndices = indices.filter((item): item is NonNullable<typeof item> => Boolean(item));
    const firstMove = goodIndices[0];
    const headline =
      headlines[0] ??
      (firstMove
        ? `${config.label}: ${firstMove.name} ${formatSigned(firstMove.changePct)} today; review client exposures before outreach.`
        : fallback?.headline ?? "Market scan prepared from fallback demo data.");

    return NextResponse.json(
      {
        focus,
        label: config.label,
        source: goodIndices.length > 0 || headlines.length > 0 ? "live-web" : "demo-fallback",
        asOf: new Date().toISOString(),
        headline,
        headlines: headlines.slice(0, 3),
        indices: goodIndices.length > 0 ? goodIndices : fallback?.indices ?? []
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      {
        focus,
        label: config.label,
        source: "demo-fallback",
        asOf: new Date().toISOString(),
        headline: fallback?.headline ?? "Market scan prepared from fallback demo data.",
        headlines: [],
        indices: fallback?.indices ?? []
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}

function normalizeFocus(value: string | null): MarketFocus {
  if (value === "us-rates" || value === "fx" || value === "china-hk") return value;
  return "asia";
}

async function fetchYahooChart(symbol: string, name: string) {
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`,
    { cache: "no-store", headers: { "User-Agent": "Dyna-Beacon-Demo/1.0" }, signal: AbortSignal.timeout(3000) }
  );
  if (!response.ok) return null;
  const data = await response.json();
  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  const price = Number(meta?.regularMarketPrice ?? meta?.previousClose);
  const previous = Number(meta?.chartPreviousClose ?? meta?.previousClose);
  if (!Number.isFinite(price) || !Number.isFinite(previous) || previous === 0) return null;
  return {
    name,
    value: Math.round(price * 100) / 100,
    changePct: Math.round(((price - previous) / previous) * 10_000) / 100
  };
}

async function fetchNewsTitles(query: string) {
  const response = await fetch(
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`,
    { cache: "no-store", headers: { "User-Agent": "Dyna-Beacon-Demo/1.0" }, signal: AbortSignal.timeout(3000) }
  );
  if (!response.ok) return [];
  const xml = await response.text();
  return [...xml.matchAll(/<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>/g)]
    .map((match) => cleanTitle(match[1]))
    .filter(Boolean)
    .slice(0, 4);
}

function cleanTitle(value: string) {
  return value.replace(/\s+-\s+[^-]+$/, "").trim();
}

function formatSigned(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}
