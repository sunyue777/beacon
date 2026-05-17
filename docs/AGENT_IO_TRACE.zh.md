# Dyna Beacon Agent 输入、逻辑与 Trace 说明

最后更新：2026-05-15

本文档是 Phase 4 Agent contract 的操作说明。后续新增、删除或调整任何 AI / deterministic agent，都必须同步更新本文档。

当前统一入口：

```text
POST /api/copilot/run
```

前端只传模块名、客户 id、意图和少量 UI 上下文。服务端负责 session、权限、上下文组装、runtime 调度、fallback、审计和统一 `AgentRun` trace。

## 1. 通用请求输入

类型位置：

```text
lib/agent-studio/types.ts
```

请求结构：

```ts
interface CopilotRunRequest {
  module: "talking_points" | "draft_assist" | "term_explainer" | "next_best_action";
  customerId?: string;
  intent?: string;
  runtimeOverride?: "deterministic" | "skill-direct" | "agent-studio" | "open-agent";
  modelRoute?: "mock" | "siliconflow";
  personalization?: {
    customerHabits: string[];
    rmCustomInput: string;
  };
  uiContext?: Record<string, unknown>;
}
```

### 字段说明

| 字段 | 来源 | 用途 |
|---|---|---|
| `module` | 前端 | 决定调用哪个 agent。 |
| `customerId` | 前端页面 | 客户页通常传入；通用 chatbot 可以不传。 |
| `intent` | 前端输入 / 按钮 | 用户这次想做什么，例如解释术语、准备草稿、准备电话前 talking points。 |
| `runtimeOverride` | demo 控件 / 内部调用 | 选择 runtime。日常 UI 不应向 RM 暴露太多 runtime。 |
| `modelRoute` | demo 控件 | `mock` 强制本地 mock；不传则使用服务端 `BEACON_LLM`，即前端显示的 `Live LLM`。 |
| `personalization.customerHabits` | RM 输入 | 客户沟通偏好、习惯、注意事项。 |
| `personalization.rmCustomInput` | RM 输入 | 本次运行的临时要求。 |
| `uiContext` | 前端页面 | 当前 surface、选中 talking point、draft channel 等少量 UI 状态。 |

## 2. 通用服务端上下文

生成位置：

```text
lib/copilot/context.ts
```

`CopilotContext` 是服务端在权限校验后组装的最小必要上下文，不是整包数据。

| 字段 | 来源 | 说明 |
|---|---|---|
| `actor` | session cookie | 当前登录 RM：`rmId`、姓名、角色。 |
| `roleAtRun` | `actor.role` | 写入 `AgentRun`，用于审计。 |
| `customer` | repo | 只有通过 `canViewCustomer` 后才加载。 |
| `accounts` | repo | 当前客户账户。 |
| `holdings` | repo | 当前客户持仓。 |
| `products` | repo | 产品池；客户页用于解释持仓，通用页用于产品池解释。 |
| `transactions` | repo | 当前客户最近交易，默认最多 20 条。 |
| `lifecycleEvents` | repo | 当前客户生命周期 / 服务信号。 |
| `marketSnapshot` | repo | 最新市场快照。 |
| `sourceRefs` | context builder | 可追溯引用，例如 `customer:cust_0005`、`holding:...`。 |
| `requestedAt` | server time | 运行时间。 |

权限原则：

- 前端不能直接传完整客户数据。
- 服务端先读 session，再做 `repo.canViewCustomer(...)`。
- 权限失败时不加载客户 accounts / holdings / transactions。
- Agent Studio token、SiliconFlow key、workflow id 只存在服务端环境变量。

## 3. 统一输出与 Trace

所有 agent 返回统一结构：

```ts
{
  ok: true,
  runId: string,
  output: AgentRun
}
```

`AgentRun` 核心字段：

