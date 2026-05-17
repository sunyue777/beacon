# Dyna Beacon Phase 4 Copilot Contract

本文档说明 Phase 4 的 Copilot 接口、上下文、输出形态和当前实现边界。前端只调用 `POST /api/copilot/run`；服务端负责 session、权限、上下文、runtime、fallback、审计和统一 `AgentRun` 输出。

## 1. 当前状态

- 四个 v1.2 Copilot module 都已接入 `POST /api/copilot/run`，都已有可运行实现。
- `talking_points`：用于 RM 会前 / 电话前准备，内部工具，`approvalRequired: auto`，保留 trace 和 sourceRefs。
- `term_explainer`：用于解释产品、术语、结构和风险语言，内部学习工具，`approvalRequired: auto`。
- `next_best_action`： deterministic service action ranking，不让 LLM 做投资建议或最终动作决策，`approvalRequired: auto`。
- `draft_assist`：用于 Email / WhatsApp / Phone call 和 PDF-ready artifact；只有客户可见、正式或 PDF-ready 输出进入 review-before-use。
- Agent Studio seat 已保留：`lib/agent-studio/client.ts` 未配置时抛 `NotConnectedError`，dispatch 捕获后 fallback。
- open-agent runtime 作为后续开源 agent service 接入位保留；v1.2 demo 主路径不依赖它。
- vocabulary guard、server-side Why、approval state machine、runtime `AgentRun` 和 `AuditEvent` 都已接入。
- `<AIOutput>` trace panel 已显示 model、provider、skillVersion、state、approval、cached、vocabularyAdjusted、sourceRefs、steps 和 server-side Why。

## 2. Copilot Context 是什么

`CopilotContext` 是服务端在权限校验通过后，为某个 Copilot module 组装的最小必要上下文。它不是整个 `bundle.json`，也不会把全量客户数据丢给模型。

位置：

- 类型：`lib/agent-studio/types.ts`
- 生成：`lib/copilot/context.ts`
- 调用：`app/api/copilot/run/route.ts`

### 2.1 为什么需要 context 层

1. 权限边界：先用当前登录 RM 做 `canViewCustomer`，通过后才加载客户详情。
2. 最小输入：只加载当前客户相关的账户、持仓、交易、生命周期事件、产品和市场快照。
3. Trace 统一：把输入转成 `sourceRefs`，方便解释“这句话来自哪里”。
4. 前端隔离：前端不需要知道 Agent Studio、open-agent、本地规则或 mock LLM 的细节。

### 2.2 当前字段

| 字段 | 来源 | 用途 |
|---|---|---|
| `module` | 请求体 | 当前 module，例如 `talking_points` |
| `actor` | session cookie | 当前 RM 的 `rmId`、姓名、角色 |
| `roleAtRun` | `actor.role` | 记录运行时角色 |
| `intent` | 请求体 | 本次意图，例如 prepare pre-call points |
| `runtimeOverride` | 请求体 | demo 运行路径偏好：`skill-direct` / `agent-studio` / `open-agent` |
| `personalization` | 请求体 | RM 输入的客户习惯、本次自定义要求 |
| `uiContext` | 请求体 | 少量 UI 状态，例如当前页面或 tab |
| `customer` | repo | 当前客户主档，授权后才加载 |
| `accounts` | repo | 当前客户账户 |
| `holdings` | repo | 当前客户持仓 |
| `products` | repo | 产品主数据，用于解释持仓 |
| `transactions` | repo | 当前客户最近交易，默认最多 20 条 |
| `lifecycleEvents` | repo | 当前客户服务信号 |
| `marketSnapshot` | repo | 市场快照 |
| `sourceRefs` | context builder | trace 引用，例如 `customer:cust_0001` |
| `requestedAt` | server time | 本次运行时间 |

### 2.3 context 不包含什么

- 不包含其它 RM 看不到的客户名单。
- 不包含整个 `bundle.json`。
- 不包含 Agent Studio token、workflow id、API URL。
- 不允许浏览器直接连接外部 agent。

## 3. 四个 Agent 的输入、逻辑和输出

### 3.1 `talking_points`

用途：为会议或电话前准备客户沟通点。

输入：

- 客户主档：tier、risk profile、review date、last contact。
- 账户、持仓、产品、交易。
- lifecycle signals。
- market snapshot。
- RM personalization。

当前逻辑：

1. 服务端校验 session 和客户可见性。
2. 组装 `CopilotContext`。
3. 规则 builder 提取 priority、review、compliance、holding、signal 信息。
4. `skill-direct` 根据前端 engine 选择 Live LLM 或 Local mock。
5. vocabulary guard 递归检查输出文本。
6. 组合 server-side `why`。
7. 写 runtime `AgentRun` 和 `ai.output.shown` audit event。

输出：

- `headline`
- `why`
- `bullets`
- `evidence`
- `openItems`
- `sourceRefs`
- `steps`
- `state`
- `approvalRequired`

### 3.2 `term_explainer`

用途：解释产品、术语、结构和风险语言。输入包括当前客户风险档、K&E 状态、holding/product/document term 和 UI 当前选中项。输出包含简明解释、风险说明、来源引用和“仅供 RM 理解”的边界说明。它不产生客户发送内容，所以 approval 为 `auto`。

