# AuditEvent

用途：运行时审计、审批队列、Workspace/Management pulse。

| Field | Type | Required | Source | Consumers |
|---|---|---:|---|---|
| `eventId` | string | yes | server/generated | audit list |
| `type` | event union | yes | API routes / generator | queue logic |
| `actorId`, `actorRole` | string / RMRole | yes | server session | governance |
| `customerId` | string | no | request/run | customer-scoped audit |
| `runId` | string | no | AgentRun | approval linkage |
| `timestamp` | ISO date | yes | server | sorting |
| `payload` | object | no | route-specific | trace detail |

Key event types:

- `draft.created`: new client-facing draft prepared.
- `draft.approved`: reviewer approved draft.
- `draft.sent`: approved draft was sent.
- `draft.rejected`: reviewer returned draft to originator.
- `draft.edited`: originator revised returned draft; item goes back to approval queue.
- `draft.discarded`: originator deleted a returned draft; item leaves the workflow.
- `ai.output.shown`: output was generated/displayed.
- `role.permission.required`: permission guard blocked access/action.

接入注意：审批队列应以 `runId` 最新事件为准，不能只看历史 `draft.created`，否则 approved/rejected 后还会误显示。
