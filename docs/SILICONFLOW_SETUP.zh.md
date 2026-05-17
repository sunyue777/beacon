# Dyna Beacon - Live LLM / SiliconFlow 接入说明

本文档说明当前 Dyna Beacon 的 Live LLM 路线。前端不暴露具体模型供应商，只显示：

```text
Live LLM
Local mock
```

`Live LLM` 由服务端环境变量决定当前接入哪一个模型平台。当前保留并验证的 Live LLM provider 是 SiliconFlow。

## 1. 当前接入方式

前端仍然只调用：

```text
POST /api/copilot/run
```

服务端负责：

- 读取当前登录 RM。
- 校验客户可见性。
- 组装最小必要 `CopilotContext`。
- 调用 SiliconFlow OpenAI-compatible chat completions。
- 解析模型返回的 JSON。
- 运行 vocabulary guard。
- 写入 `AgentRun` 和 `AuditEvent`。
- 返回统一的 `AIOutput` trace。

## 2. 环境变量

在本地 `.env.local` 中配置：

```text
BEACON_LLM=siliconflow
SILICONFLOW_API_KEY=你的 SiliconFlow API key
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
SILICONFLOW_MODEL=MiniMaxAI/MiniMax-M2.5
```

如果使用 SiliconFlow 国际站，可改成：

```text
SILICONFLOW_BASE_URL=https://api.siliconflow.com/v1
```

修改 `.env.local` 后重启：

```powershell
cd D:\Nora\01_Hive\Dyna_WM\Dyna-Beacon
npm run dev
```

如环境变量未刷新：

```powershell
Remove-Item -Recurse -Force .\.next
npm run dev
```

## 3. 当前生效范围

当前 `skill-direct` 路线已用于：

- `talking_points`
- `draft_assist`
- `term_explainer`

`next_best_action` 当前是 deterministic ranking，不调用 LLM。

## 4. 前端模型选择

前端只显示：

```text
Live LLM
Local mock
```

- `Live LLM`：不传 `modelRoute`，由服务端读取 `BEACON_LLM`。当前即 SiliconFlow。
- `Local mock`：传 `modelRoute: "mock"`，强制走本地 mock，便于离线 demo 和回归测试。

这可以避免在 RM 日常界面暴露 SiliconFlow、Claude、OpenAI 等底层供应商名字。供应商选择属于服务端配置和机构治理范畴。

## 5. 如何切换模型

`SILICONFLOW_MODEL` 就是 SiliconFlow 的模型 id。你可以在 SiliconFlow 的模型列表、Playground 或 API 示例里复制模型 id，然后替换：

```text
SILICONFLOW_MODEL=模型ID
```

示例：

```text
SILICONFLOW_MODEL=MiniMaxAI/MiniMax-M2.5
```

换模型不需要改前端，也不需要改 `/api/copilot/run`。

## 6. Fallback 行为

如果 API key 未配置、网络失败、模型返回无法解析的 JSON，Beacon 会自动回退到本地规则输出。Trace 中会显示：

```text
llmProvider: local-fallback
parseState: fallback-to-rules
```

这样 Live LLM 不会阻塞 demo 或核心页面。
