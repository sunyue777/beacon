"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Check, Copy, GripHorizontal, X } from "lucide-react";
import { AIOutput } from "@/components/ai/ai-output";
import { BeaconMark } from "@/components/brand/beacon-mark";
import type { DemoEngine } from "@/lib/config/demo-engine";
import type { AgentRun } from "@/lib/repo/types";

type DraftChannel = "email" | "whatsapp" | "call_script";
type ChatModule = "term_explainer" | "draft_assist";
type ModelMode = DemoEngine;
type DraftFormat =
  | "concise_touch"
  | "meeting_confirm"
  | "review_followup"
  | "formal_note"
  | "client_review_pack"
  | "tax_loss_harvesting"
  | "earnings_analysis"
  | "phone_opener"
  | "maturity_reminder"
  | "meeting_scheduling";

interface DraftAssistOutput {
  headline?: string;
  why?: string;
  channel?: DraftChannel;
  subject?: string;
  draft?: string;
  artifactText?: string;
  artifactKind?: "message" | "pdf" | "script";
  formatLabel?: string;
  approvalChecklist?: string[];
}

interface TermExplainerOutput {
  headline?: string;
  term?: string;
  plainLanguage?: string;
  riskNotes?: string[];
  customerContext?: string[];
}

interface RunResult {
  ok: boolean;
  reason?: string;
  runId?: string;
  output?: AgentRun;
}

const draftFormatOptions: Record<DraftChannel, Array<{ value: DraftFormat; label: string }>> = {
  whatsapp: [
    { value: "concise_touch", label: "Quick check-in" },
    { value: "client_review_pack", label: "Client Review Pack brief" },
    { value: "tax_loss_harvesting", label: "Tax opportunity brief" },
    { value: "earnings_analysis", label: "Earnings / lifecycle brief" }
  ],
  email: [
    { value: "concise_touch", label: "Quick check-in" },
    { value: "meeting_confirm", label: "Appointment confirmation" },
    { value: "client_review_pack", label: "Client Review Pack PDF" },
    { value: "tax_loss_harvesting", label: "Tax opportunity scan PDF" },
    { value: "earnings_analysis", label: "Earnings / lifecycle analysis" },
    { value: "formal_note", label: "Portfolio change proposal" }
  ],
  call_script: [
    { value: "phone_opener", label: "Opener" },
    { value: "maturity_reminder", label: "Maturity reminder" },
    { value: "meeting_scheduling", label: "Meeting scheduling" },
    { value: "meeting_confirm", label: "Appointment confirmation" }
  ]
};

