import type { AgentRun, AuditEvent } from "@/lib/repo/types";

export interface DraftReviewSummary {
  channelLabel: string;
  title: string;
  wordCount: number;
  guardLabel: string;
  guardTone: "clean" | "adjusted";
  runState: AgentRun["state"];
}

export function getDraftReviewSummary(run?: AgentRun, event?: AuditEvent): DraftReviewSummary {
  const output = isRecord(run?.output) ? run.output : {};
  const draft = typeof output.draft === "string" ? output.draft : "";
  const subject = typeof output.subject === "string" && output.subject.trim() ? output.subject.trim() : undefined;
  const headline = typeof output.headline === "string" && output.headline.trim() ? output.headline.trim() : undefined;
  const channel = typeof output.channel === "string" ? output.channel : run?.channel ?? event?.payload?.channel;
  const adjusted = Boolean(run?.vocabularyAdjusted);

  return {
    channelLabel: labelForChannel(channel),
    title: subject ?? headline ?? "Client communication draft",
    wordCount: countWords(draft),
    guardLabel: adjusted ? "vocabulary adjusted" : "guard clean",
    guardTone: adjusted ? "adjusted" : "clean",
    runState: run?.state ?? "prepared"
  };
}

function labelForChannel(channel: unknown) {
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "call_script" || channel === "talking_points") return "Phone call";
  if (channel === "email") return "Email";
  return "Client";
}

function countWords(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
