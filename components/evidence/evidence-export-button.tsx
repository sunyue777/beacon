"use client";

import { Download } from "lucide-react";
import type { EvidencePack } from "@/lib/domain/evidence-pack";
import { downloadEvidencePackPdf } from "@/lib/utils/pdf-evidence";
import { cn } from "@/lib/utils/cn";

export function EvidenceExportButton({
  className,
  label = "Export evidence",
  pack,
  size = "sm"
}: {
  className?: string;
  label?: string;
  pack: EvidencePack;
  size?: "sm" | "xs";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-[8px] border border-[hsl(var(--ai-border)/0.55)] bg-card font-medium text-[hsl(var(--ai-accent))] transition hover:bg-[hsl(var(--ai-surface)/0.72)]",
        size === "xs" ? "px-2.5 py-1.5 text-[11px]" : "px-3 py-2 text-[12px]",
        className
      )}
      onClick={() => downloadEvidencePackPdf(pack)}
      type="button"
    >
      <Download className={size === "xs" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {label}
    </button>
  );
}
