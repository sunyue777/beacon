# Next Demo Agents

目标：下一版 demo 围绕 CRM + 投资系统 + AI governance，展示更高价值的财富管理工作流。

## 1. Client Review Pack

合并原先拆分的客户报告与规划上下文能力。

用途：从 Client Book 或 Client 360 生成客户 review 资料包，既包含客户报告，也包含 planning context，但不替代正式财务规划建议。

输入：

- CustomerProfile：身份、service tier、risk profile、review dates、funding currency。
- Accounts / Holdings：账户、持仓、币种、集中度。
- Transactions：近期资金流、交易摘要。
- LifecycleEvent：review、maturity、portfolio signal。
- Compliance summary：suitability、K&E、currency、liquidity。
- MarketSnapshot：市场语气，只作背景，不作投资结论。

输出：

- Relationship summary。
- Portfolio snapshot。
- Recent activity。
- Lifecycle / review items。
- Planning questions。
- Next service steps。
- 可下载 PDF。

审批：如果作为 client-facing PDF，进入 review-before-use。Junior 需要 Manager approval，Manager / Mid-level 走 RM approval。

为什么最适合作为下一版主力：它能把 CRM、投资账户、持仓、交易、review 事件和 AI trace 汇总成一个完整客户服务 artifact。

## 2. Tax Opportunity Scan

对应原 `tax_loss_harvesting`，但 demo 文案避免直接说成“税务建议”。

用途：在 Alignment / Activity / Client 360 里做 tax-aware opportunity scan，帮助 RM 找出需要进一步核查的持仓或交易。

输入：

- Transactions：成本、买卖、收益历史。
- Holdings：当前持仓和市值。
- CustomerProfile：domicile、currency、service tier。
- Product：类别、风险等级。

输出：

- Opportunity list：哪些 position 值得 RM 或税务专业人士进一步查看。
- Constraints：wash-sale / local tax rule placeholders / suitability warning。
- Client-facing scan PDF：只说明“准备讨论和核查”，不提供税务建议。

审批：内部 scan 是 `auto`；如果发给客户，进入 review-before-use。

## 3. Earnings / Lifecycle Analysis

用途：围绕产品到期、季度 review、年度 review 或持仓相关 earnings event，为 RM 准备解释材料。

输入：

- Holdings / Product。
- LifecycleEvent：maturity、quarterly review、annual review。
- MarketSnapshot / research placeholder。
- Customer risk profile 和 liquidity context。

输出：

- Plain-language update。
- Portfolio relevance。
- Review questions for RM。
- 可下载 PDF 或 email cover note。

审批：内部准备 `auto`；客户可见 PDF / email 进入 review-before-use。

## 4. 暂缓：Investment Proposal

原因：最容易触发 advisory / recommendation 风险。等 Client Review Pack、Tax Opportunity Scan、Earnings / Lifecycle Analysis 稳定后，再设计 proposal pack，并加更严格的 suitability、approval、disclaimer 和 institution policy rules。

## 5. 建议落地顺序

1. `client_review_pack`：最快形成完整 artifact，当前已经先接入 Your Beacon 的 WhatsApp / Email format。
2. `tax_loss_harvesting`：加强 investment-system angle，当前先命名为 Tax opportunity scan。
3. `earnings_analysis`：作为生命周期和持仓事件解释增强。
4. Agent Studio / Anthropic financial skills：最后接入，作为 server-side prompt layer，不改前端。

## 6. v1.2 上线计划

### 6.1 第一优先级：Client Review Pack

先把 Client Review Pack 做深，而不是同时铺开三个新 agent。它最能证明 Beacon 是 CRM + 投资系统上的 AI layer：

- 从客户主档、账户、持仓、交易、lifecycle signal 和 compliance summary 生成一个 review artifact。
- Email / WhatsApp 可发简短 cover note。
- Email 可下载 PDF。
- Junior 生成 client-facing PDF 时进入 Manager review-before-use。
- trace 记录 skill version、sourceRefs、vocabulary guard、approval state。

### 6.2 技术路线

v1.2 仍优先沿用 `draft_assist` format 路线：

```text
module: draft_assist
format: client_review_pack
channel: email | whatsapp
```

这样可以复用现有的：

- `/api/copilot/run`
- context builder
- Live LLM / Local mock engine
- vocabulary guard
- review-before-use
- copy / download PDF UI

等 demo 证明 Client Review Pack 值得单独升级后，再考虑把它提升为 first-class module：`client_review_pack`。

### 6.3 Anthropic financial skills 的使用方式

可以阅读 Anthropic financial skills 的结构和示例，但不要把它作为 v1.2 runtime 依赖。建议吸收三类内容：

- skill markdown 的结构：front matter、inputs、output schema、rules、examples。
- financial review 的章节拆分。
- few-shot examples 的写法。

Beacon 自己的 skill 必须保留：

- 禁用 advise / recommend / decide。
- 使用 prepare / surface / evidence / trace / approve。
- 每个事实要能回到 sourceRefs。
- 客户可见 artifact 要走 review-before-use。

### 6.4 暂缓项

- Anthropic / OpenAI / Bedrock 多 provider 正式接入。
- Agent Studio skill-runner。
- per-module model override。
- citation hover、reproducibility cache。
- Approval first-class entity、assignment workflow、document store、communication store。

## 7. Anthropic financial skills 的取舍

这类 financial skills 可以作为设计参考，但不应成为下一版 demo 的前置依赖。我们先把有用能力拆进 Beacon 自己的 agent 设计：

- Report synthesis -> Client Review Pack。
- Planning checklist -> Client Review Pack 的 planning questions。
- Tax-aware review -> Tax Opportunity Scan。
- Lifecycle / earnings explanation -> Earnings / Lifecycle Analysis。

等 AS 或外部 skill 包稳定后，再把它们接入 `/api/copilot/run` 的服务端 client。前端仍只调用统一接口。
