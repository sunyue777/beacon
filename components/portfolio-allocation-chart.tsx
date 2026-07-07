"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Holding, Product } from "@/lib/repo/types";
import { toUsd } from "@/lib/utils/currency";
import { formatCurrency } from "@/lib/utils/format";

// Chart palette derived from token system. Uses CSS custom properties so
// the chart automatically follows light/dark theme and any future brand tweak.
const colors = [
  "hsl(var(--brand-navy))",
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--brand-navy) / 0.68)",
  "hsl(var(--primary) / 0.62)",
  "hsl(var(--accent) / 0.72)"
];

export function PortfolioAllocationChart({
  holdings,
  products,
  showValues = true,
  layout = "split"
}: {
  holdings: Holding[];
  products: Product[];
  showValues?: boolean;
  layout?: "split" | "stack";
}) {
  const productById = new Map(products.map((product) => [product.productId, product]));
  const grouped = holdings.reduce<Record<string, number>>((acc, holding) => {
    const category = productById.get(holding.productId)?.category ?? "Other";
    acc[category] = (acc[category] ?? 0) + toUsd(holding.value, holding.currency);
    return acc;
  }, {});
  const total = Object.values(grouped).reduce((sum, value) => sum + value, 0) || 1;
  const data = Object.entries(grouped).map(([name, value]) => ({ name, pct: (value / total) * 100, value }));

  if (data.length === 0) {
    return <div className="flex h-72 items-center justify-center rounded-md border border-border bg-background text-sm text-muted-foreground">No holdings yet</div>;
  }

  return (
    <div className={`grid gap-4 ${layout === "split" ? "md:grid-cols-[1fr_0.8fr]" : ""}`}>
      <div className={layout === "split" ? "h-72" : "h-60"}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={64} outerRadius={104} paddingAngle={2}>
              {data.map((entry, index) => (
                <Cell fill={colors[index % colors.length]} key={entry.name} />
              ))}
            </Pie>
            <Tooltip formatter={(value, _name, item) => showValues ? formatCurrency(Number(value), "USD", { compact: true }) : `${Number(item.payload?.pct ?? 0).toFixed(1)}%`} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2">
        {data.map((entry, index) => (
          <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2" key={entry.name}>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[index % colors.length] }} />
              <span className="text-sm">{entry.name}</span>
            </div>
            <span className="text-sm font-semibold">
              {showValues ? formatCurrency(entry.value, "USD", { compact: true }) : `${entry.pct.toFixed(1)}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
