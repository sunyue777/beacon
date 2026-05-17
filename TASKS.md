# Dyna Beacon Task Board

## Current Status

- [x] Local repo and project documentation are in place.
- [x] Next.js App Router, TypeScript, Tailwind, theme tokens, app shell, repo layer, AI output wrapper, and audit surfaces are in place.
- [x] Local demo dataset is generated and validated for 595 customers.
- [x] Current ownership scopes: Jensen Parker / Junior owns 77 customers, Adrian Lim / Mid-level owns 296, Sofia Tan / Manager owns 222 high-AUM customers.
- [x] Current visibility scopes: Junior sees 77, Mid-level sees 296, Manager sees all 595 through team visibility.
- [x] Role login, role-scoped navigation, permission checks, account accents, and light/dark mode are in place.
- [x] Latest Dyna Beacon brand assets, icon-only app header, watermark treatment, manager navy emphasis, and v1.2 demo label are in place.
- [x] Client Book, Workspace, Client 360, Management, and Your Beacon chatbot are demo-ready for internal review.
- [x] Data quality pass completed: richer name diversity, household markers, multi-currency accounts, holdings, transactions, AI marks, and validation gates.
- [x] Approval narrative is narrowed: only client-facing `draft_assist` outputs require review-before-use; internal preparation tools use trace-only / auto approval.
- [x] Junior draft -> Manager approval -> send / return-for-edit loop is implemented.
- [x] Returned drafts appear to the originating RM; the RM can delete, modify, and resubmit.
- [x] Your Beacon supports Email, WhatsApp, and Phone call channels with differentiated formats.
- [x] Customer-report and planning-context capabilities are merged into **Client Review Pack**.
- [x] Client Review Pack, Tax opportunity scan, and Earnings / lifecycle analysis are available as PDF-ready chatbot formats.
- [x] Generated chatbot content has a copy button; PDF-ready outputs also have `Download PDF`.
- [x] Scope decision: current v1.x demo focuses on CRM, investment context, Copilot, approval, and audit. Nonessential provider/runtime experiments stay out of the active demo path.

## Immediate Next Actions

- [x] Nora: run one internal product pass before sending to Claude Code for review.
- [x] Claude Code: cross-review current v1.2 flow, especially approval, chatbot format logic, and story coherence.
- [x] CodeX: fix only issues that block the demo narrative or create obvious product/data inconsistency.
- [ ] Nora + UI session: continue visual refinement without changing `/api/copilot/run`, customer scope, approval transitions, or generated bundle shape.
- [x] Nora: decide whether Client Review Pack / Tax opportunity scan / Earnings lifecycle analysis should become full `/api/copilot/run` modules or remain `draft_assist` formats for v1.2.
- [x] CodeX: after review, run full local gate: `npm run validate-data`, `npx tsc --noEmit`, `npm test`, `npm run build`.
- [ ] Claude Code: re-review after this cleanup pass.
- [ ] Nora: push to GitHub and connect Vercel preview after local gate is green.

## How To Run Frontend Locally

```powershell
cd D:\Nora\01_Hive\Dyna_WM\Dyna-Beacon
npm run dev
```

Open:

```text
http://localhost:3000
```

Useful pages:

- `/login` - role login with v1.2 brand hero, vector beacon-mark, and light/dark toggle.
- `/workspace` - RM workspace status, brief, queue, in-flight work, market tone, and returned-draft notices.
- `/customers` - Client Book, defaulting to the signed-in RM's owned book.
- `/customers?role=Junior` - Manager-only visibility pivot for Junior scoped book.
- `/customers?role=MidLevel` - Manager-only visibility pivot for Mid-level scoped book.
- `/manager` - Management area for governance, approvals, coverage, compliance, and audit.
- `/customers/[customerId]` - Client 360 with Holdings, Alignment, Activity, and Copilot.

Safe cleanup when the app feels stale after font or asset changes:

```powershell
Remove-Item -Recurse -Force .\.next
npm run dev
```

## Documentation Inventory

Keep these as current working docs:

