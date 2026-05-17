# Dyna Beacon — Design Guide (v0.2)

This is a concise design contract. It lives next to the code so any agent
(CodeX, Claude, future contributors) can apply the same product language,
visual system, and interaction rules without re-deriving them.

Update this file when a token, layout rule, AI interaction pattern, or priority
reasoning rule changes.

---

## 1. Brand and naming

- **Company brand:** Dyna.AI  
  Logo asset: `public/images/dyna-logo.png`
- **Platform name:** **Dyna Beacon**  
  Two words, no hyphen in user-facing copy.
- **Repo folder:** `Dyna-Beacon`  
  This is for filesystem purposes only. Do not surface the hyphen in UI copy,
  page titles, or marketing text.
- **Tagline direction:**
  - Hero line: *"Signal what matters."*
  - Sub-line: *"A beacon for every relationship."*

The Beacon idea: a beacon does not decide the ship's destination. It signals
where attention is needed. AI surfaces priorities, prepares context, explains
evidence, and drafts next actions. The institution and the RM still decide and
execute.

Vocabulary to favor in product copy:

- signal
- prioritize
- prepare
- explain
- evidence
- trace
- review
- approve
- act

Vocabulary to avoid as primary product claims:

- advise
- decide
- guarantee
- autonomously recommend
- replace RM

The product should feel like a premium institutional AI workspace, not a
back-office dashboard and not a consumer chatbot.

---

## 2. Design direction: from dense utility to premium lightness

The previous Bloomberg / Linear style emphasized high information density,
thin borders, compact typography, and cold neutral surfaces. That direction was
useful for an internal control system, but it can feel too operational for
front-office relationship managers.

v0.2 shifts the design toward:

- modern institutional lightness
- calm premium surfaces
- lower visual noise
- stronger AI presence
- clearer action hierarchy
- explainable priority logic

The product should still feel serious and governed. Do not make it playful,
over-animated, or visually loud.

### Visual principles

1. **Less border, more surface hierarchy**  
   Avoid relying on 1px borders everywhere. Use subtle background layering,
   soft elevation, and controlled spacing to create hierarchy.

2. **More breathing room**  
   Increase card padding and section spacing. Workspace cards should feel
   deliberate, not compressed.

3. **Premium, not decorative**  
   Use warm neutrals, ceramic whites, champagne/platinum accents, and soft
   shadows. Avoid saturated gradients except for clearly marked AI surfaces.

4. **AI should be visible but not gimmicky**  
   AI-generated summaries, traces, drafts, and explanations need a recognizable
   visual treatment. The user should immediately know where AI has contributed.

---

## 3. Token system

All colors are defined as HSL tuples in `app/globals.css` under `:root` and
`.dark`.

**Never write raw hex in components.** Use Tailwind classes mapped to design
tokens. When a runtime-computed role color is required, use inline HSL token
references such as `hsl(var(--role-junior))`.

### Surface tokens

| Token | v0.2 Direction | Use |
|---|---|---|
| `--background` | warm ceramic white | page background |
| `--foreground` | deep graphite / soft navy | primary text |
| `--card` | elevated warm white | cards, panels, headers |
| `--card-soft` | subtle warm neutral | secondary card areas |
| `--muted` | warm gray / stone tint | quiet fills |
| `--muted-foreground` | medium slate / taupe gray | secondary text |
| `--border` | low-contrast warm gray | dividers, not primary hierarchy |
| `--shadow-soft` | very soft neutral shadow | premium card elevation |

### Brand tokens

| Token | v0.2 Direction | Use |
|---|---|---|
| `--primary` | restrained institutional blue | primary CTA, active nav, key product actions |
| `--primary-foreground` | white | text on primary |
| `--primary-soft` | pale blue tint | selected state, quiet hover state |
| `--accent` | muted platinum / champagne | premium highlights, VIP signals, key milestones |
| `--accent-foreground` | deep graphite | text on accent surfaces |

