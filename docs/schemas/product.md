# Product

用途：产品池、持仓解释、term explainer、eligibility / risk context。

| Field | Type | Required | Mock source | Real-world mapping | Consumers |
|---|---|---:|---|---|---|
| `productId` | string | yes | generated | product master ID / ISIN | holdings, term explainer |
| `name` | string | yes | category template | product master | holdings table, drafts |
| `family` | string | yes | generated issuer/family | issuer / fund house | product filters |
| `category` | Fund / ETF / Bond / Structured / Deposit / Insurance / FX / EquityBasket / ModelPortfolio / Alternative | yes | generated pool | product taxonomy | holdings, compliance |
| `geography` | Local / Regional / Global | yes | generated | product region | portfolio exposure |
| `riskLevel` | RiskProfile | yes | generated | product risk rating | suitability, alignment |
| `baseCurrency` | string | yes | generated | product currency | currency exposure |
| `fees` | bps object | yes | generated | fee schedule | term explainer |
| `inceptionDate` | date | yes | generated | product master | product facts |
| `description` | string | yes | generated | factsheet summary | Copilot context |
| `factsheetUrl` | string | no | empty/demo | document/factsheet store | future citations |

接入注意：当前 demo 每类至少 10 个产品，Fund 与 EquityBasket 扩到 30 个，保证 Client Book / Holdings 不显得单薄。