- `README.md` - repo entry.
- `PLAN.en.md` / `PLAN.zh.md` - original product plan.
- `DESIGN.md` - local design contract.
- `MODULE_CATALOG.md` - module map reference.
- `docs/COPILOT_CONTRACT.zh.md` - `/api/copilot/run` contract.
- `docs/AGENT_IO_TRACE.zh.md` - agent input / output / trace explanation.
- `docs/COPILOT_PROMPT_CUSTOMIZATION.zh.md` - where Nora can edit prompt and format rules.
- `docs/DATA_DICTIONARY.zh.md` - synthetic/mock data dictionary.
- `docs/schemas/*` - deeper schema docs for customer IT mapping.
- `docs/DEMO_SCRIPT.zh.md` - current v1.2 demo talk track.
- `docs/NEXT_DEMO_AGENTS.zh.md` - next demo agent design.
- `docs/DEPLOYMENT_CHECKLIST.zh.md` - GitHub / Vercel checklist.
- `docs/SILICONFLOW_SETUP.zh.md` - SiliconFlow setup.
- `docs/SCORING.md` - priority and compliance scoring.

Stale review snapshots and old implementation summaries have been removed.

## Phase 0 - Kickoff Lock

- [x] Create `Dyna-Beacon` repo folder.
- [x] Add final `PLAN.en.md` and `PLAN.zh.md`.
- [x] Create `MODULE_CATALOG.md`.
- [x] Create milestone checklist.

## Phase 1 - Foundation Skeleton

- [x] Initialize Next.js App Router + TypeScript files.
- [x] Add Tailwind and Dyna design tokens.
- [x] Build app shell and route structure.
- [x] Define schema types.
- [x] Implement repo interface and local/remote repo skeleton.
- [x] Add `AIOutput` and audit surfaces.

## Phase 2 - Data Seed and Validation

- [x] Implement data generator.
- [x] Implement `validate-data`.
- [x] Generate and validate 595-customer dataset.
- [x] Add richer customer diversity and explicit household relationships.
- [x] Add multi-currency account, holding, and transaction logic.
- [x] Add Cash / Investment / TermDeposit account types.
- [x] Expand product pool and remove active legacy recommendations.
- [x] Add validation for priority, suitability, K&E, funding currency, ownership distribution, and session events.
- [ ] Replace generator-synthesized AUM trend with real transaction-derived values.
- [ ] Add `_source` provenance annotations for future hybrid / real-data demos.

## Phase 3 - Product Surface

- [x] Role login selector with persisted RM role and scoped navigation.
- [x] Latest brand assets integrated into login and app shell.
- [x] Light/dark mode support on login.
- [x] Version upgraded through v1.2 demo.
- [x] Ownership vs visibility split in repo: `ownedBy` for direct work queue, `rmId` / `role` for visibility scope.
- [x] Centralized customer visibility check through `repo.canViewCustomer(...)`.
- [x] Workspace role-scoped customer counts and consolidated status sections.
- [x] Client Book search bound to `q`, grouped filters, concise explanations, sorting, pagination, and direct-book default.
- [x] Client Book search card is full-width; market-context card removed from that page.
- [x] Client Book permission behavior: Junior and Mid-level only see My book; Manager can pivot visibility scopes.
- [x] Client Book row `Call / Draft / Touch` actions open scoped Your Beacon functions.
- [x] Client 360 simplified to four primary tabs: Holdings, Alignment, Activity, and Copilot.
- [x] Client 360 Documents and Communication downgraded into compact Activity evidence sections.
- [x] Client 360 Alignment sections: Portfolio drift, Allocation drift, Liquidity & concentration health, and Compliance dimensions.
- [x] Client 360 Activity splits transactions from lifecycle signals.
- [x] Copilot outputs live in the Copilot tab and are not duplicated on every tab.
- [x] Management area is restricted to Manager role.
- [x] Management dashboard includes coverage, approvals, compliance hygiene, and audit.
- [x] AI-generated content uses consistent AI mark and pink-gold treatment.
- [x] Session audit endpoint validates demo accounts before writing session events.
- [x] Workspace approval queue derives from the full audit stream before display slicing.
- [x] Remote repo contract mirrors local list scope options before future API integration.

## Phase 3 QA / Visual Review

- [x] Claude Design visual direction reviewed as mockup / density guidance, not production-code source.
- [x] Login, Workspace, Client Book, Client 360, Management, and Copilot visual consistency reviewed.
- [x] Tabs and page names settled for current storyline.
- [x] Currency display, account cards, holdings layout, allocation chart, and transaction density reviewed.
- [x] AI entry points settled for current demo: row action, Copilot tab, and floating Your Beacon.
- [ ] Continue visual refinement in the separate UI session.

