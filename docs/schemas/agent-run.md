# AgentRun

用途：统一 AI / rule output trace。前端所有 Copilot 输出都应通过 `AgentRun` 展示 evidence、state、model/provider、approval。

| Field group | Key fields | Required | Source | Consumers |
|---|---|---:|---|---|
| Identity | `runId`, `moduleId`, `channel` | yes | `/api/copilot/run` or transition seed | AIOutput, queues |
| Runtime | `requestedRuntime`, `backend`, `model`, `llmProvider`, `skillVersion` | yes for Copilot | dispatch / LLM client | trace panel |
| Approval | `state`, `approvalRequired` | yes for drafts | module-map + transition API | Review-before-use |
| Actor | `personaId`, `rmId`, `roleAtRun` | yes | server session | audit, Manager |
| Scope | `customerId`, `sourceRefs`, `redactionLevel` | yes | CopilotContext | trace/evidence |
| Reasoning | `steps`, `why`, `inputDigest` | yes | builders / guards | Inline Why, trace |
| Output | `output` | yes | module result | UI content |
| Runtime flags | `fallbackMode`, `vocabularyAdjusted`, `cached`, `latencyMs` | yes | dispatcher / guard | trace |
| Timing | `startedAt`, `finishedAt` | yes | server | trace |

接入注意：

- v1.2 只对 `draft_assist` 使用审批状态机；talking_points、term_explainer、next_best_action 是内部准备工具，approval 为 `auto`。
- Manager 对非本人客户可以审批已提交 draft，但不能用 draft_assist 新建触达草稿。
- `state` 流程：prepared -> approved -> sent，或 prepared -> rejected -> edited -> approved -> sent。若 originator 删除退回草稿，则进入 discarded 终态。
