# Dyna Beacon 数据字典

日期：2026-05-17  
当前数据集：`asia-wealth` synthetic preset  
主数据包：`data/asia-wealth/bundle.json`

## 1. 数据定位

Dyna Beacon 当前使用 **synthetic-but-real-shape** 数据：内容是模拟生成的，不含真实客户 PII；结构、关联关系、权限、币种、账户、持仓、交易、审计和 AI trace 按财富管理 demo 的真实形态设计。

数据由 `scripts/generate-data.ts` 生成，由 `scripts/validate-data.ts` 校验。运行时通过：

```text
lib/repo/local-json-repo.ts -> data/asia-wealth/bundle.json
```

Runtime `AgentRun` 与 `AuditEvent` 存在内存 ring buffer：

```text
lib/repo/runtime-events.ts
```

这适合本地 demo。部署到 Vercel 后，如果审批队列需要跨冷启动保留，应接一个轻量持久化层。

## 2. 当前规模

| Entity | Count | 说明 |
|---|---:|---|
| `rms` | 3 | Jensen Parker / Adrian Lim / Sofia Tan |
| `customers` | 595 | 客户主档 |
| `accounts` | 1,427 | Cash / Investment / TermDeposit |
| `products` | 140 | Fund 与 EquityBasket 各 30，其它类别至少 10 |
| `holdings` | 3,018 | 持仓明细，关联 account + product |
| `transactions` | 4,257 | 交易流水 |
| `marketSnapshots` | 30 | 市场快照 |
| `researchArticles` | 12 | 模拟研究文章 |
| `lifecycleEvents` | 1,785 | Review / Maturity / LifeEvent / Market / Portfolio 信号 |
| `policyRules` | 3 | demo 规则 |
| `ruleCheckResults` | 1,785 | 规则检查结果 |
| `agentRuns` | 595 | 预生成 talking points trace |
| `auditEvents` | 1,509 | 审计事件 |
| `moduleConfigs` | 10 | 模块配置 |

关键分布：

| Metric | Value |
|---|---:|
| Junior owned customers | 77 |
| Mid-level owned customers | 296 |
| Manager directly owned customers | 222 |
| Manager visible customers | 595 |
| Zero-AUM customers | 38 |
| Dormant signal customers | 44 |
| No recent contact customers | 100 |
| Multi-currency customers | 80 |
| Hero customers with 30+ holdings | 10 |
| Deep-dive customers with about 100 transactions | 10 |
| Total synthetic AUM | 596,026,268 |

## 3. 文件与入口

| 路径 | 用途 |
|---|---|
| `data/asia-wealth/bundle.json` | 当前完整 demo bundle |
| `scripts/generate-data.ts` | 生成 synthetic 数据 |
| `scripts/validate-data.ts` | 校验引用、分布、权限、币种、持仓、交易、session event |
| `lib/repo/types.ts` | TypeScript schema |
| `lib/repo/repo.ts` | Repo interface |
| `lib/repo/local-json-repo.ts` | 本地 JSON repo |
| `lib/repo/remote-api-repo.ts` | 未来 remote API stub |
| `lib/repo/runtime-events.ts` | runtime AgentRun / AuditEvent ring buffer |
| `lib/domain/client-signals.ts` | priority、review、contact freshness |
| `lib/domain/risk-compliance.ts` | suitability / K&E / concentration / currency / liquidity / mismatch |
| `lib/domain/governance.ts` | approval queue、returned drafts、coverage、productivity、hygiene |

## 4. 实体关系

```text
RMUser
  owns / can see -> CustomerProfile

CustomerProfile
  has many -> Account
  has many -> Holding
              belongs to -> Account
              references -> Product
  has many -> Transaction
              belongs to -> Account
              optionally references -> Product
  has many -> LifecycleEvent
  has many -> RuleCheckResult
  has many -> AgentRun
  has many -> AuditEvent

MarketSnapshot / ResearchArticle
  global market context, not customer-owned

ModuleConfig
  global module settings
```

