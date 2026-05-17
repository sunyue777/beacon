# Scoring & Risk Compliance — Dyna Beacon v0.1

This document explains the rules behind two visible product behaviors:

1. **Priority tier** (Critical / Active / Watch / Steady) shown on Client Book
   rows, the workspace queue, and Customer 360.
2. **Risk Alignment** signals (Suitability / K&E / Concentration / Currency /
   Liquidity / Mismatch) shown on Customer 360 → Risk Alignment tab and
   summarized on Management → Compliance hygiene.

All thresholds and weights are **demo defaults**. The repo and helpers are
designed so an institution can rewire them per preset without touching UI.

---

## 1. Priority tier

### 1.1 Why tiers, not numbers

Field RMs don't think in opaque scores. They think in **today's bucket**:
"who must I touch today, who can wait." Numeric scores get challenged ("why
is X 76 but Y 75?") and erode trust. Tiers give the same prioritization
without exposing the formula in the row.

The numeric `priorityScore` (0–98) is **kept in data** so that:
- Sort order in Client Book / Workspace queue is deterministic.
- Operations and ML teams can audit / tune the formula offline.
- Every row links into Customer 360 where the Priority metric shows both
  tier (large) and score (hint), pointing here for the formula.

### 1.2 Tier mapping

Implemented in `lib/domain/client-signals.ts → getPriorityTier`.

| Score range | Tier | Color tone | RM intent |
|---|---|---|---|
| 85 – 98 | **Critical** | danger | Today; service driver flagged |
| 70 – 84 | **Active** | warning | This week; preparation needed |
| 55 – 69 | **Watch** | primary (blue) | Monitor; no immediate task |
| 0 – 54 | **Steady** | muted | No action; routine cadence |

Tone tokens (`--danger`, `--warning`, `--primary`, `--muted`) are used so
dark/light themes and per-institution palettes recolor consistently.

### 1.3 Score formula (demo default)

Implemented in `scripts/generate-data.ts → buildCustomer`.

```
priorityScore = clamp(0, 98,
    38                                  // base
  + tagsCount × 11                      // each priority tag adds weight
  + recentHighEventBoost                // 12 if Lifecycle / HighValue tag, 6 if MarketMove
  + reviewOverdueBoost                  // 8 if nextReviewDate is past
  + (index % 13)                        // bounded jitter for demo variety
)
```

Each contributor is independently customizable. Real institutions typically
plug in their own scoring model (book-specific weights, ML-driven, or rule
table), exposed through `ModuleConfig` so demo mode and live mode can swap.

### 1.4 Tags currently scored

Source: `CustomerProfile.tags` populated from `buildTags()`.

| Tag | Trigger in demo data | Typical RM action |
|---|---|---|
| `ReviewDue` | every 5th index | Schedule review |
| `Lifecycle` | every 7th + High importance event | Empathy outreach |
| `RiskMismatch` | every 11th | Suitability/holdings review |
| `DormantCash` | every 13th | Yield options |
| `Maturity` | every 17th | Reinvestment plan |
| `MarketMove` | every 19th | Market context call |
| `HighValue` | serviceTier = VIP or Private | Proactive touch |

---

## 2. Risk Alignment dimensions

Implemented in `lib/domain/risk-compliance.ts`. Five orthogonal checks, each
returning state `Pass | Watch | Block | NotChecked`. The **headline** of the
Risk Alignment tab is the *worst* state across all five.

### 2.1 Suitability questionnaire

| State | Rule |
|---|---|
| Pass  | `daysToExpiry > 30` |
| Watch | `0 ≤ daysToExpiry ≤ 30` (renew within 30 days) |
| Block | `daysToExpiry < 0` (expired — block new advisory) |

Asia regulators typically require an annual refresh. Block state should hard-
gate any new advisory action; the UI shows it as `Action required`.

### 2.2 Knowledge & experience (K&E)

Read from `CustomerProfile.knowledgeAssessmentStatus`. Used for complex
products (structured notes, alts).

| Customer status | Compliance state |
|---|---|
| `Valid` | Pass |
| `Expiring` | Watch |
| `Pending` | Watch |
| `Expired` | Block |

### 2.3 Concentration

Computed from `Holding[]` + `Product[]`.

- **Single position limit**: any position > **25%** of total holdings value.
- **Single category limit**: any product category > **40%** of total.
- **Pass** if both within limits.
- **Watch** if exactly one limit exceeded.
- **Block** if both limits exceeded.

UI surfaces the top position and top category names + percentages.

### 2.4 Currency exposure

| Computation | |
|---|---|
| Funding currency | `CustomerProfile.fundingCurrency` (USD/SGD/HKD/JPY) |
| Off-funding % | sum of holdings whose `currency ≠ fundingCurrency` |

- **Pass** when off-funding < 70%.
- **Watch** when off-funding ≥ 70% (FX exposure too large vs funding base).

Block-level check is intentionally absent — currency mismatch is rarely a
hard block; institutions handle via hedging policy. Switch to Block in your
preset if local rules require.

### 2.5 Liquidity bucket

Illiquid categories defined as: `Structured`, `Insurance`, `Alternative`.

| Illiquid % of AUM | State |
|---|---|
| ≤ 35% | Pass |
| 36–50% | Watch (over guideline) |
| > 50% | Block (hard limit) |

### 2.6 Risk-mismatch holdings (legacy)

Existing `Holding.riskStatus === "mismatch"` flag from data generation. Kept
as its own card for backward compatibility with Phase 2 demo data; new UI
should prefer the five aggregated dimensions above.

---

## 3. Engagement & contact freshness

Implemented in `lib/domain/client-signals.ts`.

### 3.1 Last contact tone

| Days since last contact | Tone | Visual |
|---|---|---|
| ≤ 21 days | `success` | green text |
| 22–60 days | `muted` | grey text |
| 61–119 days | `warning` | amber text |
| ≥ 120 days **or** never | `danger` | red text |

### 3.2 Review status

`getReviewStatus(nextReviewDate)` returns one of:

| Kind | Days until review | Visual |
|---|---|---|
| `overdue` | < 0 | red — "Review overdue Nd" |
| `due-soon` | 0 to 14 | amber — "Review in Nd" |
| `on-track` | 15 to 60 | grey — "Review in Nd" |
| `future` | > 60 | grey — "Review in Nd" |

---

## 4. Productivity metrics (Management → Coverage)

Implemented in `lib/domain/governance.ts`.

| Metric | Definition |
|---|---|
| Touches / week | (count of customers in book contacted in last 30 days) ÷ 4.3 |
| Contacted in 90d | count of customers contacted in last 90 days, as % of book |
| AI runs | distinct `AgentRun` records attributed to that RM |
| Approvals (open) | drafts created/edited by that RM still pending |

Production should derive Touches from explicit audit events (`client.opened`,
`draft.sent`, `chat.message.sent`) rather than `lastContactedAt` — that field
is a snapshot, not an event log.

---

## 5. Compliance hygiene (Management)

Implemented in `lib/domain/governance.ts → getComplianceHygiene`.

| Tile | Definition |
|---|---|
| Drafts rejected rate | `draft.rejected count / total draft.* count`, rounded |
| Suitability expiring 30d | customers with `suitabilityExpiresAt` within 30 days |
| Reviews overdue | customers with `nextReviewDate` past today |

Warning tone applied when the hygiene number crosses a notable threshold
(rejected ≥ 20%, expiring > 30 customers, overdue > 50 customers).

---

## 6. Approval queue (workspace + management)

`getApprovalQueueForAccount(events, account)` is **role-aware**:

| Role | What "Pending approvals" counts |
|---|---|
| Junior / Mid-level | Drafts they themselves created that are still awaiting review |
| Manager | Drafts created by **anyone else** in the team that need supervisor approval |

This is reverse-engineered from the `AuditEvent` log. The approval state
machine is parked as a Phase 4 backlog item — the current implementation is
correct for demo but production should store approvals as first-class
entities (with owner, SLA timer, escalation rules).

---

## 7. Customizing per institution

When wiring a real institution preset:

1. **Tier thresholds** — edit `getPriorityTier` mapping. Some banks split
   Critical further (e.g. Critical-Today / Critical-Week).
2. **Score formula** — replace `buildCustomer` priority calculation, or
   ingest from an upstream service. Keep the field in `CustomerProfile`.
3. **Risk thresholds** — every `25% / 40% / 35% / 50% / 70%` constant in
   `risk-compliance.ts` is a knob; expose via `ModuleConfig`.
4. **Funding currency list** — add/remove currencies in `CustomerProfile`
   union; the helper is currency-agnostic.
5. **Compliance rules** — add new helpers (e.g. `getKycRefreshStatus`) and
   include them in `getRiskComplianceSummary`. The UI reads `summary.worst`
   for the headline state, so adding dimensions doesn't break the layout.

---

*Last updated: 2026-05-06*