| 字段 | 说明 |
|---|---|
| `runId` | 本次 agent 运行 id。 |
| `channel` | 输出渠道，如 `talking_points`、`email`、`whatsapp`、`term_explainer`、`nba`。 |
| `moduleId` | 对应 `module`。 |
| `requestedRuntime` | 用户/调用方要求的 runtime。 |
| `backend` | 实际执行 backend，如 `skill-direct`、`deterministic`。 |
| `model` | 实际模型名或规则名。 |
| `llmProvider` | `siliconflow`、`mock`、`deterministic`、`local-fallback` 等。 |
| `skillVersion` | 当前模块版本。 |
| `state` | `prepared` / `edited` / `approved` / `rejected` / `sent`。 |
| `approvalRequired` | `auto` / `rm-approval` / `manager-approval`。 |
| `why` | 服务端根据 `steps[]` 组合的一句话原因，不由模型生成。 |
| `vocabularyAdjusted` | vocabulary guard 是否改写了输出。 |
| `cached` | 是否命中缓存。当前为 false。 |
| `sourceRefs` | 输入证据引用。 |
| `steps` | 关键 trace 步骤。 |
| `output` | agent 的业务输出。 |
| `fallbackMode` | 是否从外部 runtime fallback。 |
| `latencyMs` | 运行耗时。 |

Trace 展示位置：

```text
components/ai/ai-output.tsx
```

页面上点击 `Trace` 后可看：

- Mode / Run ID / Module / Channel
- Selected runtime / Actual backend
- Model / Provider / Skill version
- State / Approval / Cached
- Vocabulary guard
- Redaction / Latency
- Inline Why
- Source References
- Workflow Steps，每一步有 `name`、`source`、`output`

## 4. Agent: `talking_points`

代码位置：

```text
lib/copilot/talking-points.ts
components/copilot/talking-points-surface.tsx
```

用途：为会议或电话前准备 4 条客户沟通点。

### 输入变量

| 输入 | 用途 |
|---|---|
| `customerId` | 必填；必须是当前 RM 可见客户。 |
| `intent` | 当前选中的 talking point 内容。 |
| `modelRoute` | `mock` 时走本地 mock；不传时走 Live LLM。 |
| `personalization.customerHabits` | 影响 channel、tone、关注重点。 |
| `personalization.rmCustomInput` | 第 4 条 RM 自定义 talking point。 |
| `uiContext.selectedTalkingPoint` | 前端选中的 4 个 talking point 之一。 |
| `customer` | risk profile、service tier、priority score、review date、last contact、funding currency 等。 |
| `holdings` / `products` | 找最大持仓、产品类别、风险等级。 |
| `transactions` | 最近交易 trace。 |
| `lifecycleEvents` | 最近 lifecycle/service signal。 |
| `marketSnapshot` | 市场背景。 |

### 大致逻辑

1. 服务端校验 session 和客户可见性。
2. 组装当前客户 context。
3. 本地规则先生成一个 `ruleScaffold`，包含 priority、review、compliance、holding、signal。
4. Live LLM 根据 `ruleScaffold`、RM 输入和选中 talking point 生成 JSON。
5. 如果 LLM 失败或 JSON 解析失败，fallback 到 `ruleScaffold`。
6. vocabulary guard 递归检查输出中的禁用表达。
7. 生成 `AgentRun`，状态为 `prepared`。
8. 写入 runtime `AgentRun` 和 `ai.output.shown` audit event。

### 输出结构

```ts
{
  headline: string;
  why: string;
  bullets: string[];     // 固定 4 条
  evidence: string[];
  openItems: string[];
}
```

### Trace 重点

`steps[]` 通常包含：

- `Build Copilot context`
- `Apply talking-points rules`
- `Skill-direct completion`
- `Vocabulary guard`，仅在发生改写时出现

重点看：

- `llmProvider`: `siliconflow` / `mock` / `local-fallback`
- `parseState`: `json` / `fallback-to-rules`
- `vocabularyAdjusted`
- `sourceRefs`

## 5. Agent: `draft_assist`

代码位置：

```text
lib/copilot/draft-assist.ts
components/copilot/copilot-chat-launcher.tsx
```

用途：准备 Email / WhatsApp / Phone call 输出，并支持 Client Review Pack、Tax opportunity scan、Earnings / lifecycle analysis 这类 PDF-ready artifact。只生成草稿，不发送。

### 输入变量

