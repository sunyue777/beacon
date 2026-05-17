# LifecycleEvent

用途：服务信号，不是交易流水。用于 Activity tab、Workspace queue、talking points、NBA。

| Field | Type | Required | Mock source | Real-world mapping | Consumers |
|---|---|---:|---|---|---|
| `eventId` | string | yes | generated | CRM task/event ID | Activity |
| `customerId` | string | yes | generated FK | customer master | repo joins |
| `date` | date | yes | generated | event date | timeline |
| `type` | Review / Maturity / LifeEvent / Market / Portfolio | yes | generated | CRM/service signal taxonomy | filters, Copilot |
| `title` | string | yes | generated | event title | Activity, Copilot |
| `description` | string | yes | generated | event description | talking points |
| `importance` | Low / Medium / High | yes | generated | signal severity | sorting |

接入注意：Activity tab 需要把 Transactions 和 Lifecycle signals 明确分开显示；lifecycle 是服务/关系/组合信号，不是资金交易。
