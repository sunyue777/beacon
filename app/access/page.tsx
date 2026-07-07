import { ArrowRight, ShieldCheck } from "lucide-react";
import { safeRelativePath } from "@/lib/auth/access-gate";

type AccessPageProps = {
  searchParams?: Promise<{ error?: string; next?: string }>;
};

export default async function AccessPage({ searchParams }: AccessPageProps) {
  const params = await searchParams;
  const next = safeRelativePath(params?.next);
  const hasError = params?.error === "1";

  return (
    <main className="brand-surface relative min-h-screen overflow-hidden text-foreground">
      <div aria-hidden className="brand-grid pointer-events-none absolute inset-0 opacity-30" />
      <div aria-hidden className="brand-beam-surface pointer-events-none absolute inset-y-0 left-0 w-[58vw] opacity-70" />

      <section className="relative z-10 grid min-h-screen place-items-center px-5 py-10">
        <div className="w-full max-w-[460px] rounded-[24px] border border-border/70 bg-card/90 p-7 shadow-lift backdrop-blur-xl">
          <div className="mb-7 flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-[hsl(var(--ai-border)/0.55)] bg-ai-surface text-ai-accent">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h1 className="font-display text-[30px] font-medium leading-tight tracking-tight">Guided demo access</h1>
              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                This is a guided demo environment. Enter the access code shared with you.
              </p>
            </div>
          </div>

          <form action="/api/access" className="space-y-4" method="post">
            <input name="next" type="hidden" value={next} />
            <label className="block">
              <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Access code
              </span>
              <input
                autoComplete="off"
                autoFocus
                className="h-12 w-full rounded-[12px] border border-border bg-background px-3.5 text-[15px] outline-none transition placeholder:text-muted-foreground/55 focus:border-primary focus:ring-4 focus:ring-primary/12"
                name="code"
                placeholder="Enter code"
                type="password"
              />
            </label>

            {hasError ? (
              <p className="rounded-[10px] border border-destructive/20 bg-destructive/10 px-3 py-2 text-[12px] leading-5 text-destructive">
                Access could not be verified.
              </p>
            ) : null}

            <button
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:-translate-y-px hover:bg-primary/92"
              type="submit"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