| 输入 | 用途 |
|---|---|
| `customerId` | 必填；客户页 chatbot 自动从 URL 识别。 |
| `intent` | RM 对草稿的要求。 |
| `modelRoute` | `mock` 时本地 mock；不传时 Live LLM。 |
| `personalization.rmCustomInput` | 草稿语气、用途、重点。 |
| `uiContext.channel` | `email` / `whatsapp` / `call_script`。 |
| `customer` | 姓名、风险档案、服务等级、review date、K&E、funding currency。 |
| `holdings` / `products` | 草稿中的持仓证据。 |
| `transactions` | 最近交易证据。 |
| `lifecycleEvents` | 服务触发信号。 |

### 大致逻辑

1. 校验客户可见性。
2. 根据 `uiContext.channel` 决定草稿形态。
3. 本地规则生成草稿 scaffold。
4. Live LLM 或 mock 生成结构化草稿 JSON。
5. vocabulary guard 改写 advisory / recommendation 类表达。
6. 输出 `prepared` 状态，`approvalRequired` 根据角色决定：
   - Junior: `manager-approval`
   - Mid / Manager: `rm-approval`
7. 当前不执行发送动作。

### 输出结构

```ts
{
  headline: string;
  why: string;
  channel: "email" | "whatsapp" | "call_script";
  subject?: string;
  draft: string;
  approvalChecklist: string[];
  evidence: string[];
  openItems: string[];
}
```

### Trace 重点

`steps[]` 通常包含：

- `Build Copilot context`
- `Apply draft-assist rules`
- `Skill-direct completion`
- `Vocabulary guard`，仅在发生改写时出现

重点看：

- `channel`
- `approvalRequired`
- `state: prepared`
- `Skill-direct completion.output.parseState`
- `Vocabulary guard.output.replacements`

## 6. Agent: `term_explainer`

代码位置：

```text
lib/copilot/term-explainer.ts
components/copilot/copilot-chat-launcher.tsx
```

用途：解释产品、术语、结构、费用和风险语言。用于 RM comprehension，不是客户建议。

### 输入变量

| 输入 | 用途 |
|---|---|
| `customerId` | 可选；客户页会自动带客户上下文，通用页可不带。 |
| `intent` | 要解释的术语或问题。 |
| `modelRoute` | `mock` 时本地 mock；不传时 Live LLM。 |
| `personalization.rmCustomInput` | RM 的具体问题。 |
| `customer` | 客户风险档案、service tier、K&E、funding currency。 |
| `products` | 产品池，用于解释术语和产品结构。 |
| `holdings` | 客户页下用于连接到实际持仓。 |

### 大致逻辑

1. 可在通用 scope 或客户 scope 运行。
2. 提取 `intent` 中的 term。
3. 如果有客户 context，补充客户风险档案、K&E、持仓和 compliance state。
4. Live LLM 或 mock 输出结构化解释。
5. vocabulary guard 检查语言边界。
6. 输出 `approvalRequired: auto`，因为它是 RM 理解用途，不是客户发送草稿。

### 输出结构

```ts
{
  headline: string;
  term: string;
  plainLanguage: string;
  riskNotes: string[];
  customerContext: string[];
  evidence: string[];
  openItems: string[];
}
```

### Trace 重点

`steps[]` 通常包含：

- `Build Copilot context`
- `Apply term-explainer rules`
- `Skill-direct completion`
- `Vocabulary guard`，仅在发生改写时出现

重点看：

- `customerScoped`
- `products`
- `holdings`
- `term`
- `approvalRequired: auto`

## 7. Agent: `next_best_action`

代码位置：

```text
lib/copilot/next-best-action.ts
components/copilot/next-actions-panel.tsx
```

用途：给出下一步服务动作排序。当前是 deterministic，不调用 LLM。

重要边界：

- 不使用 advise / recommend / decide。
- 不替机构或 RM 做最终决定。
- 只 surface service actions 和 traceable reasons。

### 输入变量

