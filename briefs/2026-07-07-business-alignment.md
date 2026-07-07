# Beacon Business Alignment 执行 Brief

- Date: 2026-07-07
- Owner: Nora
- Executor: codex
- 范围：业务逻辑与故事的对齐修正。不含 UI 打磨（见 `2026-07-07-presales-polish.md`）和基础加固（见 `2026-06-12-hardening-and-i18n.md`）。
- 与 polish brief 的交互：本 brief 的 Task 1 会改变 polish brief Task G（Adrian 路径）的预期行为，先做本 brief Task 1，再按新矩阵验收 Task G。

## 保护清单（这些是对的，不要"顺手优化"）

- `lib/domain/risk-compliance.ts`：五维合规检查（suitability 到期 / 集中度 25%/40% 阈值 / 币种敞口 / 流动性 / K&E）是真实业务逻辑，只按本 brief 扩展用途，不改判定。
- `lib/domain/governance.ts`：审批队列从 audit event 流推导（event-sourced）、coverage/touches 指标，保留。
- `lib/copilot/approval.ts` 的状态机骨架（prepared→edited/approved/rejected/sent/discarded、send-requires-approved、退回必须原 RM 编辑），只按 Task 1/2 增加检查，不推翻。
- 服务端权限收敛（`canViewCustomer`、draft 限 owning RM、越权写 audit）。
- AgentRun trace 结构（steps、inputDigest、sourceRefs、skillVersion）。
- `docs/SCORING.md` 的 tier 哲学（对 RM 展示 tier 不展示分数）——本 brief 要让 UI 服从它，不是改文档迁就 UI。

---

## Task 1（P0）：把三角色审批矩阵从文案变成代码

### 问题（实证）

`MODULE_CATALOG.md` 承诺："Junior needs approval; Mid-level approves routine; Manager reviews"。login 页 Jensen 写着 "Client-facing drafts require review"、Adrian 写着 "Routine self-approval"。

但 `lib/copilot/draft-assist.ts:566` 的实际矩阵是：

```
routine 格式（concise_touch / meeting_confirm / phone scripts）→ 所有角色 "auto"（包括 Junior，零审批直接可发）
artifact 格式（review pack / tax scan / earnings / formal_note）→ Junior 和 Mid 同为 "manager-approval"，Manager 为 "rm-approval"
```

即：Junior 的常规客户可见邮件不经任何审批就能发（与 login 文案矛盾）；Junior 和 Mid-level 在代码里待遇完全相同（第三个角色只存在于登录卡片上）。三角色权限梯度是核心卖点，现在是两级。

### 方案

1. 新建 `lib/copilot/approval-matrix.ts`，把矩阵做成单一配置源（角色 × 格式类别 → approvalRequired），按 MODULE_CATALOG 实现：

```
                 routine(message)        client_artifact(pdf/proposal)
Junior           manager-approval        manager-approval
MidLevel         self-approval*          manager-approval
Manager          self-approval*          rm-approval（见 Task 2 四眼规则）
```

   *self-approval 不等于 auto：仍生成 approval 记录，状态流转为 RM 本人显式点击 "Approve & send"，audit 记 `draft.approved (self)`。真正的 `auto` 只保留给非客户可见输出。
2. `approvalForDraft` 改为查矩阵；login 页三张卡的 permissions 文案、`MODULE_CATALOG.md`、`docs/DEMO_SCRIPT.zh.md` 与最终矩阵三方对齐（以矩阵为准改文案）。
3. Manager 审批队列逻辑（`governance.ts getApprovalQueueForAccount`）适配：Jensen 的 routine draft 现在会进 Sofia 队列；Adrian 的 routine 不进（self-approval 留在自己工作台）。
4. 演示叙事收益写进 demo script：同一个 "Prepare draft" 动作，三个账号三种去向——这是"审批粒度由机构配置"的直接证明。

### 验收

- Jensen 生成 routine email → 出现在 Sofia 队列，Jensen 自己无法 approve。
- Adrian 生成 routine email → 自己工作台可 Approve & send，audit 有 self-approval 记录，不进 Sofia 队列。
- Adrian 生成 review pack → 进 Sofia 队列。
- 三处文案（login/catalog/script）与行为一致。

