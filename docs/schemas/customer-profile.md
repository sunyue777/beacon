# CustomerProfile

用途：客户主档、Client Book、Client 360、Copilot context、权限 ownership。

| Field group | Key fields | Required | Mock source | Real-world mapping | Consumers |
|---|---|---:|---|---|---|
| Identity | `customerId`, `name`, `avatarInitials` | yes | synthetic names | CRM customer master | all customer pages |
| Ownership | `rmId`, `assignedRmTier` | yes | generated split | RM book assignment | repo scope, Manager governance |
| Household | `householdId`, `householdRole` | no | generated family markers | household / family office table | future relationship view |
| Demographics | `age`, `gender`, `birthDate`, `profession`, `location` | yes | synthetic profile | KYC / CRM | Client 360 identity, Copilot tone |
| Segmentation | `segment`, `serviceTier` | yes | aligned 4-tier mapping | segmentation engine | Client Book filters, queue |
| Risk | `riskProfile`, `riskProfileReviewedAt`, `riskProfileExpiresAt` | yes | generated annual review cycle | risk questionnaire | Alignment, risk expiry signal |
| Review/contact | `lastContactedAt`, `nextReviewDate`, `hasDormantClientSignal` | yes | generated cadence | CRM activity / calendar | Workspace, service signals |
| Compliance | `suitabilityCompletedAt`, `suitabilityExpiresAt`, `knowledgeAssessmentStatus` | yes | generated distribution | suitability/K&E system | Alignment, draft guard |
| Money | `totalAum`, `currency`, `fundingCurrency`, `aumYoyChangePct`, `netFlow30d` | yes | synthetic from generator | PMS / account aggregation | KPIs, Client Book sort |
| Signals | `tags`, `priorityScore` | yes | generated + domain rules | service signal engine | Workspace queue, NBA |

接入注意：

- `customer.rmId` 是 direct owner，不等于可见范围。
- `serviceTier` 与 `segment` 在 demo 中一一对应：Standard/Mass、Premium/Affluent、VIP/HNW、Private/UHNW。
- `aumYoyChangePct` 与 `netFlow30d` 仍是 demo synthetic preview；真实接入时应由 transaction / balance history 派生。
- risk profile 一年有效，过期本身就是 service signal，不只是 alignment 输入。
