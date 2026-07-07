export function formatCurrency(value: number, currency: string, options: { compact?: boolean } = {}) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    ...(options.compact && Math.abs(value) >= 10_000
      ? {
          notation: "compact",
          compactDisplay: "short",
          maximumFractionDigits: Math.abs(value) >= 1_000_000 && Math.abs(value) < 10_000_000 ? 1 : 0
        }
      : {})
  }).format(value);
}

export function formatPercent(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 0
  }).format(value);
}
