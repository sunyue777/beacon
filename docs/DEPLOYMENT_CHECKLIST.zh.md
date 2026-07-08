# Dyna Beacon 部署与密钥检查清单

## 1. 本地 rehearsal

macOS Terminal / zsh：

```bash
cd /Users/nora/Workspace/01_Hive/Beacon
npm install
npm run check-data
npx tsc --noEmit
npm test
npm run build
npm run dev
```

打开：

```text
http://localhost:3000
```

如果 3000 被占用，Next 会自动切到 3001。

每个演示周期前先刷新一次数据并部署：

```bash
npm run refresh-data
```

`check-data` / `refresh-data` 会同时跑 synthetic 数据生成、数据校验和 Product core / Demo shell 架构边界检查。

如需固定彩排日期：

```bash
npm run generate-data -- --now=2026-07-07
npm run validate-data
```

生产部署版本要求：

- `dyna-beacon.vercel.app` 必须部署 `beacon-2.0.1` 或更新版本。
- `beacon-2.0` 保留为历史 release tag；不要用它作为生产回滚目标，因为该 tag 对应版本曾短暂放宽生产 `SESSION_SECRET` 保护。

## 2. 环境变量清单

| 变量 | 作用 | 环境 | 生成方式 |
|---|---|---|---|
| `SESSION_SECRET` | 会话签名密钥，生产必需 | Production + Preview | `openssl rand -base64 32` |
| `BEACON_ACCESS_CODE` | 访问门口令，按客户 engagement 轮换 | Production | 人工设定，演示周期结束即改 |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | runtime store 持久化，确保审批队列跨实例可见 | Production | Vercel Storage -> Upstash 集成自动注入；代码同样兼容 `KV_REST_API_URL` / `KV_REST_API_TOKEN` |
| `BEACON_DAILY_LLM_CAP` | Live LLM 日调用上限 | Production | 默认 `200`，可省略 |
| `BEACON_DEFAULT_ENGINE` | 共享环境默认引擎 | Production | `mock` |

Vercel 环境变量修改后必须 Redeploy 才会生效。恢复 `SESSION_SECRET` 生产保护后，缺少该变量的 Production deployment 登录会返回 500，这是保护逻辑正常工作；不要通过放宽代码绕过。

生产 smoke：

```bash
vercel env pull .env.production.local --environment=production --yes
npm run smoke:production
```

该脚本会读取本机 `BEACON_ACCESS_CODE`，依次验证 `/access`、`/api/session`、`/workspace`。如果 Production 没有重新部署到最新环境变量，它会指出卡在 access gate、access code、session secret，还是 workspace cookie。

可选目标：

```bash
npm run smoke:production -- --base-url https://your-preview.vercel.app
npm run smoke:production -- --base-url http://localhost:3000 --allow-open-access
```

## 3. 推荐 demo env

`.env.local`：

```env
AI_MODE=demo
BEACON_LLM=siliconflow
BEACON_DEFAULT_ENGINE=mock
BEACON_ACCESS_CODE=...
BEACON_DAILY_LLM_CAP=200
SESSION_SECRET=...
SILICONFLOW_API_KEY=...
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
SILICONFLOW_MODEL=...

COPILOT_BACKEND=mock
COPILOT_POSTURE=conservative
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

前端只显示：

- `Live LLM`
- `Local mock`

不要在 RM 页面暴露具体供应商名称。

## 4. Vercel preview deploy

实际 preview 需要 Vercel 项目和环境变量。

建议流程：

1. 在 Vercel 创建项目，连接本 repo。
2. 配置 Environment Variables：
   - `AI_MODE`
   - `BEACON_LLM`
   - `BEACON_DEFAULT_ENGINE`
   - `SILICONFLOW_API_KEY`
   - `SILICONFLOW_BASE_URL`
   - `SILICONFLOW_MODEL`
   - `BEACON_ACCESS_CODE`
   - `BEACON_DAILY_LLM_CAP`
   - `SESSION_SECRET`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - Agent Studio 相关变量如未启用可留空。
3. Build command：`npm run build`
4. Output：Next.js 默认。
5. 部署后检查：
   - `/login`
   - `/workspace`
   - `/customers`
   - `/manager`
   - 一个 `/customers/[customerId]`

访问码运营方式：

- 每个客户 engagement 使用一个 `BEACON_ACCESS_CODE`。
- 演示周期结束后更换 Vercel 环境变量并重新部署，旧访问 cookie 即失效。
- Live LLM 日预算默认 `BEACON_DAILY_LLM_CAP=200`；超额后 demo 自动降级到 local runtime。
- 共享演示环境建议 `BEACON_DEFAULT_ENGINE=mock`；需要 Live 时在页面 Engine 控件显式切换。

每次 Production 部署后验收：

1. 无痕窗口打开生产域名，输入 `BEACON_ACCESS_CODE`。
2. 登录 Jensen，进入 Workspace。
3. 用 Jensen 对 suitability 过期客户起草，确认进入 Manager review。
4. 等待 runtime store 同步后，换浏览器登录 Sofia，打开 Manager 队列，确认 draft 可见且合规门禁红标出现。
5. Approve 后导出 Evidence Pack，打开文件检查 History、最终 draft、治理证据、规则名、免责声明。
6. 登录 Adrian，确认 Mid-level 自审批路径和客户范围仍正常。

演示前检查：

- 用 `Live LLM` 完整彩排一次 draft assist 与 talking points，确认第三方 LLM key、预算守卫和 fallback 都正常。
- 确认 Workspace/Manager 能看到 north-star 指标：governed touches/wk 与 90d coverage。
- 准备一份完整备份录屏，覆盖 Login、Workspace、Client Book、Client 360、Manager approval。
- 用现场投影比例检查 `1366x768`，确认 Login、Workspace、Client Book 行级动作、Client 360 tab 与 Beacon 浮窗不重叠。

## 5. Secret hygiene

必须满足：

- `.env.local` 不提交。
- `.env.example` 只放空 placeholder。
- 任何 docs 不出现真实 API key。
- 前端 bundle 不出现 provider key。
- 浏览器 Network 中只调用自己的 `/api/copilot/run`。
- Agent Studio / Live LLM token 只在服务端环境变量。

快速检查：

```bash
rg -n "sk-|api_key|SILICONFLOW_API_KEY|AGENT_STUDIO_API_KEY|Bearer " .
```

允许出现：

- `.env.example` placeholder
- 文档里的变量名

不允许出现：

- 真实 token
- 真实 bearer value

## 6. Demo go / no-go

Go：

- Login 可进入。
- Client Book 行级 `Call / Draft / Touch` 能打开 Beacon。
- Client 360 `Copilot` 能跑 talking points 和 next actions。
- AI output trace 可打开。
- Evidence pack 可导出一份自查：封面、History、最终 draft、治理证据、免责声明完整，正文无裸客户/运行 ID 和内部行话。
- Approval state 可从 prepared -> approved -> sent。
- Manager 可以看到 team touches & coverage、approval queue、module control。

No-go：

- 真实 key 出现在 git diff。
- `/api/copilot/run` 直接从浏览器连接第三方 agent。
- Junior 账号出现可绕过 Manager 审批的 send 动作。
- Trace 面板缺 model / provider / state / steps。
