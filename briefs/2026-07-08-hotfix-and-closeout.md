# Beacon 2.0 Hotfix & Closeout 执行 Brief

- Date: 2026-07-08
- Owner: Nora
- Executor: codex
- 优先级：Task 0 是安全红线，最先做、单独 commit、当天推送。其余按序。
- Vercel 环境变量由 Nora 手工配置（另有操作指引），不属于本 brief 的代码任务，但 Task 4 要把变量清单固化进部署文档。

## 工作方式要求（新增一条常设规则，以后所有 brief 适用）

1. **遇到生产或运行时报错：先报告根因和候选修法，等 Nora 决定。禁止通过删除校验、放宽安全逻辑、吞掉异常来让错误消失。** 允许的例外只有一种：为"非关键路径"加 try/catch 降级（如审计写入失败不阻塞登录），且必须在 commit message 里说明。
2. 每个 Task 单独分支/commit，本地 `npx tsc --noEmit`、`npm test`、`npm run check-data`、`npm run build`、`npx tsx scripts/check-architecture.ts` 全过再推。
3. 不提交任何密钥。

---

## Task 0（红线）：恢复 SESSION_SECRET 生产保护

### 背景

`d0a2abc` 为了修"生产登录报错"，删除了 `lib/auth/session-cookie.ts` 中生产环境缺失 `SESSION_SECRET` 即抛错的保护，替换为写死在仓库里的常量密钥 `"beacon-demo-session-fallback"`。这使签名 cookie 在未配置环境变量的部署上退化为可伪造（密钥公开）。真正的修复是在 Vercel 配置环境变量（Nora 负责，已另行安排）。

### 改动

1. `getSessionSecret()` 恢复：`process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === "production"` 且未配置 `SESSION_SECRET` 时 `throw new Error("SESSION_SECRET is required to sign Beacon RM sessions.")`。
2. 非生产环境保留现有 fallback 与一次性 console.warn（globalThis 标记的去重保留）。
3. **保留** `d0a2abc` 中正确的部分：`/api/session` 里 audit 写入的 try/catch、login 页版本章 "beacon 2.0"。
4. `tests/auth/session-cookie.test.ts`：加回归测试——模拟 production + VERCEL_ENV=production 且无 SESSION_SECRET 时，`createSessionCookieValue` 抛错；配置了 SESSION_SECRET 时正常签名。若 d0a2abc 添加的测试断言了 fallback 在生产可用，改写该测试以匹配恢复后的行为。
5. 单独 commit：`fix: require SESSION_SECRET in production (restores intended guard)`，message 中注明回滚 d0a2abc 的哪一部分、保留哪一部分。

### 验收

- 本地 dev 无变量：行为不变（fallback + 单次 warn）。
- 测试覆盖生产抛错路径。
- 推送后等 Nora 配好 Vercel 变量再触发生产部署（顺序很重要：先配变量，再部署这个 commit，否则线上登录会 500——这是预期行为，但别让它发生在客户面前）。

---

## Task 1：提交工作区中的设计批次

工作区有一批已验证但未提交的改动（Claude 完成，tsc/36 tests/architecture check 已过）：

- `app/workspace/page.tsx`：Service pulse v2（趋势条 + Fraunces 数字 + 44px coverage 环 + 角色色底纹 + 发丝分隔线）；审批队列描述单复数修复。
- `components/ui/trend-bars.tsx`（新文件）：6 周触达趋势条。
- `components/ui/coverage-ring.tsx`：环内百分号 tspan。
- `lib/domain/governance.ts`：`getWeeklyTouchSeries`（按 lastContactedAt 周分桶）。
- `components/brand/beacon-mark.tsx`：`mono` 变体镂空改透明，修复 FAB 光暗不一致。

原样提交，不要"顺手优化"。commit：`feat: service pulse v2, trend bars, brand mark cutout fix`。提交前重跑全套验证。

---

## Task 2：分支与 tag 卫生