### AI tokens

| Token | Direction | Use |
|---|---|---|
| `--ai-surface` | very light blue-lilac / pearl tint | AI-generated insight cards |
| `--ai-border` | subtle luminous blue / violet | AI card border or gradient ring |
| `--ai-foreground` | deep navy / graphite | text on AI surface |
| `--ai-glow` | extremely soft AI halo | AI-focused elevated blocks only |
| `--ai-accent-pink` | rose signal, `hsl(342 70% 56%)`, `#DD406F` | north-star mark, AI signal text, generated copy accents |
| `--brand-gold` | light gold, `hsl(39 67% 69%)`, `#E5C07B` | premium highlights, VIP signals, the warm side of AI accents |

Use AI tokens only for AI-generated or AI-assisted content. Do not apply them
to normal cards, static metrics, or non-AI navigation.

The current AI signal gradient is the pink-gold pair:

```css
linear-gradient(135deg, hsl(var(--ai-accent-pink)) 0%, hsl(var(--brand-gold)) 100%)
```

In light mode this resolves to `#DD406F -> #E5C07B`. In dark mode,
`--ai-accent-pink` becomes `hsl(342 74% 68%)` / `#EA7195`, while the gold
anchor remains `#E5C07B`. Use this pair for the small `⟡` north-star marker,
AI-generated labels, and concise AI signal text such as review-due reasons.

### State tokens

| Token | Use |
|---|---|
| `--warning` | drafts pending, approval-required signals |
| `--success` | clean state, completed |
| `--danger` | declines, blocks, overdue risk |
| `--critical` | highest-priority client or compliance risk |

### Role accent tokens

| Token | Role | Use |
|---|---|---|
| `--role-junior` | Junior RM | scoped ownership highlight |
| `--role-mid` | Mid-level RM | scoped ownership highlight |
| `--role-manager` | Manager | governance / team coverage highlight |

Role accent is a highlight, not a theme.

Use role accents for:

- Workspace role badge
- Account picker dot
- Scoped AI output badge ring
- Ownership indicators

Do not use role accents for:

- Page background
- Primary CTA
- Main card surfaces
- Full-page theming

---

## 4. Typography and spacing

### Typography

Default application typography remains a modern sans-serif such as Inter.

Use a more premium typographic treatment only for:

- login hero
- workspace hero title
- major KPI numbers
- client name in Client 360
- AI Daily Brief headline

Acceptable directions:

- refined geometric sans-serif
- modern editorial serif for large display text only
- high-contrast number styling for key figures

Do not use decorative fonts, excessive font mixing, or type styles that reduce
readability.

### Size guidance

| Element | Suggested Size |
|---|---|
| Metadata / labels | 11–12px |
| Body text | 13–15px |
| Card titles | 15–17px |
| Section titles | 20–24px |
| Hero title | 28–36px |
| Large metric numbers | 28–40px |

Avoid the previous default of making most operational text 12–14px. Compact
text is still acceptable inside dense tables, but not for the main workspace
narrative.

### Spacing guidance

| Area | v0.2 Rule |
|---|---|
| Card padding | 24px minimum, 32px for hero / major AI cards |
| Major section spacing | 24–32px |
| Card gap | 16–24px |
| Dense list row padding | 12–16px vertical |
| Right rail cards | slightly tighter than main action cards |

The interface should feel lighter without becoming sparse.

---

## 5. Visual style rules

### Cards

Cards should use one of three surface patterns:

1. **Standard Card**  
   Warm white background, subtle border or no visible border, soft radius,
   light shadow only when needed.

2. **Action Card**  
   Slightly stronger elevation, clear primary action, more spacing, used for
   today’s key work items.

3. **AI Surface**  
   Pearl / blue-lilac tint, subtle luminous border, AI icon or label, trace
   access, generated timestamp.

### Borders

