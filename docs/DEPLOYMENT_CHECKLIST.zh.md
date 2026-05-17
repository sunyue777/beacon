# Dyna Beacon 部署与密钥检查清单

## 1. 本地 rehearsal

```powershell
cd D:\Nora\01_Hive\Dyna_WM\Dyna-Beacon
npm run generate-data
npm run validate-data
npx tsc --noEmit
npm run test:copilot
npm run build
npm run dev
```

打开：

```text
http://localhost:3000
```

如果 3000 被占用，Next 会自动切到 3001。

## 2. 推荐 demo env

`.env.local`：

```env
AI_MODE=demo
BEACON_LLM=siliconflow
SILICONFLOW_API_KEY=...
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
SILICONFLOW_MODEL=...

COPILOT_BACKEND=mock
COPILOT_POSTURE=conservative
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
   - Agent Studio 相关变量如未启用可留空。
3. Build command：`npm run build`
4. Output：Next.js 默认。
5. 部署后检查：
   - `/login`
   - `/workspace`
   - `/customers`
   - `/manager`
   - 一个 `/customers/[customerId]`

## 4. Secret hygiene

必须满足：

- `.env.local` 不提交。
- `.env.example` 只放空 placeholder。
- 任何 docs 不出现真实 API key。
- 前端 bundle 不出现 provider key。
- 浏览器 Network 中只调用自己的 `/api/copilot/run`。
- Agent Studio / Live LLM token 只在服务端环境变量。

快速检查：

```powershell
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
