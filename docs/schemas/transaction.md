# Transaction

用途：Activity tab、cash flow、未来真实 AUM trend / tax-loss harvesting 输入。

| Field | Type | Required | Mock source | Real-world mapping | Consumers |
|---|---|---:|---|---|---|
| `transactionId` | string | yes | generated | transaction ID | Activity |
| `customerId` | string | yes | generated FK | customer master | repo joins |
| `accountId` | string | yes | generated FK | core/PMS account | Activity |
| `productId` | string | no | generated for product transactions | product master / ISIN | product-linked activity |
| `action` | BUY / SELL / SUBSCRIBE / REDEEM / DIVIDEND / FEE / DEPOSIT / WITHDRAW | yes | generated | transaction type | Activity filters |
| `quantity` | number | yes | generated | quantity | holdings history |
| `price` | number | yes | generated | execution price | performance/future |
| `totalAmount` | number | yes | generated | gross amount | cash flow |
| `currency` | string | yes | generated | settlement currency | display |
| `tradeDate`, `valueDate` | date | yes | generated | trade/value date | Activity timeline |

接入注意：`netFlow30d` 未来应由 DEPOSIT/WITHDRAW/REDEEM/SUBSCRIBE 等交易流派生，不能长期依赖 CustomerProfile synthetic 字段。
