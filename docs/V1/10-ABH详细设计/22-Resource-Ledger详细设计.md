# Resource Ledger 详细设计

> 版本：1.1 · Owner：Ledger Maintainer · 内部模块 `resources`
>
> 通用资源限额、一次性预留与持续责任；营销 Spend Commitment 由 Domain Pack 提供估算和结算策略。

## 1. 语义与账本

每个 Ledger 定义单位、Owner、Scope、额度与周期。单位分 monetary 和 quantity；计量模式另分 cumulative（费用、Token、调用数）与 capacity（可归还的并发槽）。不同单位不能相加，两种模式不能混用结算。一次调用使用 Reservation，长期产生费用的业务使用 Commitment。

cumulative 的 available = limit − confirmedUsage − openCommitment − heldReservation；capacity 的 available = limit − heldReservation，工作结束后释放占用、不累计 Usage，也不接受 Commitment。已转入 Commitment 或 Usage 的 Reservation 不再双扣。Ledger Freeze 阻断新扩张，不阻止真实 Usage 更正入账。

## 2. 数据结构

| 表 | 字段、键与约束 |
|---|---|
| resource.ledgers | id、ownerOrganizationId、scopeRef、resourceType、meteringMode、unit/currency、period、limit、status、version |
| resource.entries | ledgerId/entryKey 唯一；kind、signedAmount、sourceRef/version、effectiveAt、recordedAt、reversesEntryRef? |
| resource.reservations | requestRef、ledgerRef、amount、expiresAt、status、bindingRef、version |
| resource.commitments | subjectRef、ledgerRef、policyVersion、liabilityUpperBound、remaining、status、sourceWatermark、version |
| resource.settlements | sourceRef/version/ledgerId 唯一；usageAmount、commitmentDelta、conversionRef、receiptRef |
| resource.balance_projection | ledgerId、watermark、balances；可重建，只作查询加速 |

高精度值遵循 Money/Decimal 契约；quantity 按注册单位的整数或固定精度约束。Ledger 行保存用于原子 admission 的余额与版本，entry 为可重算流水；两者同事务更新且定期重算核对。

## 3. Commands 与 Ports

| 接口 | 必填输入 | 事务结果 / 错误 |
|---|---|---|
| ConfigureLedger | scopeRef、resourceType、unit、limit、period、approvalRefs | ledgerRef；LEDGER_UNIT_INVALID |
| ReserveAll | requestRef、requirements[{ledgerRef,amount,sourceVersion}]、ttl、authorityRef | 全部 Held 或全部回滚；RESOURCE_EXHAUSTED |
| ConsumeReservation | reservationRef、actualUsage、receiptRef、expectedVersion | Usage + Consumed；保留估算/实际差异 |
| ReleaseReservation | reservationRef、noEffectOrCompletionEvidenceRef、expectedVersion | 未消耗 cumulative 或已结束 capacity 释放；在途不明拒绝 |
| OpenCommitment | subjectRef、reservationRefs、upperBound、policyRef、evidenceRefs | Hold 转 Commitment，不增加双重占用 |
| AdjustCommitment | ref、newUpperBound、sourceRef、expectedVersion | 差额原子预留/释放；COMMITMENT_BOUND_UNVERIFIABLE |
| SettleUsage | sourceRef/version、usageDelta、commitmentRef?、conversionRef? | Usage 追加与 Commitment 等额减少同事务 |
| BeginClose / CloseCommitment | ref、externalStopEvidence、settlementWatermark、tailBound | 进入 Closing；证明无剩余责任后 Closed |
| FreezeLedger | ref、reason、expectedVersion | status/fence、Audit/Outbox |

`ResourcePolicyPort` 由受信 Domain 实现，输入正式对象/Provider 能力/观察，返回有限责任上界及证据；Core 验证非负、精度、单位、来源和上界要求，不用 LLM 计算数值。

## 4. 并发主流程

Action Preflight 锁控制/资源 fence → 按公共 canonicalLockKey 排序锁所有 Ledger → 核验全部余额/版本 → 创建 ReserveAll → 对持续副作用在同一事务转成 Open Commitment、把 Reservation 标记 Committed → 保存 Snapshot/Authorized Action → COMMIT。持续责任不能延后到首次 Dispatch 之后才建立。

