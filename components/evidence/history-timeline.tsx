import type { EvidenceTimelineItem, EvidenceTone } from "@/lib/domain/evidence-pack";

export function HistoryTimeline({
  compact,
  items,
  title = "History"
}: {
  compact?: boolean;
  items: EvidenceTimelineItem[];
  title?: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className={compact ? "rounded-[12px] border border-border bg-background/70 p-3" : "rounded-[14px] border border-border bg-card p-4"}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[13px] font-semibold">{title}</div>
        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {items.length} steps
        </span>
      </div>
      <div className="space-y-0">
        {items.map((item, index) => (
          <div className="grid grid-cols-[18px_1fr] gap-2.5" key={item.key}>
            <div className="flex flex-col items-center">
              <span
                className="mt-1 h-2.5 w-2.5 rounded-full border"
                style={{
                  background: toneBackground(item.tone),
                  borderColor: toneBorder(item.tone)
                }}
              />
              {index < items.length - 1 ? <span className="mt-1 h-full min-h-8 w-px bg-border" /> : null}
            </div>
            <div className={index < items.length - 1 ? "pb-3" : ""}>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{
                    background: toneSoft(item.tone),
                    borderColor: toneBorder(item.tone),
                    color: toneText(item.tone)
                  }}
                >
                  {item.label}
                </span>
                <span className="text-[12px] font-medium">{item.actorName}</span>
                {item.actorRole ? <span className="text-[11px] text-muted-foreground">{item.actorRole}</span> : null}
                <span className="font-mono text-[10px] text-muted-foreground tabular">{formatTimelineTimestamp(item.timestamp)}</span>
              </div>
              {item.note ? <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{item.note}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function toneBackground(tone: EvidenceTone) {
  if (tone === "success") return "hsl(var(--success))";
  if (tone === "warning") return "hsl(var(--warning))";
  if (tone === "danger") return "hsl(var(--danger))";
  if (tone === "ai") return "hsl(var(--ai-accent))";
  return "hsl(var(--muted-foreground))";
}

function toneSoft(tone: EvidenceTone) {
  if (tone === "success") return "hsl(var(--success) / 0.10)";
  if (tone === "warning") return "hsl(var(--warning) / 0.12)";
  if (tone === "danger") return "hsl(var(--danger) / 0.10)";
  if (tone === "ai") return "hsl(var(--ai-surface))";
  return "hsl(var(--muted))";
}

function toneBorder(tone: EvidenceTone) {
  if (tone === "success") return "hsl(var(--success) / 0.35)";
  if (tone === "warning") return "hsl(var(--warning) / 0.38)";
  if (tone === "danger") return "hsl(var(--danger) / 0.35)";
  if (tone === "ai") return "hsl(var(--ai-border) / 0.55)";
  return "hsl(var(--border))";
}

function toneText(tone: EvidenceTone) {
  if (tone === "success") return "hsl(var(--success))";
  if (tone === "warning") return "hsl(var(--warning))";
  if (tone === "danger") return "hsl(var(--danger))";
  if (tone === "ai") return "hsl(var(--ai-accent))";
  return "hsl(var(--muted-foreground))";
}

function formatTimelineTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}
