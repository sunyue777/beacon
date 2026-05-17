# Holding

用途：客户持仓明细、portfolio drift、allocation chart、产品解释、draft evidence。

| Field | Type | Required | Mock source | Real-world mapping | Consumers |
|---|---|---:|---|---|---|
| `holdingId` | string | yes | generated | PMS position ID | holdings table |
| `customerId` | string | yes | generated FK | customer master | repo joins |
| `accountId` | string | yes | generated FK | account ID | account-holding linkage |
| `productId` | string | yes | generated FK | product master / ISIN | product details |
| `value` | number | yes | generated valuation | PMS market value | AUM, allocation |
| `currency` | string | yes | account/product currency | PMS currency | display, FX exposure |
| `units` | number | yes | generated | quantity | holdings detail |
| `avgCostPrice` | number | yes | generated | cost basis | future performance |
| `pctOfAum` | number | yes | generated from AUM | PMS / derived | concentration |
| `riskStatus` | aligned / mismatch | yes | generated checks | risk engine | Alignment signal |
| `openedAt`, `updatedAt` | date | yes | generated | PMS dates | freshness |

接入注意：

- Holding 必须同时关联 Account 和 Product。
- `pctOfAum` 可由 `value / customer.totalAum` 派生；真实接入时建议服务端重算，避免前端信任上传值。
- mismatch 是 demo signal；生产应由 `riskProfile + product.riskLevel + allocation + concentration` 计算。