两个 Action 争用最后额度，数据库行锁串行 admission，失败方无部分 Hold。跨父级约束可同时预留，但财务汇总按唯一消耗源去重，不能把多个约束 Ledger 相加当作真实总成本。

系统使用同一 PostgreSQL 原子事务，不先实现外部 Ledger Saga。与财务系统交互只形成经核实输入/外部 Action。

ReserveAll 的 requestRef 绑定 Action 授权轮次或实际计费 callId，同一 requestRef/ledgerRef 唯一；预留后的实质重估走追加差额。重授权前在同一锁序下证明该轮全部 Operation 零派发，再释放 Hold、关闭仅为本轮新建的零风险 Commitment，或撤回本轮对既有 Commitment 的增量。原 Committed Reservation 保留历史，不改回 Held；已有资源的原负债绝不随重授权清除。发现 Permit/在途时拒绝零派发清理，继续对账。

## 5. 结算与异常恢复

Provider 调用前预留估计最大成本；回执后以实际 Usage 结算。超时且可能已计费时保留 Hold/责任并查回，不能靠 TTL 释放。若已确定未调用可释放；估值不足导致实际费用超额，必须如实入账为欠额，冻结后续扩张。

持续责任必须具有有限上界；缺平台上限或可验证终止界限时拒绝启用该花费模式。停止后保留尾差，直到 Domain Policy 的结算稳定水位满足。迟到调整追加流水，closed 历史若出现新费用，则新增纠正责任/异常记录而非篡改旧流水。

重复 Source Observation 不重复入账；Provider 更正以新 sourceVersion 和差额处理。FX 重估保留原估值、方向、来源、时间、缓冲和差额，不能重写历史授权价格。

SettleUsage 对已核实消耗增加 Usage，只在零下限内减少 remaining；超出上界的部分形成显式欠额/异常，不能将 Commitment 减成负数。退款是否恢复可用额度由冻结的领域规则决定，不能因为负 usageDelta 自动增加未来可花金额。只有额度可恢复的核实退款才增加 available。

周期由不可变 periodRef 绑定，跨期新建 Ledger，不清零旧行；迟到账单回记原周期，仍受父级总额度约束。跨期持续责任由 Domain Policy 分配有界预留，换期不能释放未决 Hold/尾差。capacity 租约到期也需 fencing 与本地工作终止证据才可归还；远端并发仍未知时按 Provider 配额能力保留占用或冻结补位，不能靠 Worker lease 到期虚增容量。

## 6. 配置、观测与安全

配置 resource.maxLedgersPerReservation=16（1–64）、resource.defaultHoldSeconds=300（10–3600，仅明确未派发可释放）、resource.balanceCheckIntervalSeconds=300。Ledger Limit 无安全默认，生产必须由责任授权配置；不能把 0 当作无限。

ReserveAll 内部 p95 30 ms 预算，不在锁内调用模型/Provider。指标 reserve_conflict、negative_balance、unsettled_age、rebuild_difference、hold_expiry_blocked。`abh doctor ledger --id` 核对流水、余额与未结责任，只提供解释和受审计修复 Command，不直接改数。

预算修改必须同时满足该 Scope 的目标/授权责任和 Grant；Assignment/Canary 不得放宽 Ledger Policy。数据保留覆盖财务/审计用途，正文裁剪不删除余额与幂等墓碑。

## 7. 验收

同一额度 100 路竞争不超卖；多 Ledger 一项不足全部回滚；Usage/Commitment 结算无双扣窗口；超时不释放；过期未派发可释放；重放观察不重复；真实超额不截断；汇率方向错误拒绝；流水重建等于余额；冻结时结算继续。

新增验证：连续任务归还 capacity；撤销零派发授权后重授权不双占 Commitment；已有长期负债不被取消动作释放；跨期迟到费用；超额结算不产生负 remaining；不同模块争用同组账本使用相同锁序。

本模块统一资源算术和原子 admission，不包含营销预算结构/经营优化。Ledger Maintainer 在 M0 验证一次性配额，在任何 M2 持续负债能力启用前验证有限上界与尾差。