现状：远端 `main` 与 `feat/live-llm-ux` 都在 `d0a2abc`；本地 `main` 停在 initial commit；tag `beacon-2.0` 打在含安全弱化的 `d0a2abc` 上。

1. 本地 `main` 拉取到最新。
2. Task 0 + Task 1 合入后（走既有分支流程），推送 `main`。
3. 在修复后的 commit 上打 `beacon-2.0.1`，推送 tag。保留 `beacon-2.0` 不动（历史事实），但在 `docs/DEPLOYMENT_CHECKLIST.zh.md` 注明：生产部署必须 ≥ `beacon-2.0.1`。

---

## Task 3：四个功能收尾

### 3a. NBA 动作引用具体持仓（business-alignment Task 4 的未完成部分）

- Maturity 客户：首条动作 "Prepare reinvestment options — {产品名} matures {日期} ({金额})"，数据从该客户 holdings/products 里找真实到期持仓。
- DormantCash：引用真实闲置现金额与账户数。
- RiskMismatch：点名 `riskStatus === "mismatch"` 的持仓名与风险等级差。
- 通用样板动作（Prepare client touch / short opener）降级为无 signal 命中时的 fallback。
- evidence 数组同步引用具体记录（`holding:xxx` 可读句），与 evidence pack 的 sourceRefs 对齐。
- 验收：随机点 Maturity / DormantCash / RiskMismatch / 无 tag 四类客户，首条动作互不相同且引用真实数据。

### 3b. 审批卡片显示合规门禁原因

- Manager 队列卡片与 Read draft 审阅面板：当 run.steps 含 `Compliance gate` 时，显示红色标签（如 "Suitability expired — escalated"），文案取 gate step 的 reason。
- 验收：给 suitability 过期客户起草 → Sofia 队列卡片上可见红标；正常客户无标。

### 3c. 接通剩余两条 policyRules

- `rule_draft_approval_01`：draft 运行 trace 中加一条 rule check step，引用审批矩阵结果（"Checked against rule_draft_approval_01 → manager-approval"）。
- `rule_disclaimer_01`：客户可见 draft（email/artifact 正文末尾）追加标准免责一行（文案入 `data/copilot/rules.json`，非硬编码），trace 记 "rule_disclaimer_01 applied"。WhatsApp 短消息豁免（格式约束里已禁长文，规则里注明豁免原因）。
- 验收：生成一封 email draft，正文末尾有免责行，trace 里三条规则全部可见；evidence pack 导出的治理段引用规则名。

### 3d. 固定生命周期示范样本

- Jensen workspace 的 "Draft history" 区改为**固定显示 Violet Carter 示范样本**（seed 数据标记 `exemplar: true` 或按 runId 白名单），新产生的 runtime draft 显示在其下方的 "Latest activity" 小节（有则显示，无则不占位）。
- 验收：现场生成任意新 draft，示范样本仍在原位完整可开。

---

## Task 4：部署文档固化

`docs/DEPLOYMENT_CHECKLIST.zh.md` 增加"环境变量清单"一节（表格）：

| 变量 | 作用 | 环境 | 生成方式 |
|---|---|---|---|
| `SESSION_SECRET` | 会话签名密钥，生产必需 | Production + Preview | `openssl rand -base64 32` |
| `BEACON_ACCESS_CODE` | 访问门口令，按客户 engagement 轮换 | Production | 人工设定，演示周期结束即改 |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | runtime store 持久化（审批队列跨实例） | Production | Vercel Storage → Upstash 集成自动注入（KV_* 变量名代码同样兼容） |
| `BEACON_DAILY_LLM_CAP` | Live LLM 日调用上限 | Production | 默认 200，可省略 |
| `BEACON_DEFAULT_ENGINE` | 共享环境默认引擎 | Production | `mock` |

并注明：环境变量修改后必须 Redeploy 才生效；每次生产部署后按验收清单走一遍（无痕窗口 → access code → 登录 → Jensen 起草 → 10 分钟后换浏览器 Sofia 查队列 → approve → export evidence 打开检查）。
