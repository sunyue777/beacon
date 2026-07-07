# Dyna Beacon v1.2 Demo Script

目标：用一个完整 RM 服务闭环讲清楚 Dyna Beacon 的价值。

主线：

`prioritize -> prepare -> draft -> approve -> send -> govern`

Dyna Beacon 不是 robo-advisor，也不是替代 CRM。它是放在 CRM、投资账户、持仓、交易和合规数据之上的 AI Copilot layer。它帮助 RM 准备、解释、起草和跟进；客户可见内容必须经过人工 review-before-use，并留下 trace 与 audit。

核心句：

> AI prepares. Human approves. Audit captures.

## 1. Login

页面：`/login`

建议先用 `Jensen Parker / Junior` 登录。

讲法：

- 三个 account 代表三类权限：Junior、Mid-level、Manager。
- 同一产品入口，不同角色看到不同 scope。
- AI 不替代机构决策，只做 prepare / surface / trace / approval。

## 2. Client Book

页面：`/customers`

讲法：

- Junior 默认只能看到 `My book`，看不到其他 RM 客户姓名或列表。
- Service signals 是工作队列，不是客户评级。
- Beacon 的价值不是把 595 个客户都变成 alert，而是让 RM 只处理今天真正需要动作的客户。

操作：

1. 选择 `No recent contact` 或 `Review`。
2. 找一个客户，点击 `Draft` 或 `Touch`。
3. 右下角 Your Beacon 打开 `draft_assist + Email / WhatsApp / Phone call`。
4. Jensen 输入一句意图，例如：`Prepare a short review follow-up for this client.`
5. 点击 `Prepare draft`。

强调：客户可见内容才进入 approval flow；talking points、term explainer、next actions 是 RM 内部准备工具，只保留 trace，不需要经理逐条审批。

## 3. Your Beacon

页面：右下角 Beacon chatbot

讲法：

- `Ask` 用于产品、术语、风险和服务流程解释。
- `Prep` 用于生成 Email、WhatsApp、Phone call 输出。
- WhatsApp 偏短触达和报告发送提醒。
- Email 最正式，支持 Client Review Pack、Tax opportunity scan、Earnings / lifecycle analysis 这类 PDF-ready artifact。
- Phone call 生成 opener、到期提醒、会议安排、预约确认脚本。

操作：

1. 切换 channel 和 format。
2. 运行 Live LLM 或 Local mock。
3. 展示输出框右上角 `Copy`。
4. 如果是 PDF 类 format，展示 `Download PDF`。
5. 打开 trace，看 model / provider / sourceRefs / Inline Why / vocabulary guard。

## 4. Adrian / Mid-level Path

页面：退出 Jensen，登录 `Adrian Lim / Mid-level`，进入同一个 `/workspace` 或 `/customers`

讲法：

- Adrian 不进入另一个产品入口；他仍然从同一个 Client Book、Client 360 和右下角 Your Beacon 开始。
- 权限梯度在这里最清楚：Jensen 是较小 assigned book，Adrian 是更大的 affluent assigned book，Sofia 才是 full team view。
- Adrian 的 routine service draft，例如 Quick check-in、Appointment confirmation、Phone opener，是 RM 自己 review 后使用，不进入 Sofia 的 `Draft approval queue`。
- 但只要切到 Client Review Pack、Tax opportunity scan、Earnings / lifecycle analysis 或 Portfolio change proposal 这类 client-facing artifact / PDF-ready format，Adrian 仍然需要 Manager approval。

操作：

1. 在 Adrian 账号下打开任意自己名下客户。
2. 右下角 Your Beacon 选择 `draft_assist + Email + Quick check-in`，点击 `Prepare draft`。
3. 展示 trace 里的 `approvalRequired: auto`，说明 routine draft 不会出现在 Sofia 队列。
4. 同一入口切换 format 到 `Client Review Pack`，再次点击 `Prepare draft`。
5. 展示输出状态为 `manager-approval`，说明 Mid-level 是审批矩阵的中间态：routine 可自处理，正式客户 artifact 仍然升级给 Manager。

强调：

- 同一入口，不同权限梯度。
- Adrian 不是绕过审批；他只是在 routine 服务触达上减少经理队列噪音。
- Sofia 队列应该只接住需要监督的 client-facing artifact，而不是所有 RM 准备材料。

## 5. Management Approval

页面：退出 Adrian，登录 `Sofia Tan / Manager`，进入 `/manager`

讲法：

- Management 是 governance / approval / audit 区域，不是 RM 日常页面。
- 队列只显示真实 live draft，不再显示 seeded shells。
- Manager 可以看待审批客户的完整上下文，但对非自己名下客户只有查看与审批权，没有主动触达权。

操作：

1. 在 `Draft approval queue` 找到 Jensen 或 Adrian 刚生成的 manager-approval draft。
2. 点击 `Read draft` 进入独立 Client 360 review mode。
3. Review panel 固定在页面顶部，下面可切换 Holdings / Alignment / Activity / Copilot。
4. Manager 可 `Approve & send`，或 `Return for edit`。
5. 如果退回，originating RM 的工作台会看到 returned draft，可删除、修改、重新提交。

强调：

- AI 负责加速起草。
- Manager 负责审批客户可见内容。
- Audit 记录每一步。

## 6. Client 360

页面：`/customers/[customerId]`

讲法：

- `Holdings`：账户、持仓、allocation、recent signals。
- `Alignment`：portfolio drift、allocation drift、liquidity / concentration、compliance dimensions。
- `Activity`：transactions 和 lifecycle signals 分开；signal 不是 transaction。
- `Copilot`：AI Suggested Talking Points + Next Best Action。

操作：

- 在 `Copilot` 运行 talking points。
- 查看每个 suggested point 的 reason。
- 点击 Next Best Action；如果动作涉及 Email / WhatsApp / Phone call，则打开 Your Beacon。
- 只有进入 client-facing draft / PDF 时才触发 review-before-use。

## 7. Closing

总结：

- RM 侧：减少手工整理，提高触达速度。
- Manager 侧：客户可见内容可审批、可追踪、可审计。
- IT / 数据侧：当前 Local JSON repo 可替换为 institution API；Live LLM / Local mock / Agent Studio 都不改变前端入口。
