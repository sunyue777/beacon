# Dyna Beacon 部署与密钥检查清单

## 1. 本地 rehearsal

macOS Terminal / zsh：

```bash
cd /Users/nora/Workspace/01_Hive/Beacon
npm install
npm run refresh-data
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

如需固定彩排日期：

```bash
npm run generate-data -- --now=2026-07-07
npm run validate-data
```

## 2. 推荐 demo env

`.env.local`：

```env
AI_MODE=demo
BEACON_LLM=siliconflow
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

## 3. Vercel preview deploy

实际 preview 需要 Vercel 项目和环境变量。

建议流程：

1. 在 Vercel 创建项目，连接本 repo。
2. 配置 Environment Variables：
   - `AI_MODE`
   - `BEACON_LLM`
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

## 4. Secret hygiene

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

## 5. Demo go / no-go

Go：

- Login 可进入。
- Client Book 行级 `Call / Draft / Touch` 能打开 Beacon。
- Client 360 `Copilot` 能跑 talking points 和 next actions。
- AI output trace 可打开。
- Approval state 可从 prepared -> approved -> sent。
- Manager 可以看到 usage & audit、approval queue、module control。

No-go：

- 真实 key 出现在 git diff。
- `/api/copilot/run` 直接从浏览器连接第三方 agent。
- Junior 可以直接 send 未 approved draft。
- Trace 面板缺 model / provider / state / steps。
