# RMUser

用途：登录身份、角色权限、客户可见范围、Manager 团队治理。

| Field | Type | Required | Mock source | Real-world mapping | Consumers |
|---|---|---:|---|---|---|
| `rmId` | string | yes | generator static IDs | IAM / CRM user ID | session, repo scope, audit |
| `name` | string | yes | demo names | HR / CRM user profile | header, queues, Manager tables |
| `email` | string | yes | demo email | IAM / directory | login, audit display |
| `role` | `Junior \| MidLevel \| Manager` | yes | demo role map | entitlement group | nav, approvals, visibility |
| `bookScope` | customer IDs / allInTeam / all | yes | generated ownership split | book assignment table | `listCustomers`, `canViewCustomer` |

当前 demo ownership：Jensen Parker 77、Adrian Lim 296、Sofia Tan 222。Manager visibility 是 595 全团队，但 client-touch draft 权限仍只属于 owner RM；Manager 对非本人客户是查看 + 审批权限，不是直接触达权限。