## Phase 4 - AI Copilot Contract

Frontend calls only:

```text
POST /api/copilot/run
```

Server owns session, role, customer visibility, context assembly, runtime dispatch, fallback, AgentRun, and audit.

### Phase 4a - Endpoint, Dispatch, Context

- [x] `app/api/copilot/run/route.ts` validates JSON, module, customerId, intent, runtime override, role session, and customer visibility.
- [x] `lib/agent-studio/types.ts` defines `CopilotRunRequest`, `CopilotRunResponse`, `CopilotClient`, `CopilotModule`, and `CopilotContext`.
- [x] `lib/copilot/module-map.ts` is the single source for module governance posture.
- [x] `lib/copilot/context.ts` builds minimum necessary customer context.
- [x] `lib/copilot/dispatch.ts` dispatches deterministic / skill-direct / reserved Agent Studio runtimes with fallback.
- [x] Runtime `AgentRun` and `AuditEvent` ring buffers are merged into repo reads.
- [x] `COPILOT_POSTURE` is carried in context and nudges skill-direct wording density only.

### Phase 4b - Current Modules

- [x] `talking_points` - AI-assisted RM prep, internal only, trace retained, approval auto.
- [x] `term_explainer` - product / term / risk explanation, internal only, approval auto.
- [x] `next_best_action` - deterministic service action ranking, no advisory language, approval auto.
- [x] `draft_assist` - Email / WhatsApp / Phone call outputs, client-facing artifacts use review-before-use.

### Phase 4c - Governance Controls

- [x] Vocabulary guard rewrites advisory language and records trace step.
- [x] Approval state machine supports `prepared`, `edited`, `approved`, `rejected`, `sent`, and `discarded`.
- [x] Inline Why is composed server-side from steps.
- [x] Trace panel shows model/provider, skill version, state, approval, cache, vocabulary guard, source refs, and steps.
- [x] Junior cannot approve manager-approval outputs.
- [x] Manager can approve and send client-facing drafts directly.

### Phase 4d - Your Beacon Chatbot

- [x] Floating Your Beacon is available across app shell pages.
- [x] Function toggle: `Ask` and `Prep`.
- [x] Engine toggle: Live LLM and Local mock.
- [x] Channel-specific formats:
  - WhatsApp: Quick check-in, Client Review Pack brief, Tax opportunity brief, Earnings / lifecycle brief.
  - Email: Quick check-in, Appointment confirmation, Client Review Pack PDF, Tax opportunity scan PDF, Earnings / lifecycle analysis, Portfolio change proposal.
  - Phone call: Opener, Maturity reminder, Meeting scheduling, Appointment confirmation.
- [x] Generated content can be copied from the output frame.
- [x] PDF-ready formats can download a simple PDF artifact.
- [x] Prompt and format rules are documented in `docs/COPILOT_PROMPT_CUSTOMIZATION.zh.md` and configured in `data/copilot/rules.json`.

## Phase 4.5 - Next Demo Agents

Current decision: next high-value agents are designed as extensions of the existing Copilot contract. They do not require frontend architecture changes.

- [x] Design note created: `docs/NEXT_DEMO_AGENTS.zh.md`.
- [x] Customer-report and planning-context capabilities merged as **Client Review Pack**.
- [x] Client Review Pack is exposed as a Your Beacon Email / WhatsApp format for v1.2.
- [x] Tax opportunity scan is exposed as a Your Beacon Email / WhatsApp format for v1.2.
- [x] Earnings / lifecycle analysis is exposed as a Your Beacon Email / WhatsApp format for v1.2.
- [x] v1.2 decision: keep these as `draft_assist` formats, not first-class modules.
- [ ] Decide whether these should become first-class modules:
  - `client_review_pack`
  - `tax_opportunity_scan`
  - `earnings_lifecycle_analysis`
- [ ] If promoted to first-class modules, add module-map rows, dedicated output shapes, and tests.
- [ ] External financial skills can be reviewed as prompt references later; do not make them a runtime dependency for v1.2.

## Phase 4.6 - Data Layer

The current `data/asia-wealth/bundle.json` is one preset. Per-client demos need named presets, schema documentation, and lightweight import.

