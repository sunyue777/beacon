# Schema Docs / Data Mapping Index

这些文件把 Dyna Beacon 当前 demo 数据拆成可交给客户 IT / 数据团队讨论的实体说明。每个实体都包含：

- 字段组与关键字段
- 当前 mock / synthetic 生成来源
- 真实系统映射建议
- 主要 UI 与 Copilot 消费场景
- 接入真实数据时的注意事项

实体文档：

| Entity | 文档 |
|---|---|
| RM / role / visibility | `rm-user.md` |
| Customer master | `customer-profile.md` |
| Account | `account.md` |
| Product master | `product.md` |
| Holding / position | `holding.md` |
| Transaction | `transaction.md` |
| Lifecycle / service signal | `lifecycle-event.md` |
| AgentRun / AI trace | `agent-run.md` |
| AuditEvent / workflow log | `audit-event.md` |
| MarketSnapshot | `market-snapshot.md` |

当前版本仍是 demo-local：`data/asia-wealth/bundle.json` 是主数据包，runtime `AgentRun` 和 `AuditEvent` 存在内存 ring buffer。Vercel demo 如果要跨冷启动保留审批状态，需要接一个轻量持久化层。