---

## Task 2（P0）：maker-checker（四眼原则）

### 问题（实证）

`approval.ts` 的 `approved` 分支没有"审批人 ≠ 起草人"检查：Manager 可以审批**自己**起草的客户可见 artifact（rm-approval + Manager 角色即通过）。银行合规的第一直觉就是问这个。

### 方案

1. `canTransitionAgentRun`：`manager-approval` 类目标上加 `actor.rmId !== run.rmId` 检查，违反返回 "originator cannot approve own draft"。
2. Manager 自己的 artifact（rm-approval 类）：demo 只有一个 Manager，无法真做 peer review——采取"显式豁免"方案：允许 self-approve，但必须走一个带确认文案的独立按钮（"Approve own draft — four-eyes waived in demo"），audit event payload 记 `fourEyes: "waived-demo"`，trace 里可见。宁可诚实展示局限，不可假装没有这条规则。
3. UI：审批按钮对不满足条件的人禁用并给原因 tooltip。

### 验收

- Jensen/Adrian 无法 approve 自己的 manager-approval draft（API 403 + 按钮禁用）；Sofia approve 自己的 artifact 时走豁免路径且 audit 可查。

---

## Task 3（P0）：合规状态从"展示"变成"门禁"

### 问题（实证）

`risk-compliance.ts` 会算出 suitability "Block — block new advisory until refreshed"，但 `draft-assist` 和 NBA 只把 `compliance.worst` 当**文案**用（why 句、open item "Inspect compliance dimensions before sending"）——过期 suitability 的客户照样生成、审批、发送客户可见 draft，什么都不拦。系统自己说 Block，工作流不 Block。对一个以治理为卖点的 demo，这是最大的空心点。

### 方案

1. `app/api/copilot/run/route.ts` dispatch 前（或 draft-assist 内部统一处）计算 compliance summary：
   - `worst === "Block"`：draft 仍可生成（RM 需要准备材料），但强制 `approvalRequired = manager-approval`（无论格式与角色）、draft 顶部注入合规 banner 块（"Suitability expired — client-facing use blocked until refreshed"）、trace 加 step `Compliance gate: suitability expired → escalated to manager approval`、audit event `compliance.gate.triggered`。
   - `worst === "Watch"`：open item 升级为醒目 warning + trace step，不改审批级别。
2. NBA：`Block` 时第一条 action 固定为 "Refresh suitability questionnaire"（channel: review），并引用具体过期日期；不再是泛泛的 "Inspect approval path"。
3. Manager 审批视图里，被 gate 的 draft 显示 gate 原因，Approve 按钮旁给 "requires suitability refresh" 提示（可以 approve，但审批人看得到自己在批什么）。
4. Demo script 加一幕：故意选一个 suitability 过期的客户起草 → 现场看 gate 触发。**把客户必问的"AI 出错/违规怎么办"变成主动演示的环节。**

### 验收

- 找一个 `suitabilityExpiresAt` 已过期的客户：任何角色起草 routine 消息 → 强制进 manager 队列，draft 带 banner，trace 有 gate step；suitability 有效客户行为不变。

---

## Task 4（P0）：NBA 去同质化——动作必须引用具体持仓

### 问题（实证）

`next-best-action.ts` 四个动作里两个是无条件样板（"Prepare client touch"、"Prepare short opener" 对每个客户都出现），且所有动作从不引用具体持仓/产品/金额；evidence 是元语句（"Priority score 81 mapped to Active"、数量统计）。连点三个客户就会发现 NBA 长得一样——旗舰模块经不起连点。

### 方案

1. 动作生成改为 signal 驱动、引用具体记录：
   - Maturity tag → "Prepare reinvestment options discussion — {产品名} matures {日期}, {金额}"（从 holdings/products 找真实到期持仓）。
   - DormantCash → "Prepare yield options review — {金额} idle cash across {n} accounts"。
   - RiskMismatch → "Prepare de-risk conversation — {产品名} ({风险等级}) vs {客户风险画像}"（用 `riskStatus === "mismatch"` 的真实持仓）。
   - MarketMove → 结合 market snapshot 引用受影响类别。
