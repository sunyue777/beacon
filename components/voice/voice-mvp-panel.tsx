"use client";

import { useState } from "react";
import { Headphones, PhoneCall, RadioTower } from "lucide-react";
import { AIOutput } from "@/components/ai/ai-output";
import { Button } from "@/components/ui/button";
import type { AgentRun, Transcript } from "@/lib/repo/types";
import { voiceScenarioCatalog, type VoiceIntegrationMode, type VoiceScenario } from "@/lib/voice/types";

type VoiceRunResponse = {
  ok: boolean;
  reason?: string;
  output?: {
    transcript?: Transcript;
    agentRun?: AgentRun;
    actionItems: string[];
    followUpDraft?: {
      channel: "email" | "whatsapp";
      text: string;
      approvalRequired: boolean;
    };
  };
};

const scenarioOptions: VoiceScenario[] = [
  "meeting_confirmation",
  "maturity_reminder",
  "authorization_prompt",
  "inbound_rm_assist",
  "post_call_follow_up"
];

export function VoiceMvpPanel({ customerId, customerName }: { customerId: string; customerName: string }) {
  const [scenario, setScenario] = useState<VoiceScenario>("meeting_confirmation");
  const [integrationMode, setIntegrationMode] = useState<VoiceIntegrationMode>("web_call_simulator");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VoiceRunResponse | null>(null);
  const catalog = voiceScenarioCatalog[scenario];
  const transcript = result?.output?.transcript;
  const agentRun = result?.output?.agentRun;

  async function runVoice() {
    setLoading(true);
    setResult(null);
    const response = await fetch("/api/voice/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId,
        scenario,
        integrationMode
      })
    });
    const payload = (await response.json()) as VoiceRunResponse;
    setResult(payload);
    setLoading(false);
  }

  return (
    <div
      className="rounded-[16px] border p-5"
      style={{
        background: "linear-gradient(135deg, hsl(var(--brand-navy) / 0.055), hsl(var(--brand-gold) / 0.08))",
        borderColor: "hsl(var(--brand-gold) / 0.38)"
      }}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            <RadioTower className="h-3.5 w-3.5" />
            Phase 8 Voice MVP
          </div>
          <h3 className="font-display mt-1.5 text-[22px] font-medium tracking-tight">Voice channel simulation</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Simulate call-out / call-in, capture transcript, prepare action items, draft follow-up, and write trace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
            Scenario
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              value={scenario}
              onChange={(event) => setScenario(event.target.value as VoiceScenario)}
            >
              {scenarioOptions.map((item) => (
                <option key={item} value={item}>
                  {voiceScenarioCatalog[item].label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
            Path
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              value={integrationMode}
              onChange={(event) => setIntegrationMode(event.target.value as VoiceIntegrationMode)}
            >
              <option value="web_call_simulator">Web call simulator</option>
              <option value="dyna_voice_saas">Dyna Voice SaaS path</option>
            </select>
          </label>
          <Button className="self-end" disabled={loading} onClick={runVoice} size="sm" type="button">
            <PhoneCall className="h-3.5 w-3.5" />
            {loading ? "Running..." : "Run voice"}
          </Button>
        </div>
      </header>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <VoiceFact label="Customer" value={customerName} />
        <VoiceFact label="Direction" value={catalog.direction} />
        <VoiceFact label="Approval" value={catalog.requiresApproval ? "required" : "not required"} />
      </div>

      {result && !result.ok ? (
        <div className="mt-4 rounded-md border border-warning/35 bg-warning/10 px-3 py-2 text-xs text-warning">
          {result.reason}
        </div>
      ) : null}

      {transcript ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
          <section className="rounded-[12px] border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold">
                  <Headphones className="h-3.5 w-3.5 text-primary" />
                  Call summary
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{transcript.summary}</p>
              </div>
              <span className="rounded-full border border-border bg-muted px-2.5 py-1 font-mono text-[10px] uppercase text-muted-foreground">
                {transcript.channel}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {transcript.turns.map((turn) => (
                <div className="grid grid-cols-[72px_1fr] gap-3 border-t border-dashed border-border pt-2 text-xs" key={`${turn.timestamp}-${turn.speaker}`}>
                  <div className="font-mono text-[10px] uppercase text-muted-foreground">
                    {turn.speaker}
                  </div>
                  <div className="leading-5 text-foreground">{turn.text}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[12px] border border-[hsl(var(--ai-border)/0.42)] bg-card p-4">
            <div className="ai-generated-mark text-xs font-semibold">Action items</div>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
              {(result.output?.actionItems ?? []).map((item) => (
                <li className="rounded-md border border-border bg-background px-3 py-2" key={item}>
                  {item}
                </li>
              ))}
            </ul>
            {result.output?.followUpDraft ? (
              <div
                className="mt-3 rounded-md border p-3"
                style={{
                  background: "linear-gradient(135deg, hsl(var(--ai-accent-pink) / 0.08), hsl(var(--brand-gold) / 0.10))",
                  borderColor: "hsl(var(--ai-border) / 0.42)"
                }}
              >
                <div className="text-xs font-semibold">Voice-derived follow-up draft</div>
                <div className="mt-1 font-mono text-[10px] uppercase text-muted-foreground">
                  {result.output.followUpDraft.channel} · {result.output.followUpDraft.approvalRequired}
                </div>
                <pre className="mt-3 whitespace-pre-wrap rounded-md border border-[hsl(var(--ai-border)/0.35)] bg-background/72 p-3 font-sans text-xs leading-5">
                  {result.output.followUpDraft.text}
                </pre>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {agentRun ? (
        <div className="mt-4">
          <AIOutput
            title="Voice trace"
            status={agentRun.fallbackMode ? "Simulated SaaS trace" : "Web-call trace"}
            generatedAt={agentRun.finishedAt}
            summary={(agentRun.output as { summary?: string }).summary ?? "Voice summary prepared with trace."}
            run={agentRun}
          />
        </div>
      ) : null}
    </div>
  );
}

function VoiceFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-border bg-background/70 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-xs font-semibold">{value}</div>
    </div>
  );
}