Borders are secondary. Avoid building the whole UI out of equally weighted
rectangles.

Use borders for:

- data tables
- side sheets
- popovers
- selected states
- governance evidence sections

Avoid borders for:

- every card boundary
- every nested layout group
- decorative separation

### Shadows

Use soft shadows to create premium separation.

Rules:

- Main workspace cards may use `shadow-soft`.
- AI cards may use a very light `--ai-glow`.
- Avoid heavy drop shadows.
- Avoid multiple nested shadows.

### Gradients

Gradients are allowed only for:

- login brand surface
- AI Surface border or subtle background sheen
- rare hero accent treatment

Do not use large saturated gradients in the main product UI.

### Motion

Motion should support comprehension.

Allowed:

- 150–220ms hover transitions
- side sheet slide-in
- popover fade / scale
- subtle AI shimmer only while generating

Avoid:

- flashy entrance effects
- looping animations
- bouncing indicators
- decorative motion unrelated to system state

---

## 6. Workspace layout: AI Daily Triage

The Workspace should move from a flat dashboard to an **AI Daily Triage**
experience.

The goal is not to show everything. The goal is to help the RM understand:

1. what requires attention today
2. why it matters
3. what AI has already prepared
4. what needs human review or approval

### Top structure

Replace the previous static 3-metric row with a single **AI Daily Brief**.

The AI Daily Brief should summarize today’s urgent work in natural language,
for example:

> AI has prepared 3 client communication drafts based on today’s market movement.
> 2 involve VIP clients, and 1 compliance review is approaching deadline.

The brief should include:

- generated timestamp
- scope: RM book / manager book / visible client universe
- 2–4 priority bullets
- direct CTA to review the highest-priority item
- Trace access

Do not make the top of Workspace a pure metric dashboard.

### Main structure

Use a two-column layout on desktop.

#### Left main column: Action Flow

Merge the previous “Today’s client queue” and “In-flight work” into one
task-oriented action stream.

Each action card should be centered on a client + task combination, for example:

- Adrian Lim — review AI-prepared draft
- Mei Tan — inspect risk mismatch
- Victor Ong — approve meeting brief
- Farah Rahman — follow up after market movement

Each action card should show:

- client name
- priority tier
- task type
- reason summary
- AI-prepared artifact status
- required human action
- primary CTA

The action stream should prioritize what the user should do next, not merely
list customers.

#### Right rail: Context Monitor

Move lower-priority global context into the right rail.

Right rail may include:

- Market tone
- Audit pulse
- Team coverage for managers
- AI usage summary
- Calendar preview
- Compliance queue status

The right rail supports awareness. It should not compete visually with the
Action Flow.

### Manager-specific behavior

Managers still land on `/workspace`, but their Daily Brief and Action Flow
should include both:

- their directly owned book
- team-level governance signals

Manager-only modules belong in the right rail unless they are urgent enough to
enter the Action Flow.

### Queue expansion

The action stream may show 7 priority items by default with a “Show more”
button.

Rules:

- Default: 7 items
- Expanded: 20 items
- Beyond 20: link to Client Book
- Do not introduce density tabs
- Do not split clients and tasks into separate top-level cards

---

## 7. Client 360 layout: core canvas plus AI side panel

Client 360 should move away from a deep tab-only structure.

The previous 7-tab approach hides important information, especially risk
alignment. v0.2 should expose the most important client state directly on the
page.

### Recommended structure

Use a **core canvas + persistent AI side panel** layout.

#### Core canvas

The central canvas should show:

- client profile summary
- relationship context
- total AUM and segment
- key holdings
- risk profile
- worst current risk state
- liquidity / concentration / suitability alerts
- next best human action

Important risk information should not be buried inside a secondary tab.

#### AI side panel

A persistent right-side panel should contain:

- AI summary of the client situation
- AI-prepared talking points
- draft messages or proposals
- recent AI interactions
- follow-up questions
- Trace access