| 输入 | 用途 |
|---|---|
| `customerId` | 必填；当前客户。 |
| `intent` | 可选；目前主要用于 trace。 |
| `customer` | priority score、review date、last contact。 |
| `holdings` / `products` | compliance / concentration / risk checks。 |
| `lifecycleEvents` | 后续可增强排序。 |
| `roleAtRun` | 决定 approval requirement。 |

### 大致逻辑

1. 校验客户可见性。
2. 读取 review status。
3. 读取 compliance summary。
4. 按规则生成动作：
   - review overdue / due soon -> `prepare-review-call`
   - compliance 非 Pass -> `inspect-approval-path`
   - 默认补充 `prepare-client-touch`
   - 默认补充 `prepare-short-opener`
5. 输出最多 4 个 action。
6. 生成 deterministic `AgentRun`。

### 输出结构

```ts
{
  headline: string;
  why: string;
  actions: Array<{
    id: string;
    label: string;
    reason: string;
    channel: "call" | "email" | "whatsapp" | "approval" | "review";
    requiredApproval: "none" | "rm-approval" | "manager-approval";
  }>;
  evidence: string[];
  openItems: string[];
}
```

### Trace 重点

`steps[]` 通常包含：

- `Build Copilot context`
- `Rank deterministic service actions`

重点看：

- `backend: deterministic`
- `llmProvider: deterministic`
- `model: beacon-rules-v1`
- `actions`
- `priorityTier`

## 8. 新增 Agent 时必须同步更新

新增或改动 agent 时，必须同步更新：

1. `lib/agent-studio/types.ts`
   - `CopilotModule`
   - 如有新 runtime/model route，也要更新对应 union。
2. `lib/copilot/module-map.ts`
   - module label、description、surfaces、runtime、provenance、reasoning、bounding、approval、reproducibility。
3. `lib/copilot/dispatch.ts`
   - module 到 client 的调度。
4. 对应 agent client 文件
   - 输入 parser。
   - rule scaffold。
   - LLM / deterministic 调用。
   - vocabulary guard。
   - `AgentRun` mapping。
5. UI surface
   - 只调用 `/api/copilot/run`。
   - 使用 `<AIOutput>` 展示 trace。
6. 本文档
   - 输入变量。
   - 大致逻辑。
   - 输出结构。
   - Trace 方式。
7. 测试
   - 至少覆盖 vocabulary guard、fallback、权限失败或 deterministic ranking 中的一类。

原则：任何 AI 输出都必须可追溯、可解释、可审批，不让浏览器直接连外部 LLM 或 Agent Studio。
---

## 附录：`draft_assist` 输出格式如何定制

`draft_assist` 的格式控制分两层：

1. 前端临时控制：`components/copilot/copilot-chat-launcher.tsx`
   - `Channel`: `email` / `whatsapp` / `call_script`
   - `Format`: `concise_touch` / `meeting_confirm` / `formal_note` / `client_review_pack` / `tax_loss_harvesting` / `earnings_analysis` / `phone_opener` / `maturity_reminder` / `meeting_scheduling`
   - RM 输入框会进入 `personalization.rmCustomInput`，适合临时说明语气、长度、场景。

2. 服务端稳定规则：`lib/copilot/draft-assist.ts`
   - `buildDraftOutput(...)` 定义本地 fallback scaffold。
   - `getDraftFormatRules(...)` 会把 channel-specific 规则传给 Live LLM。
   - `normalizeDraftOutput(...)` 会做出站整理，尤其是 WhatsApp：无 subject、无 email closing、最多 4 行。

当前 WhatsApp 规则：

```ts
{
  maxLines: 4,
  style: "natural WhatsApp touchpoint",
  forbidden: ["subject line", "email closing", "long paragraphs"],
  required: ["client-first greeting", "one evidence-led reason", "soft timing question"]
}
```

后续如要给机构定制固定模板，优先改 `data/copilot/rules.json` 里的 `draft_assist.formats.*.whatsapp.template`。如果需要更复杂的条件逻辑，再改 `lib/copilot/draft-assist.ts` 的 `buildWhatsAppDraft(...)` 和 `getDraftFormatRules(...)`。如果只是 demo 中临时调整，直接在 chatbot 输入框写要求即可。