2. 两条样板动作降级为 fallback：只在没有任何 signal 命中时出现。
3. `evidence` 数组改为记录级引用（`holding:xxx` / `event:xxx` 的可读句 + ref id），与 polish brief Task I 的 evidence 点击跳转对接。
4. 措辞纪律不变：全部 "prepare / surface" 语态，动作是"准备一场对话"，不是"建议买卖"。

### 验收

- 随机点 5 个不同 tag 的客户，NBA 首条动作各不相同且都点名具体持仓/金额/日期；无 signal 客户才出现通用动作。

---

## Task 5（P1）：证据层去 meta 化

1. `talking-points.ts` evidence 里的 "Runtime selected: skill-direct; current execution uses local mock" → 删除（runtime 信息只属于 trace steps，不是业务证据）。
2. 所有模块的 evidence 从"计数句"（"Loaded 12 holdings…"）改为"记录句"（引用具体 event 标题、持仓名、交易），计数留在 trace 的 context step 里。
3. `why.ts composeInlineWhy` 从拼计数改为拼驱动因素：优先取 top event 标题、review 状态、mismatch 持仓名。
4. `padToFour` 取消凑数：LLM 返回 2 条就渲染 2 条，不用样板句填充。

---

## Task 6（P1）：分数治理一致性——UI 服从 SCORING.md

SCORING.md 明确写了"RM 不看数字看 tier，数字暴露在行上会被挑战并侵蚀信任"，但 Client Book 行和 Client 360 头部都在显示 "score 81"。

1. Client Book 行、Client 360 头部：只显示 tier 徽章；数字移到 trace / hover tooltip（"formula: docs/SCORING.md"）。
2. `generate-data.ts` 的 `index % 13` jitter：保留可以（demo 需要排序多样性），但 SCORING.md 里已注明——确认 UI 任何地方都不再引导用户去解读具体数值。
3. `getPriorityReason` 用 `tags[0]` 单标签 → 改为取权重最高的两个 tag 合成 reason（避免同 tag 客户 reason 完全一致，配合 polish brief Task D 的文案变体）。

---

## Task 7（P1）：激活 policyRules——"机构自有规则"从装饰变真实

bundle 里只有 3 条 policyRules 且 `name` 为空；NBA/draft 路径根本不读它们，而 MODULE_CATALOG 宣称 NBA 是 "rule-triggered actions with institution-owned controls"。

1. 给 3 条规则真实定义（`rule_suitability_01`：suitability 过期 gate（对接 Task 3）；`rule_draft_approval_01`：审批矩阵引用（对接 Task 1）；`rule_disclaimer_01`：客户可见 draft 尾部强制 disclaimer 文案）。
2. draft/NBA 运行时真实 evaluate 这三条，产出 `RuleCheckResult` 进 trace，UI trace 面板显示 "Checked against: rule_suitability_01 ✓ / rule_draft_approval_01 ✓ / rule_disclaimer_01 applied"。
3. 卖点句从此成立："这三条规则是数据，不是代码——机构可以自己加。" disclaimer 规则顺便解决客户可见 draft 目前没有免责声明的问题。

---

## Task 8（P2）：发送的最后一公里

approve 之后 "sent" 只是状态翻转，看不到发了什么去了哪。加一个模拟出口：sent 时生成 outbox 记录（channel、时间戳、"delivered via institution gateway (simulated)"），在 Client 360 Activity tab 显示为一条 communication 记录，audit 链接 runId。闭环从状态芯片变成可见事实。

## Task 9（P2）：voice 模块处置

`app/api/voice`、`components/voice/voice-mvp-panel.tsx`、bundle 里 12 条 transcripts——UI 无入口，是死代码 + "能演示一下吗"风险。本阶段从主干剥离（feature branch 保留），bundle 去掉 transcripts，MODULE_CATALOG 不再提及。等 voice 成为正式卖点时再回来。

---

## 执行顺序建议

Task 1 → 2 → 3 是一组（都动审批链，一起测）；Task 4 → 5 是一组（都动输出内容）；6、7 独立；8、9 最后。全部完成后用三个账号各走一遍 golden path + suitability 过期客户特例，对照 `MODULE_CATALOG.md` 逐行验收。
