# MarketSnapshot

用途：Workspace / Client Book 市场语气、Market Tone panel、Copilot context 的轻量市场背景。

| Field | Type | Required | Mock source | Real-world mapping | Consumers |
|---|---|---:|---|---|---|
| `snapshotId` | string | yes | generated | market data snapshot ID | market panel |
| `date` | date | yes | generated/live fallback | market data timestamp | freshness |
| `headline` | string | yes | generated or live brief | research / market news | Workspace, Client Book |
| `sentiment` | Positive / Neutral / Cautious | yes | generated/live classification | research sentiment | UI tone |
| `indices` | name/value/changePct[] | yes | generated/live | index provider | chart cards |

接入注意：当前 `/api/market/brief` 可返回 `live-web` 或 `demo-fallback`。市场数据只是 RM preparation context，不应直接进入客户投资建议文案。
