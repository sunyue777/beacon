# Dyna Beacon Copilot Prompt / Rules 定制说明

这份文档说明：如果要调整 Your Beacon chatbot 的输出语气、渠道格式、审批规则和可下载 PDF 类功能，优先改哪里。

## 1. Nora 最适合直接修改的地方

### `data/copilot/rules.json`

这里是非代码化的 draft 规则入口。当前主要服务 `draft_assist`。

可调内容：

- `channels`：控制每个渠道能显示哪些 format。
- `formats.*.label`：前端下拉菜单显示名。
- `formats.*.artifactKind`：`message` / `script` / `pdf`。
- `formats.*.approval`：`auto` 或 `client_artifact`。
- `formats.*.prompt`：给 Live LLM 的业务意图说明。
- `formats.*.whatsapp.template`：Local mock / fallback 的 WhatsApp 固定模板。
- `forbidden` / `required`：给模型的风格边界。

PDF 类输出会同时生成两层内容：

- 屏幕上的 `draft`：适合 WhatsApp / Email 的短正文或 cover note。
- 下载用的 `artifactText`：真正进入 PDF 的报告正文。

当前渠道设计：

| Channel | 用途 | 当前 format |
| --- | --- | --- |
| WhatsApp | 简短触达、报告发送提醒 | Quick check-in / Client Review Pack brief / Tax opportunity brief / Earnings lifecycle brief |
| Email | 正式内容、报告、确认 | Quick check-in / Appointment confirmation / Client Review Pack PDF / Tax opportunity scan PDF / Earnings lifecycle analysis / Portfolio change proposal |
| Phone call | 通话脚本 | Opener / Maturity reminder / Meeting scheduling / Appointment confirmation |

## 2. 新增功能命名

原先拆分的客户报告与规划上下文能力已合并为：

**Client Review Pack**

原因：它既不是纯报告，也不是正式 financial plan。demo 中更适合作为 RM 准备客户 review 的一份综合资料包，包含 relationship context、portfolio snapshot、lifecycle items、planning questions、next service steps。

PDF 类功能：

- `client_review_pack`：Client Review Pack，客户 review 综合资料包。
- `tax_loss_harvesting`：Tax opportunity scan，只做机会扫描和待核查项，不做税务建议。
- `earnings_analysis`：Earnings / lifecycle analysis，按产品到期、季度或年度 review 生成。

## 3. 后端 prompt 和治理规则

### `lib/copilot/draft-assist.ts`

这里控制：

- 系统 prompt。
- Live LLM 的输入 payload。
- Local fallback 草稿。
- client-facing wording 清洗。
- 哪些 format 进入 approval flow。

当前审批原则：

- Routine check-in / appointment confirmation / phone script：`auto`。
- Client-facing PDF / tax scan / earnings lifecycle PDF / portfolio change proposal：`client_artifact`，需要 review-before-use。

### `lib/copilot/guard.ts`

这里是出口词汇保护。即使模型输出了不合适的话，也会在返回前改写并记录 trace。

原则：

- 不用 `advise / recommend / decide`。
- 不直接告诉客户 “you should”。
- 客户正文避免内部词：talking points、touchpoint、trace、approval checklist、RM workflow。
- RM 内部 trace 可以用 prepared / surfaced / trace / evidence / approval。

## 4. 前端显示

### `components/copilot/copilot-chat-launcher.tsx`

这里控制右下角 Your Beacon：

- Function：Ask / Prep。
- Engine：Live LLM / Local mock。
- Channel：Email / WhatsApp / Phone call。
- Format：按 channel 动态变化。
- PDF 类输出：显示 `Download PDF`。

### `components/ai/ai-output.tsx`

这里控制 AI 输出卡、审批按钮和 trace 面板。

审批语义：

- `Approve & send`：Manager 批准后直接发送。
- `Return for edit`：退回给原 RM 修改。
- `Mark edited & resubmit`：原 RM 修改后重新提交。
- `Delete draft`：原 RM 删除被退回草稿。

## 5. 修改顺序建议

1. 先改 `data/copilot/rules.json`。
2. 用 Local mock 看格式是否正确。
3. 用 Live LLM 看模型是否跟随规则。
4. 如果模型仍跑偏，再改 `lib/copilot/draft-assist.ts` 的系统 prompt。
5. 如果涉及合规边界，再改 `lib/copilot/guard.ts`。

## 6. Anthropic financial skills 如何放进设计

当前项目里没有直接安装 Anthropic financial skills 的本地 skill 包，所以 v1.2 不把它作为运行依赖。设计上先吸收这些能力方向：

- report writing：放进 `Client Review Pack`。
- planning context：放进 `Client Review Pack` 的 planning questions。
- tax-aware scan：放进 `Tax opportunity scan`。
- earnings / lifecycle explanation：放进 `Earnings / lifecycle analysis`。

后续如果拿到正式 skill markdown 或 Agent Studio workflow，只需要把这些 skill 作为 server-side prompt layer 接到 `/api/copilot/run` 后面；前端页面不需要改。
