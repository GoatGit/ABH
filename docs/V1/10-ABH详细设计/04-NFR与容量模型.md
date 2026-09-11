# ABH NFR、SLO 与容量模型

> 版本：1.0 · Owner：Runtime Maintainer / Release Maintainer
>
> 继承：[技术基线第 9.1 节](../00-总体设计/系统边界与技术基线.md#91-初始-nfr-与容量验收包络)
>
> 所有数字是待实现验证的初始包络，按 [工程门禁](62-工程实施与验收门禁.md)形成证据。

## 1. 参考环境与适用范围

单写区域；API 4 vCPU/8 GiB，Worker 8 vCPU/16 GiB，PostgreSQL 8 vCPU/32 GiB SSD；API、Worker 与数据库同区域。M0 内置 Worker，M1 真实写入使用独立 Worker。外部 Provider 的配额与延迟分开统计。

| 规模 | 参考负载 |
|---|---|
| 租户与资源 | 100 个活跃 Organization、1,000 Connection、100,000 外部资源映射 |
| 数据 | 30 天保留窗口内每日 1,000,000 归一化观察；大正文走 Artifact |
| API | 100 RPS，80% Query / 20% Command；请求上限 64 KiB |
| Run | 100 并发 Run，等待不占用模型/Worker 执行槽 |
| Dispatch | 稳态 20/s，50/s 持续 5 分钟；单 Provider 按其限流降低 |
| SSE | 单用户 5、单 Organization 50；慢消费者断开后可恢复 |
| 恢复 | 可用 Provider 下处理吞吐至少稳态到达率 2 倍，直至清空积压 |

M1 按单客户真实范围先验收；扩大到完整包络前须补齐完整容量报告。压测记录数据分布、热点租户、索引、连接池、磁盘延迟和模型 Fake 版本，不能仅用空数据库结果。

## 2. 端到端时限与预算

| 路径 | 目标 | 分配与失败语义 |
|---|---|---|
| 普通内部 API | p95 ≤ 200 ms，p99 ≤ 500 ms | Ingress/身份 30 ms、授权 40 ms、Owner+DB 90 ms、编码/网络 40 ms 的 p95 预算；按链路采样验证，不以分位数相加充当实测 |
| 急停受理 | p95 ≤ 2 s | 以 stopEpoch 持久提交为完成，不等待模型退出 |
| 新 Dispatch 阻断 | p99 ≤ 5 s | 新 Permit 实时查 fence，出口使用有界 Permit；在途请求独立对账 |
| Session/Run/Binding 撤权 | p99 ≤ 30 s | 本地缓存 TTL 不超过 5 s；写路径始终重读权威 fence |
| 内部 Projection | p95 ≤ 5 s | 以 Owner commit → Projection watermark 为准，超窗显示 stale |
| Action 对账 | Adapter 声明 Provider-specific deadline | 内部首次安排查回 p95 ≤ 5 s；Fake Provider 在故障消失后 p95 ≤ 30 s 收敛 |
| API 可用性 | 规模 Profile 月度 99.9% | 排除已声明维护窗须在合同/报告中单列；不能排除内部依赖失败 |

外部 SLO 至少登记普通写响应、最终生效、暂停生效、数据新鲜度、Unknown 初次升级与最长观测窗口。未登记时该 Connector 不能进入生产。达到最长窗口只触发责任升级，不能把未知效果变成失败。

## 3. 有界执行默认值

以下配置进入 Contract Package，模块可以按更严格策略缩小；扩大需要相应负载/安全证据。

| 配置 | 默认 / 硬范围 | 超限处理 |
|---|---|---|
| runtime.runMaxTasks | 64 / 1–256 | 拒绝 Graph Patch，拆为下一 Run |
| runtime.graphMaxDepth | 16 / 1–32 | 拒绝循环/过深图 |
| runtime.runParallelism | 4 / 1–16；默认 Workflow 为 1 | 等待配额，不抢占控制队列 |
| runtime.invocationMaxTurns | 12 / 1–32 | 明确 Budget Stop |
| runtime.invocationMaxTools | 32 / 1–128 | 停止并返回进展 |
| runtime.invocationDeadlineMs | 120000 / 1000–600000 | Abort；可能已发生效果仍对账 |
| runtime.maxNoProgressTurns | 3 / 1–5 | 结束重复推理并上报 |
| control.contextTtlSeconds | 60 / 5–300 | 重新解析授权 |
| control.dispatchPermitTtlSeconds | 5 / 1–5 | 出口拒绝过期 Permit |
| worker.leaseSeconds | 30 / 10–120，1/3 周期心跳 | 丢失 lease 的 Worker 停止新工作 |
| query.maxLimit | 100 / 1–100 | 400，不隐式全表读取 |

Context Token 上限为配置值与模型上下文容量的较小者，必须预留输出及工具结果预算；默认 24,000 输入 Token 和 4,000 输出 Token，不支持该预算的模型由路由显式缩小。费用上限由 Organization/Run Ledger 配置，生产无金额上限时拒绝模型调用。

## 4. 背压与隔舱

队列类型固定为 control、reconcile、interactive、background。控制与对账至少保留 20% Worker 槽与独立数据库连接预算；即使其他队列饱和也不能借用这部分至不可回收。高危安全冻结只依赖 Control 与数据库，不依赖 LLM。

普通生成/回补最老任务超过 30 分钟时拒绝该 Scope 新任务，60 分钟进入显式延期/异常。只保存去重后的目标引用与恢复游标，避免把完整 Context 反复塞队列。Provider 熔断后停止新增调用，恢复使用速率爬升，受最慢配额约束。

每 Organization 采用公平调度和并发配额；同 Connection 的 429 不使其他 Connection 降速。最大重试预算在 Command/Operation Owner 处累加，队列重投不重置。

## 5. RPO、RTO 与恢复

| 故障 | 目标 | 恢复顺序 |
|---|---|---|
| API/Worker 进程崩溃 | 已提交事实 RPO=0；可调度任务 60 s 内重新认领 | 租约失效 → 重验 → Checkpoint/Owner 状态恢复 |
| 区域灾难 | Mission/Decision/Grant/Action/Operation/Result/Audit RPO ≤ 5 min；控制/对账 RTO ≤ 60 min | 恢复备份 → 提升 recoveryEpoch → 撤旧出口资格 → 回查 → 逐 Scope 放行 |
| 对象存储失败 | Metadata 保持；缺正文拒绝证据使用 | 恢复 Artifact → 校验 Hash → 解除隔离 |
| 模型/IdP 故障 | 无副作用推理暂停；有效内部控制持续 | Provider health 验证后恢复；不降级到弱认证/违规模型 |

PITR 使用 PostgreSQL WAL 与已验证备份；恢复演练必须含恢复点后的外部已生效调用。失去内部幂等记录时先冻结，查回之前不得宣称零重复。旧 Worker 必须被网络出口/凭据和 fencing 同时限制；仅切 DNS 不足以防双写。

## 6. 指标、告警与验证

Metric 保留低基数标签：module、result、errorCategory、queueClass；Organization/Action ID 进入受控 Log/Trace，不作全量 Metric label。Audit 失败使需要 Audit 的变更事务失败；Trace exporter 失败不得阻塞事务。

告警：授权拒绝异常增长、Unknown 年龄超限、控制队列延迟、账本欠额、Outbox 水位停滞、租约争用、Projection stale、备份落后。每项告警携带 affectedScopeRef、最小证据和对应 `abh doctor` 检查，不含正文秘密。

验收包括稳态 60 分钟、峰值 5 分钟、热点租户 50% 负载、Provider 故障/恢复、数据库短暂不可用、慢 SSE 消费者、区域恢复。报告同时给出成功率、尾延迟、资源用量和安全拒绝数量，禁止只给平均值。

## 7. 拆分与校准

先优化查询、索引、批处理、分区与 Worker 并发。容量瓶颈连续两个预先定义的窗口越界且上述手段不足时，才按 ABH 门禁引入缓存、独立队列或服务。身份、Secret 和隔离等安全前置条件在功能启用前满足，无需等待事故发生。

Runtime Maintainer 负责数字校准，最迟在相应 M1/M2 范围启用前冻结；Release Maintainer 负责保留负载与报告。缺乏证据时维持较小 Scope，不放宽已声明 SLO。