export function CopilotChatLauncher({ customerId, defaultEngine = "mock" }: { customerId?: string; defaultEngine?: ModelMode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  const queryModule = parseChatModule(searchParams.get("copilot"));
  const queryChannel = parseDraftChannel(searchParams.get("copilotChannel"));
  const queryFormat = parseDraftFormat(searchParams.get("copilotFormat"));
  const queryIntent = searchParams.get("copilotIntent") ?? "";
  const queryCustomerId = searchParams.get("copilotCustomerId") ?? undefined;
  const scopedCustomerId = customerId ?? getCustomerIdFromPath(pathname) ?? queryCustomerId;
  const isCustomerScoped = Boolean(scopedCustomerId);
  const [customerScopeName, setCustomerScopeName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [module, setModule] = useState<ChatModule>("term_explainer");
  const [channel, setChannel] = useState<DraftChannel>("email");
  const [draftFormat, setDraftFormat] = useState<DraftFormat>("concise_touch");
  const [modelMode, setModelMode] = useState<ModelMode>(defaultEngine);
  const [panelPosition, setPanelPosition] = useState<{ left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [instruction, setInstruction] = useState(
    isCustomerScoped
      ? "Explain structured note risk in plain RM language for this customer."
      : "Explain a product, market term, or service workflow for RM preparation."
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const scopeLabel = isCustomerScoped
    ? `Customer context · ${customerScopeName ?? "Current client"}`
    : pathname?.startsWith("/customers")
      ? "Client Book scope · no customer selected"
      : pathname?.startsWith("/workspace")
        ? "Workspace scope · no customer selected"
        : "General workspace scope";
  const scopeTitle = isCustomerScoped ? `Customer context · ${scopedCustomerId}` : scopeLabel;
  const draftOutput = result?.output?.output as DraftAssistOutput | undefined;
  const termOutput = result?.output?.output as TermExplainerOutput | undefined;

  useEffect(() => {
    if (queryModule) return;
    setResult(null);
    if (module === "term_explainer") {
      setInstruction(
        isCustomerScoped
          ? "Explain structured note risk in plain RM language for this customer."
          : "Explain a product, market term, or service workflow for RM preparation."
      );
    }
  }, [isCustomerScoped, module, queryModule, scopedCustomerId]);

  useEffect(() => {
    if (!isCustomerScoped) {
      setCustomerScopeName(null);
      return;
    }
    const value = document.querySelector<HTMLElement>("[data-customer-name]")?.dataset.customerName?.trim();
    setCustomerScopeName(value || null);
  }, [isCustomerScoped, pathname, scopedCustomerId]);

  useEffect(() => {
    if (!queryModule) return;
    setOpen(true);
    setModule(queryModule);
    if (queryChannel) {
      const nextFormat = coerceDraftFormatForChannel(queryChannel, queryFormat);
      setChannel(queryChannel);
      setDraftFormat(nextFormat);
    }
    setInstruction(
      queryIntent ||
        (queryModule === "draft_assist"
          ? draftInstructionFor(queryChannel ?? "email", coerceDraftFormatForChannel(queryChannel ?? "email", queryFormat))
          : isCustomerScoped
            ? "Explain structured note risk in plain RM language for this customer."
            : "Explain a product, market term, or service workflow for RM preparation.")
    );
    setResult(null);
  }, [isCustomerScoped, queryChannel, queryFormat, queryIntent, queryKey, queryModule]);

  async function runCopilotModule() {
    if (module === "draft_assist" && !scopedCustomerId) return;
    setLoading(true);
    setResult(null);
    const [response] = await Promise.all([
      fetch("/api/copilot/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module,
          customerId: scopedCustomerId,
          intent: instruction,
          runtimeOverride: "skill-direct",
          modelRoute: modelRouteFor(modelMode),
          personalization: {
            customerHabits: [],
            rmCustomInput: instruction
          },
          uiContext: {
            surface: "beacon-chatbot",
            ...(module === "draft_assist" ? { channel, format: draftFormat } : {})
          }
        })
      }),
      waitForStructuringFrame()
    ]);
    const payload = (await response.json()) as RunResult;
    setResult(payload);
    setCopiedKey(null);
    setLoading(false);
  }

  function selectModule(next: ChatModule) {
    setModule(next);
    const nextFormat = defaultDraftFormatFor(channel);
    if (next === "draft_assist") setDraftFormat(nextFormat);
    setInstruction(
      next === "draft_assist"
        ? draftInstructionFor(channel, nextFormat)
        : isCustomerScoped
          ? "Explain structured note risk in plain RM language for this customer."
          : "Explain a product, market term, or service workflow for RM preparation."
    );
    setResult(null);
    setCopiedKey(null);
  }

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    setPanelPosition({ left: rect.left, top: rect.top });
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    setPanelPosition({
      left: clamp(event.clientX - dragOffsetRef.current.x, 8, window.innerWidth - rect.width - 8),
      top: clamp(event.clientY - dragOffsetRef.current.y, 8, window.innerHeight - rect.height - 8)
    });
  }

  function stopDrag(event: React.PointerEvent<HTMLDivElement>) {
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <>
      <button
        aria-label="Open Your Beacon"
        className="fixed bottom-5 right-5 z-40 grid h-16 w-16 place-items-center rounded-full border shadow-lift transition hover:scale-[1.03]"
        onClick={() => setOpen(true)}
        style={{
          background: "linear-gradient(135deg, hsl(var(--brand-navy)), hsl(var(--brand-blue)))",
          borderColor: "hsl(var(--brand-gold) / 0.58)",
          color: "hsl(var(--brand-offwhite))"
        }}
        type="button"
      >
        <BeaconMark className="h-10 w-10" variant="mono" />
      </button>

      {open ? (
        <div
          ref={panelRef}
          className={`fixed z-40 max-h-[calc(100vh-5.5rem)] min-h-[380px] min-w-[320px] w-[min(360px,calc(100vw-2rem))] max-w-[calc(100vw-1rem)] resize overflow-y-auto rounded-[16px] border bg-card shadow-lift ${panelPosition ? "" : "bottom-24 right-5"}`}
          style={{
            borderColor: "hsl(var(--brand-gold) / 0.46)",
            ...(panelPosition ? { left: panelPosition.left, top: panelPosition.top } : {})
          }}
        >
          <header
            className="flex items-center justify-between gap-3 border-b px-3.5 py-2.5"
            style={{
              background: "linear-gradient(135deg, hsl(var(--brand-navy)), hsl(var(--brand-blue) / 0.88))",
              borderColor: "hsl(var(--brand-gold) / 0.32)",
              color: "hsl(var(--brand-offwhite))"
            }}
          >
            <div
              className="flex min-w-0 flex-1 cursor-move items-center gap-2"
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
              title="Drag to move"
            >
              <GripHorizontal className="h-3.5 w-3.5 shrink-0 opacity-55" />
              <BeaconMark className="h-5 w-5 shrink-0" variant="mono" />
              <div>
                <div className="text-xs font-semibold">Your Beacon</div>
                <div className="max-w-[240px] truncate text-[10px] opacity-75" title={scopeTitle}>{scopeLabel}</div>
              </div>
            </div>
            <button aria-label="Close Your Beacon" className="rounded-full p-1 hover:bg-white/10" onClick={() => setOpen(false)} type="button">
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="grid gap-2.5 p-3">
            <div className="rounded-[12px] border border-dashed border-[hsl(var(--ai-border)/0.45)] bg-[hsl(var(--brand-gold)/0.08)] p-2.5">
              <div className="text-xs font-semibold">Copilot module</div>
              <div className="mt-3 grid gap-2">
                <div className="grid gap-1">
                  <div className="text-[11px] font-medium text-muted-foreground">Function</div>
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Beacon function">
                    <FunctionButton active={module === "term_explainer"} label="Ask" onClick={() => selectModule("term_explainer")} />
                    <FunctionButton
                      active={module === "draft_assist"}
                      disabled={!isCustomerScoped}
                      label="Prep"
                      onClick={() => selectModule("draft_assist")}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
                    Engine
                    <select
                      className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                      value={modelMode}
                      onChange={(event) => setModelMode(event.target.value as ModelMode)}
                    >
                      <option value="live">Live LLM</option>
                      <option value="mock">Local mock</option>
                    </select>
                  </label>
                  <p className="self-end text-[10px] leading-4 text-muted-foreground">
                    {modelMode === "live" ? "Live sends prompts to the configured third-party LLM API." : "Local mock stays inside Beacon runtime."}
                  </p>
                </div>
                {module === "draft_assist" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
                      Channel
                      <select
                        className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                        value={channel}
                        onChange={(event) => {
                          const next = event.target.value as DraftChannel;
                          const nextFormat = defaultDraftFormatFor(next);
                          setChannel(next);
                          setDraftFormat(nextFormat);
                          setInstruction(draftInstructionFor(next, nextFormat));
                          setResult(null);
                          setCopiedKey(null);
                        }}
                      >
                        <option value="email">Email</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="call_script">Phone call</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
                      Format
                      <select
                        className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                        value={draftFormat}
                        onChange={(event) => {
                          const next = event.target.value as DraftFormat;
                          setDraftFormat(next);
                          setInstruction(draftInstructionFor(channel, next));
                          setResult(null);
                          setCopiedKey(null);
                        }}
                      >
                        {draftFormatOptions[channel].map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}
                <div className="grid gap-1">
                  <textarea
                    className={`resize-y rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground ${
                      module === "term_explainer" ? "min-h-[118px]" : "min-h-[82px]"
                    }`}
                    value={instruction}
                    onChange={(event) => setInstruction(event.target.value)}
                    placeholder="Tell Your Beacon what to prepare."
                  />
                  <p className="text-[10px] leading-4 text-muted-foreground">
                    Demo environment - do not enter real client information.
                  </p>
                </div>
                <button
                  className="rounded-md px-3 py-2 text-xs font-semibold text-[hsl(var(--brand-navy))] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={(module === "draft_assist" && !scopedCustomerId) || loading}
                  onClick={runCopilotModule}
                  style={{ background: "linear-gradient(135deg, hsl(var(--ai-accent-pink) / 0.92), hsl(var(--brand-gold) / 0.92))" }}
                  type="button"
                >
                  {loading
                    ? "Structuring..."
                    : module === "draft_assist" && !scopedCustomerId
                      ? "Select a client first"
                      : module === "term_explainer"
                        ? "Prepare answer"
                        : "Prepare draft"}
                </button>
                {result && !result.ok ? (
                  <div className="rounded-md border border-border bg-background p-2 text-[11px] text-muted-foreground">
                    {result.reason}
                  </div>
                ) : null}
              </div>
            </div>

            {module === "draft_assist" && loading ? (
              <DraftStructuringSkeleton
                channel={channel}
                customerName={customerScopeName ?? "this client"}
                formatLabel={draftFormatOptions[channel].find((option) => option.value === draftFormat)?.label ?? "Draft"}
                instruction={instruction}
              />
            ) : null}

            {module === "term_explainer" && termOutput && result?.output ? (
              <div className="grid gap-3">
                <div
                  className="rounded-[12px] border p-3"
                  style={{
                    background: "linear-gradient(135deg, hsl(var(--ai-accent-pink) / 0.08), hsl(var(--brand-gold) / 0.10))",
                    borderColor: "hsl(var(--ai-border) / 0.42)"
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-semibold">{termOutput.headline}</div>
                    <CopyButton
                      copied={copiedKey === "term-output"}
                      label="Copy answer"
                      onClick={() => copyText("term-output", buildTermCopyText(termOutput), setCopiedKey)}
                    />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{termOutput.plainLanguage}</p>
                  {(termOutput.riskNotes ?? []).length > 0 ? (
                    <ul className="mt-3 space-y-1 text-[11px] leading-5 text-muted-foreground">
                      {(termOutput.riskNotes ?? []).map((item, index) => (
                        <li key={`${item}-${index}`}>- {item}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <AIOutput
                  title="Knowledge answer output"
                  status="Prepared trace"
                  generatedAt={result.output.finishedAt}
                  summary={termOutput.plainLanguage ?? "Knowledge answer prepared for RM comprehension."}
                  run={result.output}
                />
              </div>
            ) : null}

            {module === "draft_assist" && draftOutput && result?.output ? (
              <AIOutput
                title={draftOutput.headline ?? "Draft assist output"}
                status={result.output.fallbackMode ? "Fallback trace" : "Prepared trace"}
                generatedAt={result.output.finishedAt}
                summary={draftOutput.why ?? "Draft prepared for RM review."}
                run={result.output}
              >
                <div
                  className="rounded-[12px] border p-3"
                  style={{
                    background: "hsl(var(--background) / 0.78)",
                    borderColor: "hsl(var(--ai-border) / 0.42)"
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    {draftOutput.subject ? <div className="text-[12px] text-muted-foreground">Subject: {draftOutput.subject}</div> : <span />}
                    <CopyButton
                      copied={copiedKey === "draft-output"}
                      label="Copy draft"
                      onClick={() => copyText("draft-output", buildDraftCopyText(draftOutput), setCopiedKey)}
                    />
                  </div>
                  <pre className="mt-3 whitespace-pre-wrap rounded-md border border-[hsl(var(--ai-border)/0.35)] bg-card p-3 font-sans text-xs leading-5 text-foreground">
                    {draftOutput.draft}
                  </pre>
                  {draftOutput.artifactKind === "pdf" ? (
                    <button
                      className="mt-3 rounded-md px-3 py-2 text-xs font-semibold text-[hsl(var(--brand-navy))]"
                      onClick={() => downloadDraftPdf(draftOutput)}
                      style={{ background: "linear-gradient(135deg, hsl(var(--ai-accent-pink) / 0.88), hsl(var(--brand-gold) / 0.92))" }}
                      type="button"
                    >
                      Download PDF
                    </button>
                  ) : null}
                </div>
              </AIOutput>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function getCustomerIdFromPath(pathname: string | null) {
  const match = pathname?.match(/^\/customers\/([^/?#]+)/);
  return match?.[1];
}

function modelRouteFor(mode: ModelMode) {
  return mode === "live" ? "siliconflow" : "mock";
}

function waitForStructuringFrame() {
  return new Promise((resolve) => window.setTimeout(resolve, 450));
}

function DraftStructuringSkeleton({
  channel,
  customerName,
  formatLabel,
  instruction
}: {
  channel: DraftChannel;
  customerName: string;
  formatLabel: string;
  instruction: string;
}) {
  const preview = buildDraftSkeletonText(channel, customerName, instruction);
  return (
    <div
      aria-live="polite"
      className="rounded-[12px] border p-3"
      style={{
        background: "hsl(var(--background) / 0.78)",
        borderColor: "hsl(var(--ai-border) / 0.42)"
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold">Rule-based draft frame</div>
          <div className="mt-1 text-[11px] text-muted-foreground">{formatLabel}</div>
        </div>
        <span className="rounded-full border border-[hsl(var(--ai-border)/0.48)] bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          structuring...
        </span>
      </div>
      <pre className="mt-3 whitespace-pre-wrap rounded-md border border-[hsl(var(--ai-border)/0.35)] bg-card p-3 font-sans text-xs leading-5 text-muted-foreground">
        {preview}
      </pre>
      <div className="mt-2 grid gap-1 text-[11px] leading-5 text-muted-foreground">
        <span>- Evidence placeholders: selected signal, customer context, RM note.</span>
        <span>- Compliance stance: prepared state, RM review required.</span>
      </div>
    </div>
  );
}

function buildDraftSkeletonText(channel: DraftChannel, customerName: string, instruction: string) {
  if (channel === "call_script") {
    return [
      `Call prep for ${customerName}`,
      "",
      "Opener: Acknowledge context and ask permission to review.",
      "Reason for call: Link to the selected client signal.",
      `RM note: ${instruction}`,
      "Close: Confirm next step and required review."
    ].join("\n");
  }

  if (channel === "whatsapp") {
    return [
      `Hi ${customerName},`,
      "",
      "I am preparing a short, factual check-in based on the selected client signal.",
      `RM note: ${instruction}`,
      "",
      "Next step: keep it concise and leave any decision to the client."
    ].join("\n");
  }

  return [
    `Subject: Follow-up for ${customerName}`,
    "",
    `Hi ${customerName},`,
    "",
    "I am preparing a client-ready note based on the selected signal and evidence.",
    `RM note: ${instruction}`,
    "",
    "Next step: include approval-safe wording before sending."
  ].join("\n");
}

async function copyText(key: string, value: string, setCopiedKey: (key: string | null) => void) {
  if (!value.trim()) return;
  await navigator.clipboard.writeText(value);
  setCopiedKey(key);
  window.setTimeout(() => setCopiedKey(null), 1400);
}

function buildTermCopyText(output: TermExplainerOutput) {
  return [
    output.headline,
    output.plainLanguage,
    ...(output.riskNotes ?? []).map((item) => `- ${item}`)
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildDraftCopyText(output: DraftAssistOutput) {
  return [output.subject ? `Subject: ${output.subject}` : undefined, output.draft]
    .filter(Boolean)
    .join("\n\n");
}

function parseChatModule(value: string | null): ChatModule | undefined {
  return value === "term_explainer" || value === "draft_assist" ? value : undefined;
}

function parseDraftChannel(value: string | null): DraftChannel | undefined {
  return value === "email" || value === "whatsapp" || value === "call_script" ? value : undefined;
}

function parseDraftFormat(value: string | null): DraftFormat | undefined {
  return isDraftFormat(value) ? value : undefined;
}

function draftInstructionFor(channel: DraftChannel, format: DraftFormat) {
  if (channel === "call_script") {
    if (format === "maturity_reminder") {
      return "Prepare a phone call script for a maturity reminder. Use opener, maturity context, client question, and close sections.";
    }
    if (format === "meeting_scheduling") {
      return "Prepare a phone call script to schedule a review meeting. Keep it warm, brief, and permission-based.";
    }
    if (format === "meeting_confirm") {
      return "Prepare a phone call script to confirm an existing appointment. Keep it short and service-led.";
    }
    return "Prepare a concise phone opener for RM review. Use opener, client context, one reason for the call, and close sections.";
  }
  if (channel === "whatsapp") {
    if (format === "client_review_pack") {
      return "Prepare a short WhatsApp note offering to send a Client Review Pack PDF. Keep it under 4 short lines, natural, no subject, no email closing.";
    }
    if (format === "tax_loss_harvesting") {
      return "Prepare a short WhatsApp note offering a tax-aware opportunity scan PDF. Include that any tax item needs professional review.";
    }
    if (format === "earnings_analysis") {
      return "Prepare a short WhatsApp note offering an earnings or lifecycle brief. Keep it factual and timing-led.";
    }
    return "Prepare a short WhatsApp check-in for RM review. Keep it under 4 short lines, warm, factual, no subject, no email closing.";
  }
  if (format === "formal_note") {
    return "Prepare a portfolio change proposal email for manager review. Use client-friendly language and make clear that no change happens before client instruction and required review.";
  }
  if (format === "client_review_pack") {
    return "Prepare a Client Review Pack PDF cover email. Include relationship context, portfolio snapshot, lifecycle items, and next service steps.";
  }
  if (format === "tax_loss_harvesting") {
    return "Prepare a tax-aware opportunity scan PDF cover email. Avoid tax advice; say items should be reviewed with the relevant tax professional.";
  }
  if (format === "earnings_analysis") {
    return "Prepare an earnings or lifecycle analysis email. Use product maturity, quarterly, or annual review context where relevant.";
  }
  if (format === "meeting_confirm") {
    return "Prepare an appointment confirmation email with a subject and short paragraphs.";
  }
  return "Prepare a concise client email draft for RM review with a subject and short paragraphs.";
}

function defaultDraftFormatFor(channel: DraftChannel): DraftFormat {
  return draftFormatOptions[channel][0]?.value ?? "concise_touch";
}

function coerceDraftFormatForChannel(channel: DraftChannel, value?: DraftFormat): DraftFormat {
  return value && draftFormatOptions[channel].some((option) => option.value === value) ? value : defaultDraftFormatFor(channel);
}

function isDraftFormat(value: string | null): value is DraftFormat {
  return (
    value === "concise_touch" ||
    value === "meeting_confirm" ||
    value === "review_followup" ||
    value === "formal_note" ||
    value === "client_review_pack" ||
    value === "tax_loss_harvesting" ||
    value === "earnings_analysis" ||
    value === "phone_opener" ||
    value === "maturity_reminder" ||
    value === "meeting_scheduling"
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function downloadDraftPdf(output: DraftAssistOutput) {
  const title = output.headline ?? output.formatLabel ?? "Dyna Beacon draft";
  const lines = [
    title,
    output.subject ? `Subject: ${output.subject}` : "",
    "",
    output.artifactText ?? output.draft ?? ""
  ]
    .join("\n")
    .split(/\r?\n/)
    .flatMap((line) => wrapPdfLine(line, 82));
  const pdf = buildSimplePdf(lines);
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slugifyPdfName(title)}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildSimplePdf(lines: string[]) {
  const contentLines = lines.slice(0, 46).map((line) => `(${escapePdfText(toPdfAscii(line))}) Tj T*`);
  const stream = ["BT", "/F1 11 Tf", "50 790 Td", "14 TL", ...contentLines, "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefAt = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map((offset) => `${offset.toString().padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return body;
}

function wrapPdfLine(line: string, width: number) {
  if (!line) return [""];
  const words = line.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function toPdfAscii(value: string) {
  return value.replace(/[^\x20-\x7E]/g, "?");
}

function slugifyPdfName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "dyna-beacon-draft";
}

function CopyButton({ copied, label, onClick }: { copied: boolean; label: string; onClick: () => void }) {
  return (
    <button
      aria-label={label}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold transition hover:bg-[hsl(var(--brand-gold)/0.16)]"
      onClick={onClick}
      style={{
        borderColor: "hsl(var(--ai-border) / 0.44)",
        color: copied ? "hsl(var(--success))" : "hsl(var(--muted-foreground))"
      }}
      type="button"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function FunctionButton({
  active,
  disabled,
  label,
  onClick
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className="rounded-md border px-2.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      style={{
        background: active
          ? "linear-gradient(135deg, hsl(var(--ai-accent-pink) / 0.18), hsl(var(--brand-gold) / 0.22))"
          : "hsl(var(--background))",
        borderColor: active ? "hsl(var(--ai-border) / 0.62)" : "hsl(var(--border))",
        color: active ? "hsl(var(--ai-foreground))" : "hsl(var(--muted-foreground))"
      }}
      type="button"
    >
      {label}
    </button>
  );
}