### 3.3 `next_best_action`

用途：surface 下一步服务动作，但不使用 advise / recommend / decide。核心触发保持 deterministic；AI 只整理表达和 why，不负责最终动作决策。若某个动作打开 `draft_assist` 生成客户可见内容，审批发生在 draft 层，而不是 NBA 列表本身。

### 3.4 `draft_assist`

用途：准备 Email / WhatsApp / Phone call 输出，也可以生成 Client Review Pack、Tax opportunity scan、Earnings / lifecycle analysis 这类 PDF-ready artifact。LLM/mock 只写草稿，suitability、eligibility、approval 由服务端治理逻辑兜底。

审批规则按 format 决定：

- Quick check-in、meeting confirmation、phone opener、maturity reminder 等轻量服务触达：`auto`。
- Portfolio change proposal、Client Review Pack PDF、Tax opportunity scan PDF、Earnings / lifecycle analysis 等客户可见正式 artifact：进入 review-before-use。
- Junior 生成的正式 artifact 需要 Manager approval；Manager approve 后直接进入 `sent`；reject 会回到 originating RM 的 returned-draft notice。

## 4. Output 类型区别

### 4.1 Deterministic output

来源：本地代码规则。适合权限、币种计算、review overdue、risk expiry、approval state machine。优点是稳定、可复现、trace 清晰。

### 4.2 Mock skill-direct output

来源：本地 mock LLM + 规则 builder。适合离线 demo、回归测试、API/UI/trace/audit 验证。前端选择 `Local mock` 时强制使用。

### 4.3 Real skill-direct output

来源：服务端直接调用 Claude / OpenAI / Bedrock / Ollama 等模型。prompt、guard、rules 在 Beacon 代码库控制，模型 provider 后续由 `BEACON_LLM` 切换。

### 4.4 Agent Studio output

来源：服务端调用 Dyna Agent Studio workflow。workflow、agent prompt、工具编排在 AS 中配置；前端仍只调用 `/api/copilot/run`。AS 未配置时 fallback 到本地 `skill-direct`。

### 4.5 Open-agent output

来源：其它开源 agent 服务。它和 `skill-direct + BEACON_LLM=openai` 不一样：`skill-direct` 是 Beacon 直接调用模型；`open-agent` 是 Beacon 调用一个外部 agent service，那个 service 可能有自己的工具、memory、planner 或 workflow。

## 5. Approval State Machine

当前 runtime `AgentRun` 支持：

```text
prepared -> edited
prepared -> approved
prepared -> rejected
edited   -> approved
edited   -> rejected
approved -> sent
```

规则：

- `sent` 必须先 `approved`。
- `sent` 后不可再编辑。
- Junior 产生的输出默认 `manager-approval`。
- 非 Manager 不能 approve `manager-approval` 输出。
- 每次 transition 都写 audit event：`draft.edited`、`draft.approved`、`draft.rejected`、`draft.discarded`、`draft.sent`。

接口：

```text
POST /api/copilot/runs/[runId]/transition
```

请求：

```json
{
  "transition": "approved",
  "note": "Reviewed for demo"
}
```

## 6. 当前测试入口

页面：

```text
/customers/[customerId]?tab=ai
```

位置：`Copilot` -> `AI Suggested Talking Points` -> `Engine`。

测试方式：

1. 选择 engine：Live LLM 或 Local mock。
2. 输入 customer habits 和 RM custom input。
3. 选择一个 talking point，点击 `Prepare talking points`。
4. 查看 selected / actual runtime、provider、fallback、guard、sourceRefs、trace steps。

说明：v1.2 demo 保留 engine 控件是为了展示 Live LLM / Local mock 的切换。正式产品里 RM 不应看到 provider/runtime 细节；这些选择应由服务端环境变量、机构策略或 Agent Studio workflow 决定。

## 7. 连接 Agent Studio 需要的信息

要把 `talking_points` 从本地 mock 切到 AS，请在本地 `.env.local` 放入：

```text
AGENT_STUDIO_BASE_URL=
AGENT_STUDIO_API_KEY=
AGENT_STUDIO_WF_TALKING_POINTS=
```

请不要把 API key 写进代码或聊天记录里。可以在聊天里给：

- base URL 的格式。
- agent/workflow id。
- AS endpoint 路径是否是 `/agents/{workflowId}/runs`。
- 一个脱敏 request/response 示例。

当前 `AgentStudioClient` 默认请求：

```text
POST ${AGENT_STUDIO_BASE_URL}/agents/${AGENT_STUDIO_WF_TALKING_POINTS}/runs
Authorization: Bearer ${AGENT_STUDIO_API_KEY}
```

请求体包含：

- `workflowId`
- `module`
- `intent`
- `input.actor`
- `input.customer`
- `input.personalization`
- `input.sourceRefs`
- limited holdings / transactions / lifecycleEvents

响应映射规则：

- 优先读取 `output`
- 其次读取 `result`
- 再其次读取 `text`
- 如果 AS 返回 `steps` / `sourceRefs` / `model` / `llmProvider`，会映射进 `AgentRun`
- 如果 AS 未配置或请求失败，dispatch 会 fallback 到本地 `skill-direct`
