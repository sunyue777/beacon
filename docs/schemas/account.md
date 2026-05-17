# Account

用途：客户账户结构、币种、现金/投资/定期存款拆分，支撑 Holdings 与 Copilot context。

| Field | Type | Required | Mock source | Real-world mapping | Consumers |
|---|---|---:|---|---|---|
| `accountId` | string | yes | generated | core banking account ID | holdings, transactions |
| `customerId` | string | yes | generated FK | CRM/customer master | repo joins |
| `type` | Cash / Investment / TermDeposit / Retirement / Structured / Insurance | yes | generator account mix | core banking / PMS account type | Client 360 Holdings |
| `currency` | string | yes | funding + investment currency mix | account currency | currency checks, display |
| `cashBalance` | number | yes | generated | core banking balance | liquidity, dormant cash |
| `marketValue` | number | yes | holdings aggregate | PMS valuation | account cards |
| `status` | Active / Dormant / Closed | yes | generated | account status | dormant signal |
| `openedAt` | date | yes | generated | account opening date | activity context |

接入注意：

- 每个客户应至少有 Cash account；Investment account 可以按币种多账户。
- TermDeposit 是独立 account type，不应塞进 investment holding。
- 显示币种必须跟 account / holding currency 一致，不能用统一 `$`。