### Phase 4.6a - Schema Documentation

- [x] `docs/schemas/` has one markdown file per core entity.
- [x] Entity docs cover customer-profile, account, holding, product, transaction, lifecycle-event, agent-run, audit-event, rm-user, and market-snapshot.
- [x] `docs/DATA_DICTIONARY.zh.md` links to deeper schema docs.

### Phase 4.6b - Presets Folder Structure

- [ ] Refactor `data/` to:
  ```text
  data/
    presets/
      asia-wealth-singapore/
        bundle.json
        preset.json
        README.md
      <client-x>/
        bundle.json
        preset.json
        README.md
    imports/
      <client-x>-raw/
        customers.csv
        holdings.xlsx
        mapping.json
  ```
- [ ] Add `DYNA_PRESET=asia-wealth-singapore` default.
- [ ] Add `DYNA_DATA_MODE=mock | hybrid | real`.
- [ ] Make `getRepo()` load the configured preset without code changes.

### Phase 4.6c - Importer

- [ ] `scripts/import-real-data.ts` reads CSV/Excel, applies `mapping.json`, logs rejected rows, and writes a valid bundle.
- [ ] Extend `scripts/validate-data.ts` for preset constraints and source mix reporting.

## Phase 5 - Communication and Approval

- [x] Email draft assistant.
- [x] WhatsApp draft assistant.
- [x] Phone call script assistant.
- [x] Review-before-use flow in `<AIOutput>`.
- [x] Junior RM approval requirement for client-facing drafts.
- [x] Mid-level RM routine self-approval through transition API.
- [x] Draft create, edit, approve, reject, send, and discard events write to `AuditEvent`.
- [x] Client Book row actions open scoped Your Beacon functions.
- [x] Client 360 identity actions and Next Best Action execution open scoped Beacon functions.
- [x] Workspace and Management approval queue actions open relevant Client 360 review mode.
- [x] Manager review mode stays fixed at the top of Client 360 while reviewer switches Holdings / Alignment / Activity / Copilot.
- [x] Reject flow returns draft to originating RM workspace.
- [x] Manager can approve and send directly, but cannot create new client-touch drafts for non-owned customers.

Milestone check:

- [x] Junior cannot send client-facing draft without approval.
- [x] Manager can see approval items.
- [x] Manager can return draft for edit.
- [x] Originating RM can revise, resubmit, or delete returned draft.

## Phase 6 - Manager and Governance

- [x] Manager dashboard finalization.
- [x] Team performance overview finalization.
- [x] Approval queue finalization for demo data and runtime draft events.
- [x] Audit event table with event filters.
- [x] Approval trace summary from `AgentRun`.
- [x] Management access remains restricted to Manager role.
- [x] Product decision: do not add a Manager AI Usage / AI Governance card to v1.2.
- [ ] Re-check Manager team performance metrics after next data refresh.

## Phase 7 - Presale Polish and Deployment

- [x] Demo script and talk track updated for v1.2.
- [x] Vercel preview deploy checklist prepared.
- [x] Secret hygiene check documented.
- [x] Local mock + SiliconFlow setup documented.
- [x] Claude + CodeX cross-review process established.
- [x] Run final local validation gate before GitHub push.
- [ ] GitHub repo push.
- [ ] Vercel project link.
- [ ] Vercel env vars configured.
- [ ] Vercel preview works.

## Handoff to CodeX / Claude Code

CodeX is the primary execution lane. It owns repo edits, data generation, API wiring, tests, build checks, and implementation notes.

Claude Code is the independent review lane. It should challenge product logic, story coherence, approval flow, data credibility, and obvious UI/UX risks before demo freeze.

Nora owns product judgment, visual taste, demo story, deployment decisions, and final acceptance.

### Current Review Request for Claude Code

Ask Claude Code to review:

- Whether Your Beacon channel / format matrix is coherent.
- Whether Client Review Pack / Tax opportunity scan / Earnings lifecycle analysis are better as `draft_assist` formats or first-class modules.
- Whether approval flow remains understandable after PDF-ready outputs.
- Whether current docs are sufficient for GitHub + Vercel handoff.
- Whether any current UI copy still sounds advisory or too internal.

### Verification Gate

Before any external demo or preview deploy:

```powershell
npm run validate-data
npx tsc --noEmit
npm test
npm run build
```