The side panel should remain contextual to the current client.

### Tabs

Tabs may still exist, but they should be secondary navigation, not the only way
to understand the client.

Suggested tabs:

- Overview
- Holdings
- Risk & Suitability
- Interactions
- Documents
- AI Trace

The Overview must contain the most important risk and action signals.

---

## 8. AI visibility rules

AI should move from hidden evidence to visible assistant.

The user should see AI in three ways:

1. **AI Daily Brief**  
   A natural-language summary at the top of Workspace.

2. **Inline AI components**  
   Contextual AI prompts inside Client 360, Holdings, Risk Alignment, and
   proposal flows.

3. **AI Surface visual treatment**  
   A recognizable card style for AI-generated summaries, drafts, explanations,
   and traces.

### AI Surface requirements

Every AI Surface must include:

- AI label or icon
- generated timestamp
- confidence or mode where relevant
- source / evidence access
- Trace access
- human action CTA when applicable

AI Surface should be visually distinct from normal cards, using the AI tokens
defined above.

### Inline AI input

Client 360 should expose contextual AI entry points such as:

- “Ask Beacon about this portfolio”
- “Explain this risk mismatch”
- “Prepare a client-friendly talking point”
- “Draft follow-up message”
- “Inspect source data”

Inline AI should never replace the page structure. It should augment the
current context.

### Chat placement

Do not place a general chatbot as the primary Workspace surface.

Acceptable locations:

- Client 360 side panel
- contextual popover
- opt-in side sheet
- task-specific AI assistant panel

The product is an AI workspace, not a generic chat app.

---

## 9. Priority tier transparency

Priority tiers must be explainable.

Current tiers:

- Critical
- Active
- Watch
- Steady

These tiers are useful only if the user can understand why a client received
that status.

### Hover behavior

When the user hovers over a priority tier badge, show a lightweight popover.

The popover should include:

- Priority Score
- Tier
- top contributing factors
- short explanation
- “Inspect Factors” or “View AI Trace” action

Example:

```text
Priority Score: 76 · Active

Base Relationship Signal: 38
Risk Mismatch: +11
Market Movement: +6
Engagement Urgency: +21
```

### Click behavior

Clicking “Inspect Factors” opens a side sheet.

The side sheet should explain:

- the business factors behind the score
- source data used
- detected triggers
- AI reasoning summary
- relevant workflow step
- trace ID
- timestamp
- links to source records where available

Example explanation:

```text
This client was classified as Active because the portfolio shows a liquidity
mismatch against the client's stated risk profile. Illiquid holdings exceed the
configured threshold, and recent market movement increased review urgency.
```

### Do not expose demo internals

Never expose implementation artifacts such as:

- `(index % 13)`
- random jitter
- mock scoring shortcuts
- seed values
- demo-only sorting tricks

If a demo-only factor is required internally, either hide it from UI or wrap it
in a business-safe label such as:

- Model Calibration
- Tie-break Adjustment
- Ranking Stabilization

Only show business-meaningful factors to the user.

### Recommended factor labels

Use business labels instead of engineering labels.

| Internal / Raw Concept | UI Label |
|---|---|
| base score | Base Relationship Signal |
| risk mismatch | Risk Mismatch |
| market move | Market Movement |
| stale review | Review Urgency |
| high AUM | Relationship Value |
| pending draft | Pending Human Review |
| manager escalation | Governance Attention |
| jitter / demo randomizer | hide or Model Calibration |

---

## 10. AI Trace and evidence

Every AI-generated block must use the `<AIOutput>` pattern or an equivalent
shared component.

The component must expose:

- AI status: live / demo / simulated
- generated timestamp
- model or workflow mode where appropriate
- run ID
- source records
- workflow steps
- trace side sheet
- human approval state

AI is not allowed to appear as unexplained magic.

### Trace language

Trace should use plain business language first, then technical metadata.

Good:

> Detected liquidity mismatch because illiquid holdings exceed the configured
> suitability threshold for this client profile.

Bad:

> Rule R-17 fired because holding_category_weight > config.max_illiquid_weight.

Technical metadata may be available in expandable detail, but not as the first
thing the RM sees.

---

## 11. Component conventions

### Buttons

Use the existing `<Button>` component with controlled variants.

Allowed variants:

- `default`
- `outline`
- `ghost`
- `secondary`
- `destructive`

Do not introduce new button variants without updating this file.

### Badges

Allowed standard badge variants:

- `default`
- `secondary`
- `outline`
- `warning`
- `success`
- `danger`

Priority badges should use a shared `PriorityTierBadge` component.

Role badges should use the existing runtime token pattern rather than hardcoded
classes.

### Cards

Use the standard card structure unless a component is explicitly defined as an
AI Surface or Action Card.

Default structure:

```tsx
<Card>
  <CardHeader>
    <CardTitle />
  </CardHeader>
  <CardContent />
</Card>
```

Workspace card titles should generally be `text-base` or equivalent.

### Icons

Use `lucide-react`.

Rules:

- Default size: `h-4 w-4`
- Use parent selectors where possible: `[&_svg]:h-4 [&_svg]:w-4`
- Do not mix icon libraries
- Do not use decorative icons where status text is clearer

### Side sheets

Use side sheets for:

- AI Trace
- Priority factor inspection
- source evidence review
- draft review

Do not use modal dialogs for trace-heavy content unless the interaction blocks
the current task.

---

## 12. Role gating and visibility

All authenticated users land on `/workspace`.

The shell is consistent across roles. Content changes based on scope,
ownership, and permissions.

### Role gating

Pages a role cannot fully access should render a Permission Required state.

Rules:

- Show the nav link with a lock icon.
- Do not hide the existence of governance pages.
- Provide a “Switch Account” action where relevant.
- Keep access logic in repo methods, not UI conditionals.

### Visibility vs ownership

These are separate concepts and must not be conflated.

#### Visibility

Visibility means what an account can see.

Examples:

- Junior sees their 77 clients.
- Mid-level RM sees their 296 clients.
- Manager sees all 595 clients.

#### Ownership

Ownership means what is directly on someone’s plate.

Examples:

- Junior owns 77 clients.
- Mid-level RM owns 296 clients.
- Manager owns 222 high-AUM clients directly.

Workspace Action Flow uses ownership.

Client Book and Manager governance use visibility.

All checks should belong in repository methods such as:

- `repo.canViewCustomer(...)`
- `repo.getVisibleCustomers(...)`
- `repo.getOwnedCustomers(...)`

The UI should not re-implement scope filtering.

---

## 13. Scheduling Placement

Scheduling remains provisional unless real content and interactions are
implemented.

Current placement:

- Calendar preview belongs in the right rail.
- Meeting confirmation belongs in Your Beacon as Email / WhatsApp / Phone call
  output before it deserves permanent navigation.

Do not add a permanent third column before the content is substantial enough.

---

## 14. Things explicitly out of scope for v1.1

- Brand mascot or AI character
- Heavy illustrations
- Lottie animations
- Consumer-style chatbot-first interface
- Saturated AI gradients across the whole page
- Per-region theme variants
- Third-party design systems such as Material or Ant Design
- Exposing demo-only scoring internals in the UI
- Replacing RM judgment with AI decisioning language

The design should remain institutional, governed, and premium.

---

## 15. When to update this file

Update this file whenever you:

- change a brand color or token
- change AI Surface styling
- change workspace top-level layout
- change Client 360 layout
- add a new role or scope tier
- add or rename a priority tier
- change scoring factor labels
- introduce a new trace or side-sheet pattern
- introduce a new reusable card type

Do not document one-off page tweaks here. Those belong in the relevant page
file.

---

*Last updated: 2026-05-06*