## 5. 权限与可见性

- `customer.rmId` = 直接 owner RM。
- `listCustomers({ ownedBy })` = RM 自己桌上的客户。
- `listCustomers({ rmId, role })` = 这个角色能看见的客户。
- `repo.canViewCustomer(customerId, { rmId, role })` = 页面与 API 的统一查看权限检查。
- Manager 可见全团队 595 个客户，但 client-touch draft 权限只属于 owner RM。Manager 对非本人客户可以查看与审批已提交 draft，不应直接代表 owner RM 发起客户触达。

## 6. Signal、Transaction、Audit 的区别

| 类型 | 含义 | 例子 | UI |
|---|---|---|---|
| `Transaction` | 账户/产品资金活动 | BUY、SELL、DEPOSIT、DIVIDEND | Client 360 Activity 的 transaction 区 |
| `LifecycleEvent` | 服务/关系/组合信号 | Review due、Maturity、Portfolio drift | Activity 的 signal 区、Workspace queue |
| `AgentRun` | AI 或规则输出及 trace | draft_assist、talking_points | AIOutput、Copilot tab |
| `AuditEvent` | 谁在什么时候做了什么 | draft.created、draft.rejected、draft.sent | approval queue、audit pulse |

审批队列必须以 `runId` 最新 `AuditEvent` 为准：`draft.created` / `draft.edited` 进入待审；`draft.approved` / `draft.sent` 清出；`draft.rejected` 返回 originator 修改。
如果 originator 删除退回草稿，会写入 `draft.discarded`，该 run 从待审和退回队列中清出。

## 7. Schema 文档

更细的数据映射已经拆到 `docs/schemas/`：

| Entity | 文档 |
|---|---|
| RM / role / visibility | `docs/schemas/rm-user.md` |
| Customer master | `docs/schemas/customer-profile.md` |
| Account | `docs/schemas/account.md` |
| Product master | `docs/schemas/product.md` |
| Holding / position | `docs/schemas/holding.md` |
| Transaction | `docs/schemas/transaction.md` |
| Lifecycle / service signal | `docs/schemas/lifecycle-event.md` |
| AgentRun / AI trace | `docs/schemas/agent-run.md` |
| AuditEvent / workflow log | `docs/schemas/audit-event.md` |
| MarketSnapshot | `docs/schemas/market-snapshot.md` |

这些文档面向客户 IT / 数据团队，说明字段、真实系统映射、mock fallback、UI 与 Copilot 消费场景。

## 8. 当前 validation gates

`scripts/validate-data.ts` 当前校验：

- customer/account/holding/transaction/product/run/audit/config 引用完整。
- 595 客户数量。
- Junior 77 / Mid-level 296 / Manager 222 ownership。
- AUM 与现金 + 持仓大致一致。
- 持仓组合多样性。
- deep-dive transaction 客户数量。
- dormant / no recent contact 数量。
- priority tier、suitability、K&E、funding currency 分布。
- 姓名唯一性、姓氏多样性、家庭关系。
- 多币种账户与币种覆盖。

## 9. 下一步数据路线

短期：

- 保持 `/api/copilot/run` 先做 session 与 `canViewCustomer`，授权通过后再加载 accounts / holdings / transactions / lifecycle events。
- 继续把 `CopilotContext` 控制在最小必要上下文，不把整个 bundle 发给模型。
- `draft_assist` 的 approval flow 以 runtime `AgentRun` + `AuditEvent` 为准。

中期：

- 把 `data/asia-wealth/bundle.json` 迁移为 `data/presets/asia-wealth-singapore/bundle.json`。
- 新增 `preset.json` 记录监管口径、币种、服务层级、demo story notes。
- 增加 `_source.kind = real | synthetic | hybrid`，支持客户给少量真实字段、其余 synthetic 补齐。
