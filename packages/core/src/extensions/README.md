# Pack 内容核验

verifyPackContent 在任何内容解析/执行前逐文件读取 Artifact/Migration 原始字节，核对声明长度、SHA-256 及 Contracts 的三个 Pack 摘要。调用者显式提供 maxFileBytes/maxTotalBytes/maxFiles，先检查声明总量，再逐块限长；读取共享最多 30 秒的期限，每文件最多 100000 块（含空块）。取消/失败尝试 iterator.return，不接受迟到输出。输入 Manifest、路径列表、限额与读取函数在异步工作前快照。

source.refs 必须恰好是扫描得到的全部 Payload 路径，不包含 integrity 引用的独立证明。Archive Scanner 必须先拒绝重复项、链接和未声明文件，并独立验证证明路径/文件集合；本入口无法从读取回调确认底层文件类型。source.open 接收取消信号与只读选项，必须及时关闭实际文件/网络资源。返回值仅证明这次读取与声明一致，不是可跨文件变更复用的可信安装令牌。

入口现先验证正式 PackManifest Schema 及信任模式/路径关系，再读取 Payload；即使非法声明的自报摘要正确也拒绝。当前没有完整归档扫描器、CTK 验证或生产 Pack 启用；下述签名/来源入口仍需由 Loader 装配。不得仅凭 verifyPackContent 成功执行包代码；defineBusiness 和构建器仍待实现。

每个 source.open 得到的信号覆盖该文件完整读取生命周期；超时、外部取消、读取失败或结束均会取消信号并释放定时器。iterator.return 为尽力清理，不替代来源对 AbortSignal 的响应。

readLocalPackFiles 扫描部署方控制且不可变的 staging 内容目录。Manifest 在目录外独立读取；目录内只能有声明的 Payload、三个证明及必要父目录。拒绝符号/硬链接、特殊文件、额外/缺失路径，核对 inode/设备/尺寸/变更时间。maxEntries 包含目录，maxTotalBytes 包含证明，当前私有快照最多 64 MiB。payload 可交给 verifyPackContent，proof 返回副本；原目录后续变化不会替换快照。

此入口要求规范路径与不可并发修改的受保护目录。Node 路径 API 没有完整逐级 openat 隔离，inode 检查不能替代 staging 权限保护。I/O 边界检查取消/期限，阻塞挂载仍由部署约束。当前不含压缩归档解包、Manifest 文件解析、完整容器清单或证明真实性验证；不可据此执行 Pack。

admitPackDeployment 将完整 Manifest 与显式部署策略比较：当前 ABH 版本采用锁定 semver 7.7.4，普通范围不隐式接受 prerelease；精确 Pack ID、信任模式、许可证表达式字符串、六类权限逐项允许列表；提供的能力只能位于本 Pack 或部署已授权共享命名空间。HostProfile 匹配完整 Ref，Isolated 必须已安装并逐项不超过 ceiling，0 不表示无限。未知版本范围拒绝，权限字符串按精确匹配，不自行解释网络通配符或扩大授权。

此函数是静态准入，不核验签名者或 CTK，不建立依赖图，不授予 Grant，也不证明 Isolated Port 真正合规。sharedNamespaces/available 必须来自受信部署治理；许可证使用已批准的完整表达式允许列表，不自研 SPDX 解析。内容、证明、动态撤销与最终启用仍需 Loader 组合验证。调用者获得独立 Manifest 副本。

resolvePackDependencies 对已通过部署/信任准入的候选 Manifest 集合解析 requires，返回稳定的依赖优先顺序和逐要求的精确提供方/能力版本。最多 100 个候选包，复用 semver 范围规则；多个满足者必须以 PackDependencySelection 明确指定消费者、要求范围、提供包和能力版本。不选择最高版本或按发现顺序覆盖。缺失/不兼容、重复 Pack 身份、循环/自依赖及未使用/失效选择会抛出带完整当前冲突链的 PackDependencyError。

当前缺少能力独立 Schema/Digest 字段，重复 kind/id/version 的提供方一律拒绝，不能声称相同能力可安全合并。此入口不查安装状态、不选 Scope Assignment、不验证签名，不将本包 Workflow 的可选要求提升为安装依赖；调用方仅传正式 Manifest.requires。最终 Loader 仍须在当前治理下组合这些检查。

prepareLocalPack 组合部署准入、受保护内容目录扫描与正式 Manifest/字节核验，三阶段共享最长 30 秒期限。策略拒绝发生在文件访问前，任何内容不符不返回候选。PreparedLocalPack 只暴露 Manifest/摘要副本及冻结的文件读取门面，后续签名验证可读取同一快照的 signaturePayload 与证明，不能重新读可变目录替代被测内容。

PreparedLocalPack 是预检结果，尚未核验签名/来源/CTK，也不是不可伪造的启用凭证；实际 Loader 必须继续信任验证、依赖解析与持久安装状态检查。生产能力不能凭对象形状或预检成功直接执行。

verifyPackSignature 使用部署固定的 OfflinePublicKey 策略和精确 packId 绑定，重建 signaturePayload 原文交给真实 Cosign verify-blob。verifyPackProvenance 以独立 Builder 公钥运行 verify-blob-attestation，验证 DSSE 和 subject 字节绑定，再核对 SLSA v1 的单一 subject 名称/摘要、Builder ID、buildType 以及部署固定的源码 URI/digest。接受 in-toto Statement v0.1（Cosign 2.6.1 生成）或 v1；额外构建依赖允许存在，必须包含指定源码。只支持 Sigstore Bundle v0.3；裸未签名 JSON 不构成来源证明。

此离线配置明确不要求透明日志或 Fulcio 证书；公钥来自部署策略，不能读取包内根证书授权。Cosign 收到空 CA/日志根的本地 TrustedRoot，防止仅 --offline 仍初始化 TUF 网络路径。部署必须安装、审查并锁定绝对路径的 Cosign 可执行文件；当前验证版本为 2.6.1。进程无 shell/继承凭证环境，共享最长 30 秒期限，取消/超时 SIGKILL 并等待进程结束后清理私有临时目录，不将底层输出带入公开错误。此配置不提供子进程树隔离，不能指向包内程序或任意包装脚本。

真实签名回归通过 ABH_TEST_COSIGN=/absolute/path/to/cosign 启用；未安装时对应两项真实验证测试显式 skipped，其余拒绝/取消测试仍运行。test/fixtures/pack-signature 仅含测试公钥及公开证明，没有私钥。签名和来源函数仅返回证据摘要，不验证实际 Payload、不检查撤销/CTK，也不授予安装/执行权限。完整 Loader 必须使用 prepareLocalPack 的同一快照并继续独立 CTK 与当前部署治理验证。

verifyPackConformance 使用独立部署公钥验证 Sigstore Bundle v0.3 DSSE，predicateType 固定 urn:abh:conformance:v1，predicate 为正式 ConformanceReport。Cosign 将 subject 绑定到重建 Pack 签名原文，再校验唯一 subject 名称/摘要、Pack/Suite、Complete 状态、逐 case 完整清单及批准的 Passed/Skipped、环境/fixture/seed、时效和能力声明。claimed=true 的集合必须恰好等于 Manifest.provides，false 保留在部署策略和报告中；任何已知偏差拒绝。报告签名不会提升 Trust Mode。

ConformanceReport 的 reportDigest 使用 Contracts.digestContract，仅排除 reportDigest 与 signatureRef；报告完整结果和环境均进入摘要。signatureRef 指向 Pack 的 conformanceRef，该文件就是包含报告的签名 Bundle，不新增未声明的报告 Payload。报告 digest 本身也在签名 predicate 中。Complete 允许 Failed 结果用于表达完整但失败的测试运行，准入层才拒绝；Incomplete 和 NotRun 从不当作通过。部署策略必须提供完整、经过审查的 Suite 清单，不能从待测报告推导。

当前只有报告协议与实际密码学准入，尚未实现 @abh/conformance 各类完整 Suite、隔离 Runner/恢复、证据 Artifact 读取验证、Official 维护者验证责任或完整 Loader 启用。证据 artifactRefs 只验证引用结构，不声称已获取或复验全部 case 证据。

validateLocalPack 将 prepareLocalPack 与发布签名、独立来源、独立 CTK 准入串接，共享最长 30 秒期限。全部策略在异步前快照，证明从同一私有目录快照读取；所有阶段通过才返回固定 Manifest/文件门面及 CTK 报告副本。没有候选输入捷径，也没有重新读取可变目录替换已测内容。

该入口完成本地受保护 staging 的内容与三证明联合验证，尚不等于规范中的持久 ValidatePack/StagePack/EnablePack Command。没有持久 validationReportRef、当前 trust policy 版本/撤回查询、能力依赖安装检查、数据影响或迁移验证；返回对象不具备授权能力，生产启用必须继续部署治理。

ValidatedLocalPack.validation() 返回正式 PackValidationReport 副本，绑定 Pack 身份/三层摘要、完整静态部署及三证明策略的 JCS SHA-256、实际证明文件摘要、CTK 报告摘要、验证时间和 CTK 期限推导的 validUntil。报告摘要采用 digestContract，排除自身 reportDigest。策略只输出摘要，不输出公钥配置/宿主路径。该报告未签名、未持久化，也没有 deploymentTrustPolicyRef/撤回状态；不能由外部提交相同对象形状获得可信安装资格。

validateCurrentPack 从部署安装的 PackGovernanceSource 读取当前认证治理快照，输入不携带自选策略；检查 Pack/摘要撤回及历史 ID/version 摘要冲突，再调用联合验证，最后重读治理并比较完整快照。校验期间版本/策略/撤回/登记状态变化拒绝，报告过期或证明/CTK 摘要撤回拒绝。治理读取有取消与共享期限，方法绑定原接收者。reservedVersions 必须包含该部署全部历史保留身份，包括 Retired，不可只传 Enabled。

返回 governanceRef 只供后续事务比较。当前实现没有持久 PackGovernanceSource；认证、最新读取及完整登记视图是部署源必须满足的契约，测试使用显式内存源。Stage 必须在同一事务中锁定/比较治理版本及完整快照摘要并执行权限检查，不能把“前后两次一致”当成原子安装。尚未实现数据库治理源、锁/命令/审计或 Stage/Enable。

GovernedLocalPack.governanceDigest() 为完整治理快照的 JCS SHA-256，覆盖策略 Ref、全部策略、撤回项和历史版本保留。Stage 必须在锁内重读并比较该摘要，不能仅比较 policyRef；同一 Ref 下的撤回变化同样会改变摘要。重复撤回项/历史身份拒绝，避免不一致登记被接受。集合顺序保持来源顺序，因此来源必须稳定排序，否则会保守要求重验。摘要只是比较依据，不代替签名或授权。

parsePackManifest 接受最多 1 MiB UTF-8 JSON/YAML 字节，在独立 Worker 中使用锁定 yaml 2.9.0（ISC）解析单一 YAML 1.2 core 文档。JSON 输入先检查严格 JSON 语法，再检测重复键；YAML 拒绝锚点/别名、显式标签、非字符串键/merge、多文档、非有限/不安全整数，AST 限 100000 节点/64 层，再走惰性 JSON 与正式 Manifest 校验。Worker 限制堆/栈，最多 30 秒共享期限，取消和结束等待 Worker 退出；错误不含源内容。Worker 是解析资源边界，不是恶意可执行 Pack 的隔离 Port。

validateCurrentPack 可接 manifestDocument:{bytes,format}，与已有 manifest 对象二选一；解析、当前治理、目录内容和三份证明共享期限。此入口仍要求 Manifest 字节由调用方有界读取，目录外独立传入，不做 YAML 文件名猜测或压缩归档解包。源码与构建后的 JavaScript Worker 均已实际验证。

validatePackArchive 接受显式 tar/tar.gz 格式和根目录 Manifest 文件名，使用锁定 tar-stream 3.2.1（MIT）及 Node gzip 流解析。输入先复制并限制压缩字节，解压流独立限制全部展开字节（含 tar 头/填充/扩展元数据）；限制有效文件/目录条目、单文件和总内容。拒绝绝对/穿越/反斜杠/大小写及 NFC 歧义路径、重复项、符号/硬链接、特殊文件。只写私有临时目录，忽略包内 uid/gid/mode，创建文件使用 wx 与 0600。

解包完成后移出根 Manifest 并送入有界解析，再执行 validateCurrentPack 的目录精确集合、真实内容、三证明及治理验证。无声明文件/缺失文件由严格目录扫描拒绝；无论成功/失败均清理 staging，返回结果只读私有内存副本。maxArchiveBytes 最多 100 MiB，maxExpandedBytes 最多 500 MiB；当前快照路径 maxTotalBytes 最多 64 MiB（包括归档 Manifest），较大 Pack 仍需流式内容存储实现。maxEntries 计有效文件/目录，并通过库公开条目偏移量将隐藏的 tar 扩展头及内容按 512 字节块保守计入；归档末尾必须有完整双零块，额外填充也计入预算。总展开字节限制仍独立生效。

此入口不支持 zip/远程下载或自动格式猜测；调用方必须先有界读取压缩字节。归档库本身运行在宿主流解析中，不是 Isolated Pack 执行环境；gzip/流任务取消并等待结束后清理。持久安装、撤回数据库源和 Stage/Enable 仍需实现。

readPackArchive 对部署控制目录中的规范绝对路径执行有界文件读取：lstat/realpath 拒绝链接及非普通文件，分配前检查压缩大小（最多 100 MiB），O_NOFOLLOW/O_NONBLOCK 打开后比较设备/inode/大小/时间，再按 64 KiB 读取并复核时间与链接数。取消/期限在 I/O 边界检查，句柄始终关闭，公开错误不带宿主路径。需要部署方保护父目录和挂载；Node 路径 API 不能隔离并发敌对改名，阻塞挂载操作也不是可强制中断的。

validatePackArchiveFile 将此读取与 tar/gzip、Manifest、三证明和当前治理组合，共享最长 30 秒期限，输入配置与治理源方法先快照。成功返回的文件和报告来自私有快照，不依赖原发行包或临时目录；入口只做验证，不执行安装或授予业务权限。

PackValidationReportOwner 持久保存本进程 validateCurrentPack 签发的候选，WeakSet 拒绝伪造/展开复制对象作为验证证据。extension.validation_reports 为不可变租户记录，运行时只可 SELECT/INSERT，读按用途/Workspace 裁剪并复算报告摘要；写与审计/Outbox 共用 TenantTransaction。governanceRef/digest 一并保存，新数据库连接可查回。过期证据可以作为历史读取，但新存储拒绝过期候选；历史读取不代表可 Stage。

此 Owner 为内部持久化原语。admit 必须由部署治理 Command 提供当前权限、治理锁/版本、引用与保留策略检查；当前没有公共 ValidatePack 安装请求或默认授权，内部记录命令的幂等已接入下述 executeCommand。测试使用显式准入 Fixture 和真实验证候选，不能把它当成实际部署 Grant 验收。后续命令须在相同事务中完成 executeCommand/当前治理比较和存储，不能让 Agent 直接调用 Owner。

报告记录采用正式内部 RecordPackValidationCommand（abh.packs.record-validation），Payload 为 reportDigest/governanceRef/governanceDigest，target 为当前租户 Organization。record 在等待前快照完整命令，按公共 digestCommandIntent 计算意图摘要，与报告内容摘要分离；拒绝 Payload 与实际候选不符。executeCommand 负责幂等锁/回执，同键重放先执行当前 admit，再返回原报告 Ref，同键异参拒绝；报告/审计/Outbox/命令回执在同一事务提交。旧的“命令 digest 等于 reportDigest”临时约定已移除。

该命令是安装 Worker 的内部证据记录，不是完整的公开 ValidatePack 安装请求；不开放 HTTP。admit 仍须由生产部署层实现当前用途/Grant/治理锁与引用检查。跨进程恢复记录请求还需恢复原验证候选或可信持久验证任务，不能重新验证生成新时间戳报告后沿用旧幂等键。完整 Stage/Enable 尚未实现。

recordPackValidation 装配专用 abh.pack.manage 用途、当前身份/组织 Grant 与 fence。只接受同组织、无 Workspace 的 Human/Service Context；命令仍为 Internal，不向普通 Agent 暴露。命令/Grant 参数快照，部署检查方法绑定接收者，先锁定全部 fence，再 assertCurrentGrants，最后执行当前治理检查；重放走相同准入路径。

PackRecordAdmission.current 仍必须在同事务锁内检查持久策略版本/摘要、撤回、引用及保留策略，fenceRefs 返回对应受治理对象。这里没有默认部署治理实现，不把当前 Grant 通过等同于全部安装准入。测试身份/Grant 由维护 Fixture 种入真实数据库，实际验证使用 Core 身份/Grant/fence 逻辑；尚未覆盖真实 IdP 的部署管理员会话或生产策略数据库。

PackTrustPolicyOwner 将每个组织/Pack 的治理快照追加到 extension.trust_policies（数据库清单 45）。版本必须连续、policyRef ID 不可更换，已有 reservedVersions 不可删除或改变；运行时无 UPDATE/DELETE。current 读取最高版本并核对记录/列与完整 JCS 摘要，不过滤历史版本模拟回退。重复身份/撤回项沿用共享快照校验。策略内容目前是内部 PackGovernanceSnapshot JSON，并非完整签名 TrustPolicy 公共契约。

publish 和 match 使用组织/Pack 相同 stage-4 事务 advisory lock；publish 在锁内比较 expectedVersion，match 在记录事务中比较实际最高版本 Ref 与全部快照摘要。recordPackValidation 的 current 检查可在 fence/Grant 之后调用 match，再执行必要引用/保留检查。所有治理写入必须经 publish 协议，直接维护 SQL 绕过锁不在并发保证内。不可把内存候选验证成功等同于持久治理未变。

databasePackGovernanceSource 每次读取在独立 TenantTransaction 中执行必填当前授权并读取持久快照，不缓存最高版本。授权可能使用 SELECT FOR UPDATE 锁 fence，因此数据库事务不能设只读；源本身不写数据。Context 必须由宿主保持新鲜，过期不会降级。策略 publish 的 authorize 仍要求管理命令验证受信签名、当前发布权限、引用、审计和幂等，当前仅实现版本存储原语；测试发布回调是显式 Fixture，尚非生产 TrustPolicy 发行流程。

verifyTrustPolicy 对 SignedTrustPolicyDocument 的 JCS 原文 ["abh-pack-trust-v1", document] 使用独立部署管理公钥验证 Sigstore Bundle v0.3；document 绑定组织、issuedAt/expiresAt 与完整治理快照。部署策略独立固定组织、Pack ID、Policy ID 和最长有效期，不接受包内公钥授权。输入先快照，验证后签发仅限本进程的私有候选；publish 不再接收裸治理对象。此签名封装目前为内部协议，尚无正式公共 JSON Schema/管理发行工具。

数据库清单 46 保存签名原文、Bundle、管理公钥指纹、验签时间和到期时间。旧未签名行不回填假证明，current 拒绝将其当成当前策略；需经签名发布下一版本。读取核对签名原文中的组织/快照/到期时间与记录一致，拒绝过期最高版本，不回退旧版本。当前读取不再次运行 Cosign，也尚未接入管理根公钥撤回源；部署 authorize 必须在发布事务内重查当前管理者及 keyDigest 权限，签名不代替发布 Grant。审核、审计、幂等管理 Command 仍待实现。

治理策略现有正式 Contracts：PackDeploymentPolicy、PackSignerPolicy、PackProvenancePolicy、PackConformancePolicy、PackGovernanceSnapshot、SignedTrustPolicyDocument。生成类型用于 Core 签名/来源/CTK 策略及治理记录，数据库清单绑定 PackGovernanceSnapshot；签名文档与 current 读取强制完整结构/关系校验。对象拒绝未知字段，数组/字符串/数值有界，policyRef 固定 abh.pack-trust-policy，三类证明绑定同 Pack，重复 case/能力/历史身份/撤回项拒绝。maxAgeMs 为正安全整数，签名时另验证当前时间和部署最大有效期。

此前描述的“无公共 Schema/内部 JSON”限制已由本批契约补齐；签名公钥 PEM 在 Schema 中只验证格式，真实密码学仍由 Cosign 负责。管理根撤回、正式发布命令的 Grant/审计/幂等、CLI 发行工具、Stage/Enable 仍未实现，Schema 本身不授予信任。


## 2026-09-08：签名治理策略发布 Command

新增 Internal PublishPackTrustPolicyCommand（abh.packs.publish-trust-policy），以组织为目标，payload 绑定完整签名文档的 JCS 摘要、管理公钥指纹和 expectedVersion。publishPackTrustPolicy 只接受私有验签候选，要求同组织、无 Workspace 的 Human/Service、abh.pack.manage 用途、当前身份与组织 Grant；锁定组织/主体/Grant/部署治理 fence 后执行必填当前管理签名者/撤回/引用/保留检查。重放也执行相同准入，不能利用旧 Receipt 绕过撤权。

策略追加、审计、abh.pack.trust-policy-published 事件和 Command Receipt 同事务。CAS 继续使用组织/Pack 锁，竞争发布只有一方提交；相同命令意图重放返回原策略 Ref，签名文档改变须更换幂等键。管理签名者授权仍为显式部署接口，测试中的允许/撤回值是 Fixture；尚无持久管理根/轮换/撤回 Owner，也未开放管理 HTTP 或 CLI 发行工具。Stage/Enable 和完整 V1 仍待实现。


## 2026-09-08：Pack 本地持久 staging

stageLocalPackSnapshot 将私有 GovernedLocalPack 的完整 Manifest、原验证报告、治理 Ref/摘要及所有 Payload/三类证明保存到部署控制的本地持久目录。根路径须绝对、规范、当前进程所属且权限 0700，祖先目录也须由部署保护。每次写入使用独立 UUID，不以 Pack ID/version 覆盖目录；文件 0600、目录 0700，写完读回验证字节与证明摘要，逐文件与目录 fsync 后原子 rename，再 fsync 父目录。沿用当前内存快照的 64 MiB 总内容上限，元数据单独限 2 MiB。

recoverLocalPackSnapshot 用安装控制面保留的 id/metadataDigest 回读，验证正式 Manifest/PackValidationReport、报告自身摘要与 Manifest 绑定、原 Payload 摘要和三个证明摘要；拒绝链接、超界及内容替换。恢复返回独立内存副本，不能取得 GovernedLocalPack 的私有验证身份，也不自动重签原验证时间。当前用途/Grant/信任、撤回、期限和安装状态须另行重验。

原子发布前失败清理本次临时目录；发布后父目录同步失败或取消保留完整目录，调用结果为失败/不确定，不能据此假定数据库安装成功。当前未实现遗留目录 GC，不删除无明确引用/保留依据的快照。StagePack Command、installed_packs/installation 持久状态与 deploymentVersion CAS、数据影响报告、Enable、能力 Registry 仍待装配；此模块只完成可恢复的文件 staging。该路径要求持久本地文件系统支持目录 fsync，不适用于临时容器层或多个无共享磁盘的宿主，也不替代业务 Artifact ObjectStore。

文件系统调用在完成后检查共享截止时间和取消；不宣称能强制中断内核阻塞的 write/fsync。恢复 receipt 必须来自获授权的安装控制面，不能把外部任意传入的 id/digest 当作内容读取授权。


## 2026-09-08：StagePack 安装事务

新增 Internal StagePackCommand（abh.packs.stage），输入为持久 validationRef、无宿主路径的 LocalPackStagingReceipt 和 expectedDeploymentVersion。安装根目录由受信部署单独提供。当前身份/同组织管理 Grant/用途与部署 fence 通过后，按组织 Deployment 锁、Pack 治理锁顺序重验原报告及最高治理版本，再读回持久快照并核对完整证据；磁盘读取后再次验证当前权限与期限。重放也执行相同准入，不以原 Receipt 绕过撤权或内容损坏。

数据库清单 47 加入 extension.installed_packs（InstalledPackRecord、RLS FORCE、运行时仅 SELECT/INSERT）。Staged 记录保留完整 Manifest、原报告 Ref/摘要、治理 Ref/摘要和持久快照 Ref。组织部署序号在同一锁内单调追加；组织/Pack ID/version 唯一且不允许覆盖或删除，不同摘要的既有身份拒绝。安装记录、审计、abh.pack.staged 事件和 Command Receipt 同事务，重复命令返回原 Ref。

当前 Staged 行作为不可变初始事实保存，不提供 Enable/Suspend/Retire 修改接口。Stage 的数据影响报告、installation 步骤/恢复事实、迁移验证、能力依赖注册及完整生命周期仍未实现；缺少这些证据不会自动启用。管理签名者撤回/引用/保留检查仍由必填部署 admission 提供。多宿主共享制品、持久 staging 遗留目录清理和真正独立 CTK 执行器仍有缺口。


## 2026-09-08：持久安装读取与恢复

InstalledPackOwner.read 从 extension.installed_packs 读取精确 Ref，验证正式 InstalledPackRecord、关系列、部署序号、状态及 Manifest 三项重算摘要，并要求调用方提供当前准入。stagePack 新提交与幂等重放都读取实际安装行，核对快照/验证报告/治理引用和部署序号；Receipt 不能掩盖安装行证据损坏。

recoverStagedPack 接受持久 Pack Ref，要求当前同组织、无 Workspace 的 Human/Service、abh.pack.manage 用途与 abh.packs.stage 管理 Grant。读取原验证报告、锁定管理 fence 与当前 Pack 治理，核对报告/安装/磁盘三方证据一致，读盘前后复核期限及授权。返回独立的安装元数据/字节快照，不签发新的 GovernedLocalPack、不刷新验证时间，也不授予执行权限。安装根目录来自受信部署，不来自外部 Command 字段。

Stage 与恢复读盘使用 TenantTransaction 的取消信号，事务到期后不会继续完整扫描。当前行只支持 Staged；变更治理导致原证据过时会拒绝恢复，重新验证与安装步骤续接仍待实现。数据影响报告、Enable/Suspend/Retire、Capability Registry、管理根持久撤回以及 Stage 遗留文件回收仍未完成。


## 2026-09-08：治理预留与已安装身份一致性

PackTrustPolicyOwner.publish 在共同 Pack 锁内核对 reservedVersions 与 extension.installed_packs。新策略即使签名合法，也不能给本 Pack 已安装的 ID/version 预留另一个 packageDigest；失败不产生策略版本、事件或回执。只比较本策略 Pack ID 的预留，其他 Pack 的同名版本不会被错误合并。已有历史预留仍须完整保留。

Stage 与策略发布共用 Pack 锁，Stage 在锁内核对当前策略并提交不可变身份，策略发布在同一锁内读取已提交身份。该检查关闭显式预留与安装记录相矛盾的路径；不替代 Stage 的唯一键，也不意味着安装/Enable/数据影响评估或管理根撤回已完成。


## 2026-09-08：数据影响差异计算

assessPackDataImpact 比较显式 baseline/target 数据定义清单，按 kind/id 对 Schema、Projection、DataTransform 的语义摘要进行确定性排序与新增/修改/删除比较。结果绑定 packageDigest、baselineDigest、targetDigest，并保留受影响定义的前后摘要与声明迁移路径。输入先快照、清单有界且拒绝重复身份/未知字段，Manifest 摘要不符拒绝。

仅当前后清单都 complete、定义无变化且没有声明 Migration 时返回 NotApplicable；任一清单不完整返回 Incomplete，完整清单下存在定义变化或 Migration 返回 Required。第一次部署可以显式提供完整空基线，不制造不存在的历史版本；新增定义仍被识别为变化。migrations 为空不能覆盖 Projection/Schema/数据转换变化。

这是内部纯计算模块，尚未形成正式签名/持久影响报告或启用授权。清单的 complete 声明及语义摘要必须由受信编译器和当前部署目录核验，不能信任 Pack 自报的无影响标记。正式库存/报告 Contracts、编译器来源绑定、环境/基线版本锁、影响报告 Owner、迁移验证和 Enable 装配仍待完成；当前函数不接受或运行包内迁移代码。


## 2026-09-08：数据影响正式 Contracts

新增 PackDataDefinition、PackDataInventory、PackDataChange、PackDataImpact 四个正式契约并接入统一生成类型/校验。Core 不再维护并行接口与手写结构验证；清单输入和差异输出均经 Contract 校验。清单最多 10000 个定义、差异最多 20000 项；对象关闭未知字段，条目/迁移路径唯一。

关系验证要求 Added 只有 afterDigest、Removed 只有 beforeDigest、Changed 有两个不同摘要；变化/迁移原因须与内容一致，InventoryIncomplete 必须对应 Incomplete，有必要验证项必须为 Required。不适用结果要求前后清单摘要相同，有定义变化则摘要必须不同。不同 kind 下相同 id 仍为不同定义，不误合并 Schema 和 Projection。

该批关闭“影响结构无正式 Contracts”的缺口。Schema 只验证内部一致性，不证明清单来源或完整性声明属实；受信编译器、部署基线/环境绑定、报告签名/持久 Owner、迁移执行验证、Enable/Registry 和完整 V1 仍待实现。


## 2026-09-08：影响结果重算验证

verifyPackDataImpact 从独立取得的前后清单和完整 Manifest 重算影响结果，与输入报告逐字段比较。先经正式 Schema/关系验证，再规范化变化/迁移/原因集合顺序，核对全部内容及三项摘要；合法 Schema 不能掩盖被删除的变化项、伪造“不适用”、替换基线、完整性声明变化或虚构迁移。调用期间修改输入报告不改变校验对象。

该函数验证报告与给定输入相符，不证明清单自身来自受信编译器或当前部署。报告持久 Owner、编译器来源证明、环境与部署版本锁、数据迁移验证和 Enable 仍需接入，不能将函数返回值视作启用授权。


## 2026-09-08：数据影响持久 Owner 与管理命令

新增 PackDataImpactRecord/RecordPackDataImpactCommand，绑定精确安装 Ref、组织部署版本、Compiler CapabilityRef、环境摘要、前后来源 Ref、完整清单和重算结果。正式契约要求 compilerRef.kind=Compiler，报告 completeness 与两个来源清单一致；全部绑定字段参与 Command 意图摘要。数据库清单 48 新增 extension.data_impact_reports，RLS FORCE、运行时仅 SELECT/INSERT，存储完整报告及独立记录摘要。

recordPackDataImpact 要求当前同组织、无 Workspace 的 Human/Service、abh.pack.manage 用途及专用 abh.packs.record-data-impact Grant。锁定管理 fence、组织 Deployment 和 Pack 治理后核对当前部署版本，读取实际安装、原验证报告和磁盘快照，逐项绑定证据并重算影响。读盘前后重验当前权限/治理及期限。报告、审计、事件、Receipt 同事务；重放重做准入和计算，并验证回执所指的持久报告内容/摘要。Incomplete/Required 可作为评估事实记录，但不构成迁移完成或 Enable。

PackDataImpactAdmission.current 为必填：需核验编译器的当前受信身份、环境及两个来源 Ref 的真实内容/complete 声明，还需管理签名者撤回、引用与保留准入。联合测试中的编译器/来源检查是显式 Fixture，未冒充实际公开编译器或持久来源解析器。PackDataImpactOwner.read 是内部读取原语，调用方必须提供当前准入；其本身只校验记录摘要，不授权使用历史报告。数据影响已有正式持久事实，但实际编译器证据来源、签名、基线目录、迁移验证、安装步骤恢复、Enable/Registry 仍待完成。


## 2026-09-08：当前影响报告读取

readCurrentPackDataImpact 根据持久影响 Ref 执行当前身份/用途/组织管理 Grant 校验，读取安装与原验证证据，在组织 Deployment 和 Pack 锁内核对当前部署版本、编译器/来源准入及治理，再读回实际快照并重算报告。记录、新命令重放和当前读取共用同一检查实现，避免三个入口逐渐产生不同准入规则。存储摘要漂移、磁盘损坏、编译器撤权、策略换版或 Grant 撤回均拒绝读取。

底层 PackDataImpactOwner.read 仍供同事务组合使用并要求调用方准入；新入口要求与记录报告相同的管理 action，不扩大普通 Agent 读取权限。读取不产生新的报告、刷新验证时间或启用授权。实际来源解析/签名编译器证据、迁移验证、Enable 与 Registry 仍未实现。


## 2026-09-08：影响清单 Artifact 来源读取

verifyImpactInventoryArtifacts 从报告中的 baselineSourceRef/targetSourceRef 经真实 InlineArtifactOwner 读取，复用精确版本、Available 状态、租户/用途/Workspace、字节长度和正文摘要校验。来源要求 application/json、最多 64 KiB、规范 JCS 正文和正式 PackDataInventory；拒绝重复 JSON 键及不规范序列化，按定义 kind/id 排序后与报告中的前后清单逐字段比较。调用方必须在来源 fence 内提供 Artifact 当前所有权、区域、保留和编译器准入。

联合测试现将前后清单实际保存为 Available Artifact，由报告引用其精确 Ref，准入中读取真实正文并核对 owner/sourceRefs。覆盖正文摘要损坏、合法但不匹配的清单、重复 JSON 键和旧版本引用拒绝，沿用 Artifact 租户/用途/墓碑测试。来源内容核验已不再只靠清单内存相等断言；编译器签名/可信完整性和实际基线目录仍未实现，测试中的 owner/sourceRefs 授权是明确 Fixture。大清单仍需后续流式 ObjectStore，当前辅助函数只支持有界内联来源。


## 2026-09-08：来源正文核验强制装配

影响报告记录/重放/当前读取的共享检查现直接调用 verifyImpactInventoryArtifacts，读快照前后均重新核对实际来源正文。PackDataImpactAdmission 新增必填 source 方法，接收真实 ArtifactRecord、Baseline/Target 角色与报告副本，负责当前编译器所有权、来源访问、区域和保留准入。宿主不再需要自行记得调用正文核验辅助函数；即使 current 回调不比较清单，来源内容不匹配也会被 Owner 拒绝。

来源授权方法和其他检查在入口绑定，外部后续替换检查对象不改变当前请求的授权方法。仍需宿主提供对应 source/governance fence，完整编译器证明与基线目录尚未实现。此装配当前支持 64 KiB 内联 JSON Artifact，不把来源可读等同于编译器可信，也不执行迁移或启用。


## 2026-09-08：影响来源行并发保护

InlineArtifactOwner.lockSources 在租户/用途/Workspace 可见范围内，将完整来源集合去重并按 UUID 排序获取 FOR SHARE 行锁。verifyImpactInventoryArtifacts 在读取任何清单前锁住 baseline/target 两行；锁持续到报告记录、重放或当前读取事务结束，来源正文核验后不会被其他事务更新/墓碑替换。锁本身不授予访问权，版本、Available、授权与字节校验仍经正常 Owner.read。

锁应在管理 fence/部署/Pack 聚合锁之后获取，调用者一次传入完整来源集合，不升级来源锁执行修改。不能据此省略管理资格或来源授权 fence；该保护只保证已读 Artifact 行的事务内稳定，不证明编译器输出或 complete 声明可信。

真实 PostgreSQL 竞争验证：影响来源事务持锁时另一连接 UPDATE 遇到 lock_timeout，来源事务完成后相同 UPDATE 成功。相关 Artifact 与真实签名联合测试共 8 项通过，无跳过，Core 类型/构建通过。编译器证明、基线目录、迁移验证及 Enable/Registry 仍待实现。


## 2026-09-08：编译器影响签名验证

verifyImpactSignature 复用实际 Cosign 离线公钥验证，原文为 JCS ["abh-pack-data-impact-v1", organizationId, PackDataImpactRecord]。部署独立固定组织与精确 Compiler CapabilityRef（含版本/摘要）及公钥，完整报告覆盖安装、部署版本、环境、前后来源和清单。成功后签发进程内 WeakMap 私有候选，matchImpactSignature 核对当前组织/完整报告并返回公钥指纹、Bundle 摘要和验签时间；伪造同形或复制对象不能取得已验签身份。输入报告、配置、Bundle 在异步调用前快照。

真实测试生成独立编译器密钥签名，验证正常证明及错误组织、编译器版本、管理者公钥替代、环境摘要篡改、候选伪造和输入并发修改。签名证明当前为内部验证能力，不证明清单 complete 声明属实；报告 Owner 的 mandatory proof 装配、Bundle 持久化/恢复、当前编译器根撤回和签名有效期策略仍待实现。不能把一次验签当成当前治理或 Enable 授权。


## 2026-09-08：影响签名必需装配与持久恢复

recordPackDataImpact 现必须接收私有 VerifiedImpactSignature，签名 Bundle 不能由同形对象冒充。数据库清单 49 为 extension.data_impact_reports 增加 signature_bundle（原始 bytea）、signer_key_digest、bundle_digest，三列同时为空或完整且有界；旧未签名行不伪造证明，Owner.read 拒绝使用。记录事务保存实际已验签 Bundle，与报告/审计/事件/Receipt 一并提交。

PackDataImpactAdmission.signer 在管理/部署/Pack 锁内提供当前部署信任公钥与精确 CompilerRef。记录、重放、当前读取均用实际 Bundle 重新执行 Cosign，并核对公钥指纹及 Bundle 摘要；最后复核 signer 配置未变，公钥配置提前深拷贝。当前读取直接恢复持久 Bundle，不依赖原进程私有候选。重放要求提交原证明（相同公钥及 Bundle 摘要），不悄悄替换持久签名证据；重新签名的证明应使用新的记录请求。

低层 Owner.read 仍要求调用方准入，仅检查存储证明存在与摘要，不自行选择信任根。当前 signer/source 授权来源仍为部署接口，测试用独立编译器公钥 Fixture；持久编译器根撤回/轮换和签名有效期策略仍待实现。报告当前性另受原验证报告有效期、部署版本和当前治理约束；没有签名时间字段时不宣称完成独立编译器签名过期验证。Enable/Registry 与完整 V1 仍未完成。


## 2026-09-08：影响编译器证明有效期

PackDataImpactRecord 正式增加 issuedAt/expiresAt，关系要求 expiresAt 晚于 issuedAt；时间字段参与完整报告签名、Command 意图摘要和存储记录摘要。ImpactCompilerSigner 必填 maxLifetimeMs（正安全整数），验签前后拒绝未来签发、已到期及超出部署最长有效期的报告。matchImpactSignature 不允许已经到期的私有候选继续用于持久记录；当前报告准入同时重验原 Pack 验证报告与编译器证明期限。

旧缺少时间字段的报告不补伪造签发时间，正式 Schema 会拒绝；重新签发需形成新报告/请求。签名最长有效期策略收紧由当前 signer 解析生效，公钥根撤回/轮换的持久 Owner 仍待实现。该批完成时间绑定与校验，不代表来源清单 complete 声明、基线目录、迁移验证或 Enable 已完成。


## 2026-09-08：末次回调后证明到期保护

影响报告共享准入在最后一次来源读取及 signer 配置回验后，再执行私有签名候选的当前有效期检查，并复核原 Pack 验证报告 validUntil。修复最后一个异步回调跨过证明到期时间后仍能进入持久写入的窗口；记录、重放和当前读取共用该检查。

真实 Cosign 生成短期证明，第二次 signer 回调等待到实际到期；事务返回 PRECONDITION_FAILED，数据库没有留下报告、Command Receipt 或 Outbox 事件。测试不依赖模拟时钟推进此竞争路径。本批联合场景 1 项、Core 类型/构建/2 个 API 报告通过，无跳过；未重复全量。完整编译器根治理、基线目录、迁移验证与 Enable 仍待完成。


## 2026-09-08：迁移计划静态准入

validatePackMigrationPlan 绑定完整 Manifest 摘要与声明迁移的精确 ref/digest，要求每个迁移恰好出现一次。只允许 TrustedCode，目标 Schema 必须属于该 Pack 且绑定相同专用数据库角色。Core 清单内 Schema、public/information_schema、pg_/abh_ 保留名字和保留角色拒绝；所有权重复、未知字段、超界集合、缺少证明 Ref 拒绝。计划按 Expand→Backfill→Contract 不回退，Drop 仅允许 Contract，Contract 必需 retirementRef。

每步显式声明事务性、操作类别、review/dryRun/safetyPoint/recoveryPlan/compatibility Ref。没有迁移则返回空计划，不制造空迁移。当前为内部静态规划模块，证明 Ref 仅检查结构，仍需在执行事务/作业中核验真实审查、演练、安全点、恢复方案、兼容和旧代码退出事实；SQL 的实际权限必须由 Pack 专用角色保证，不自研 SQL 安全解析器。正式计划 Contracts、schema_ownership 持久 Owner、Migration Port/Runner 以及结果验证尚待实现，不可把本函数通过当成允许执行迁移。


## 2026-09-08：迁移步骤与所有权正式契约

PackSchemaOwnership、PackMigrationStep 进入 Contracts 统一生成链，Core 直接使用生成类型与验证器，删除并行结构/集合校验。标识符限定规范小写 PostgreSQL 名字并有长度上限，schemas/operations 非空、有界且唯一；审查、演练、安全点、恢复和兼容引用必须完整。关系校验强制 Drop→Contract、Contract→retirementRef。输入结构或关系错误现统一 INVALID_ARGUMENT；跨 Pack/保留 Schema 与角色仍由 Core 当前清单准入拒绝。

契约只描述迁移步骤和所有权声明，不能证明真实 PostgreSQL 权限或证据 Ref 内容。实际 schema_ownership 注册、签名/当前治理、Migration Runner 及迁移验证仍需实现。此前“无正式计划类型”的缺口由这两个契约关闭，整套迁移执行与 Enable 不据此宣称完成。


## 2026-09-08：迁移专用角色隔离与数据库预检

迁移计划拒绝不同 Pack 共用一个数据库角色，仍允许同 Pack 的多个 Schema 共用专用角色。新增内部 verifyPackMigrationDatabase，在直接使用专用角色登录的固定连接上读取真实 PostgreSQL 16 目录：核对 session_user/current_user、角色属性、角色成员关系、数据库 CREATE/TEMP、自有 Schema 所有权，以及外部 Schema、表/列、序列和 SECURITY DEFINER 函数权限。拒绝通过管理员连接 SET ROLE 冒充独立登录，PUBLIC 授权也参与检查。系统目录写授权同样拒绝；pg_settings 为 PostgreSQL 会话配置接口，精确排除该默认可写视图，会话配置约束由执行器负责。

真实 PostgreSQL 测试覆盖自有 Schema 建表成功、Core 写入/角色切换/临时表创建失败，以及逐项注入越权授权后预检拒绝。静态声明集合必须来自部署可信所有权来源；目前仍未持久注册 schema_ownership。预检只检查当前连接的当前权限，不构成执行授权，也不解决管理员并发改权、函数体审查、会话配置或跨数据库权限。当前 Core readiness 仍拒绝未登记的业务表，必须在持久所有权与 readiness 装配完成后才能接入正式迁移。Migration Runner、真实迁移证据验证、恢复步骤记录及 Enable 仍待实现。


## 2026-09-08：部署级 Schema 所有权持久登记

数据库清单升至 50，新增 extension.schema_roles 与 extension.schema_ownership。Schema 名在整个数据库唯一；专用角色绑定唯一 Pack，通过复合外键约束 Schema/角色/Pack 一致，避免不同租户各自声称拥有同一 PostgreSQL Schema。两表由 abh_core_owner 拥有，运行时仅 SELECT，Queue 无写入权限，不使用租户 RLS 假装物理资源可按租户拆分。

registerPackSchemaOwnership 是维护连接专用的内部登记入口：快照并验证完整声明，锁定两张全局表，核对实际 Schema Owner 及角色危险属性/成员关系，批量原子登记。冲突整体回滚；相同声明重放保留原始审查引用、登记时间与维护登录身份。登记不创建角色/Schema，不把审查引用存在等同于审查通过。审查引用内容、当前部署治理及迁移证据仍需 Migration Runner 独立验证；该入口没有运行时 Command 或普通 Agent 写入路径。

PackSchemaOwnershipOwner 在当前管理上下文及必需准入回调后读取完整部署清单。静态所有权验证复用统一实现。readiness 检查新增表的运行时只读权限、列级写授权及全局唯一/复合外键约束，约束删除会拒绝启动。migration_version 固定 0 表示仅完成登记，尚无迁移执行事实；不允许登记流程假造已完成版本。

持久登记缺口由本批关闭，尚需将当前治理/迁移计划装配到实际 Runner，并实现迁移版本与步骤结果记录。readiness 对业务表的正式登记及权限/租户规则仍未完成，当前继续拒绝未知业务表；因此不宣称已有完整 Pack Migration 或 Enable。


## 2026-09-08：持久所有权与迁移数据库预检装配

verifyRegisteredPackMigrationDatabase 使用当前 TenantTransaction 的管理 Owner 读取完整持久 Schema 所有权，接口不再接受调用方所有权声明。输入 Manifest/步骤提前快照；当前管理准入与第一次数据库权限预检后，再执行当前准入、重读完整所有权并比较，最后重新检查专用连接实际权限及 Context 有效性。缺少登记、末次准入拒绝、持久登记中途变化或回调期间角色提权均拒绝。readiness 同时补齐部署级只读表的 Queue 列级访问检查。

真实 PostgreSQL 场景验证未登记拒绝、登记后成功、第二次准入拒绝、回调期间 BYPASSRLS 提权及登记删除后拒绝；还验证 Queue 获得单列 SELECT 后 readiness 拒绝。当前准入由部署装配并保持其权限 Fence，管理连接与专用迁移连接必须由宿主配置为同一部署。本函数不是迁移执行授权，未解决维护管理员并发改变权限的通用竞争问题，不能替代执行时的权限边界、实际审查/演练/恢复证据及 Migration Runner。业务表 readiness、迁移结果和 Enable 仍需继续实现。


## 2026-09-08：迁移角色参数授权边界

专用迁移连接预检读取 pg_parameter_acl，拒绝显式授予当前角色或 PUBLIC 的 SET/ALTER SYSTEM 权限。该类权限不需要角色继承或超级用户，不能仅依赖 pg_roles 检查。普通会话参数的默认可设置能力保持可用；预检额外要求 session_replication_role=origin、allow_system_table_mods=off，避免授权撤销后复用仍保留危险设置的连接。

真实 PostgreSQL 测试覆盖直接 SET 授权、PUBLIC SET 授权、ALTER SYSTEM 授权拒绝，以及先将 session_replication_role 设置为 replica、再撤销授权后仍拒绝预检；清理会话并撤回授权后恢复通过。测试未执行 ALTER SYSTEM 写配置。该检查不替代宿主新建专用连接、完整会话配置约束与受审查 Migration Runner，任意管理员并发改权的通用竞争问题仍未关闭。


## 2026-09-08：迁移连接与登记数据库的实际绑定

组合迁移预检在读取持久所有权后，使用专用连接持有一次随机 64 位 advisory lock，并要求管理事务从当前数据库的 pg_locks 看到相同后端 PID、锁键、模式和数据库。该检查不依赖相同数据库名、主机字符串或单独的数据库 OID，避免两个独立数据库的登记清单与权限结果被拼接。使用 try-lock，不等待未知锁；成功、拒绝和异常均进入 finally 尝试解锁，解锁失败拒绝预检，宿主须丢弃清理失败的连接。

真实测试覆盖同服务器不同数据库拒绝，以及独立 PostgreSQL 实例使用相同数据库名、角色名和 Schema 且通过静态权限检查后仍被组合预检拒绝。正常和拒绝路径均验证没有残留 advisory lock。该机制绑定当前已固定会话，不等于数据库管理员或恶意数据库服务器的密码学身份认证；当前授权/权限 Fence、执行证据、Migration Runner 与业务表 readiness 仍需继续装配。


## 2026-09-08：迁移 SQL 实际字节读取

readPackMigrationContent 先验证完整迁移计划与所有权声明，再通过 verifyPackContent 校验全部 Artifact/Migration 内容。在被摘要验证的同一次流读取中复制迁移块，校验后直接从私有副本解码，不重新打开来源。返回步骤与 SQL 文本，来源缓冲区或调用方步骤后续修改不会改变结果；任一非迁移 Artifact 校验失败也不返回 SQL。

接受 application/sql、text/sql，单个迁移上限 8 MiB，整个 Pack 捕获路径上限 64 MiB；严格 UTF-8 解码并保留 BOM，拒绝 PostgreSQL text 无法表示的 NUL。继承内容校验器的完整读取期限、取消、块数与大小约束；无迁移仍校验 Pack 后返回空数组，不制造 SQL。该内部读取器不解析 SQL、不执行迁移，也不授予执行权限；正式 Runner 仍需装配当前持久所有权、受信 staging、签名/治理和实际迁移证据。


## 2026-09-08：迁移 Buffer 别名修复

迁移流捕获原先使用 chunk.slice()，Node.js Buffer 的 slice 返回共享视图；摘要校验后源缓冲区被修改时，最终解码的 SQL 会不同于已验证字节。先加入回归测试，真实复现已验证 SELECT 1 却返回 SELECT 2 的失败，再改用 new Uint8Array(chunk) 创建普通私有副本。该复制也不调用 TypedArray 子类覆写的 slice；共享内存视图复制后验证副本，后续来源修改不影响返回 SQL。

测试覆盖 Buffer、覆写 slice 返回自身的 Uint8Array 子类及 SharedArrayBuffer 视图。此前文本读取的“私有副本”保证对 Buffer 输入不成立，由本批修复；迁移执行器和完整证据装配仍未完成。


## 2026-09-08：迁移证据正式契约与实际 Artifact 读取

PackMigrationEvidence 加入正式 Contracts，绑定组织、packageDigest、stepDigest、environmentDigest、deploymentVersion、证据种类、Passed/Failed、issuedAt/expiresAt 及非空有界 supportingRefs。证据种类涵盖 Review、DryRun、SafetyPoint、RecoveryPlan、Compatibility、Retirement；闭合对象及期限顺序纳入生成验证器。digestMigrationExecution 绑定 ref/digest/schemas/databaseRole/phase/transactional/operations，排除证据引用，避免证据 Artifact 分配 ID 与报告内容互相依赖。

readMigrationEvidence 在当前 Pack 管理上下文中按完整集合锁住实际 Artifact 行，使用 InlineArtifactOwner 核对 Available、精确版本、用途及实际字节摘要，只接受有界规范 JSON。逐项核对计划引用对应种类、通过状态、组织/包/步骤/环境/部署版本及期限；全部独立验证回调结束后再复核所有报告期限和 Context。调用方必须先持有治理/权限 Fence，不得拿读取后的数组直接当执行授权。

source 与 evidence 为两个必需部署接口，分别验证 Artifact 来源权限，以及独立签发者/签名和真实支撑事实。测试使用实际数据库与 Artifact Owner，但签发者及 supportingRefs 验证回调仍为 Fixture；本批没有伪称已完成独立审查、演练、安全点与恢复事实的 Owner。生产装配、签名配置、证据最大有效期策略、完整 Migration Runner 和 Enable 仍待实现。


## 2026-09-08：迁移证据分类寿命策略

MigrationEvidenceAdmission 现必填六种证据的 maxLifetimeMs，全部为正安全整数。读取前快照部署策略，对每份报告按其种类限制 expiresAt-issuedAt，并在末次验证回调后检查策略未被替换；既有到期检查仍在所有回调后重新执行。支持为 SafetyPoint/DryRun 配置比代码 Review 更短的时效。

契约时间允许微秒，比较采用 BigInt 微秒值，避免 Date.parse 截断使超过最长寿命 1 微秒的报告被接受。真实 Artifact 测试覆盖分类限期、无效配置、回调更换策略、微秒越界及末次回调期间到期。当前策略由部署接口装配；持久策略治理、签名根与支撑事实的生产验证、Migration Runner 仍需继续实现。


## 2026-09-08：整份迁移计划的证据验证

readMigrationPlanEvidence 首先验证 Manifest 摘要、完整声明迁移集合、所有权及阶段顺序，再按全部证据 Ref 集合统一取得 Artifact 行共享锁。后续单步读取不会按相反步骤顺序逐渐获取新证据行锁；证据数量上限 10000，超限拒绝。包摘要直接取已校验 Manifest，环境与部署版本由当前部署装配提供。

全部步骤读取完成后重新核对寿命策略及每份证据的微秒有效期，避免后续步骤回调跨过先前证据期限仍返回成功。真实双步骤测试覆盖完整验证、遗漏迁移拒绝、第一步证据在第二步验证期间到期，以及第一步回调期间管理员更新第二步尚未读取的证据时发生锁超时。共享锁由事务结束释放。

返回结果仍是证据读取结果，不是执行许可。调用方必须使用当前持久所有权、当前环境/部署版本与治理 Fence；独立签发者和支撑事实验证仍需生产装配，Migration Runner、业务表 readiness 与 Enable 尚未完成。


## 2026-09-08：Artifact 授权回调与事实隔离

InlineArtifactOwner.read 原先把实际记录直接交给授权回调，回调修改 mediaType/ownerRef 等会影响返回值；把 Tombstoned 状态改成 Available 还会绕过读取状态检查。真实 PostgreSQL 回归测试先复现两条失败，再将 read/tombstone 授权参数改为独立深拷贝。墓碑化使用原始记录生成新版本，不持久化回调修改的元数据；输入引用提前快照，授权后及读取返回前复核事务/Context。

修复保护迁移证据及其他 Artifact 消费者的底层真实记录语义，不把授权回调当作事实修改接口。测试覆盖元数据替换、墓碑读取恢复尝试及墓碑写入元数据注入，并联合运行迁移证据场景。该修复不代表生产迁移证据签名/支撑事实装配或 Migration Runner 已完成。


## 2026-09-08：Staged Pack 恢复与外层事务装配

recoverStagedPackInTransaction 将现有恢复逻辑开放给内部管理事务组合：实际身份/Grant、当前信任策略、原验证报告、磁盘内容与 InstalledPack 绑定保持原有检查，取得的 Fence 与 Pack 治理锁随外层事务保留。recoverStagedPack 独立入口复用该路径，并在等待事务连接前快照引用、Grant 列表、选项及准入函数，避免输入在排队期间被替换。

真实 Cosign/数据库集成测试在恢复返回后、外层事务结束前，从独立维护事务争抢同一 Pack 治理锁，得到 lock_timeout；外层结束后成功获取。原有内容篡改、当前准入、过期与重放场景一并通过。该入口仅返回恢复内容，不构成迁移执行许可；后续内容/证据/权限预检仍需组合并在执行前复核有效期。完整 Migration Runner、生产证据支撑事实与 Enable 尚未实现。


## 2026-09-08：迁移证据独立 Cosign 签名

新增 verifyMigrationSignature，复用已有离线 Cosign 原始 Blob 验签，签名原文为 JCS ["abh-pack-migration-evidence-v1", completeReport]，完整组织/包/步骤/环境/部署/结论/时间/支撑引用均受保护。部署固定公钥、组织和证据种类，限定最长有效期；验签前后按微秒时间检查期限，取消/超时继承有界子进程机制。输入报告、配置及 Bundle 提前复制。

VerifiedMigrationSignature 由私有 WeakMap 识别，matchMigrationSignature 拒绝同形复制、报告替换和已到期候选，返回证明副本包含原 Bundle、公钥指纹、Bundle 摘要及验证时间。真实 Cosign 使用临时独立密钥测试错误公钥、跨组织/种类、完整字段篡改、短期签名实际到期和输入/输出副本隔离；临时私钥清理，不写入仓库。

本模块完成密码学来源验证，不代表 supportingRefs 的事实已由独立 Owner 验证。签名 Bundle 的持久 Artifact 装配、当前信任根撤回/轮换、迁移证据读取强制签名、Runner 与 Enable 仍需继续实现；不能仅凭签名产生执行权限。


## 2026-09-08：持久迁移签名 Bundle 验证

verifyStoredMigrationSignature 通过实际 InlineArtifactOwner 读取 Bundle Ref，要求当前同组织 Pack 管理上下文、Available 精确版本/用途/摘要与 application/json 内容；沿用 Inline 64 KiB 上限。Bundle 行共享锁保持到事务结束，当前来源权限与部署 signer 配置在真实 Cosign 前后复核，末次配置变化、签名到期或 Context 失效拒绝。多报告组合调用前仍须统一锁定完整报告与 Bundle 集合。

真实 PostgreSQL 存储 Cosign Bundle，重新从持久字节验签，不依赖原进程私有候选；测试覆盖来源撤回、公钥轮换、验签期间 signer 配置变化及 Bundle 墓碑化。signer/source 的信任配置仍由部署接口提供，测试使用临时独立密钥和当前权限 Fixture；该模块不验证 supportingRefs 的事实，尚未强制装配至全部迁移证据读取路径。生产信任根 Owner、完整 Runner 和 Enable 继续待实现。


## 2026-09-08：整份迁移计划强制持久签名入口

readSignedMigrationPlan 将完整计划验证、实际报告 Artifact 读取、持久 Bundle Cosign 验签与支撑事实接口组合。每个精确报告 Ref 必须有且仅有一个 Bundle 映射，缺少/重复/额外映射拒绝；完整报告与 Bundle 集合在读取前统一加行共享锁，总引用上限 10000。每份报告实际验签成功后才调用 supportingFacts，最后复核全部私有签名候选期限、寿命策略与截止时间。

真实测试生成 Review/DryRun/SafetyPoint/RecoveryPlan/Compatibility 五份独立签名并持久存储报告与 Bundle，完整计划成功；缺失签名在读取回调前拒绝，重复映射及用其他种类 Bundle 替换均拒绝，支撑事实接口拒绝不会被有效签名覆盖。生产调用方仍须持有当前信任配置与来源权限 Fence，提供当前持久所有权/环境；测试 supportingFacts 是 Fixture，不宣称已验证实际演练与安全点。

旧 readMigrationPlanEvidence 保留为底层无签名读取组件，新 readSignedMigrationPlan 是要求持久签名的组合入口。尚需在正式 Runner 中强制使用此入口，并实现生产支撑事实 Owner、持久治理和 Enable；返回结果不构成 SQL 执行许可。


## 2026-09-08：整份签名计划末次来源与签发者复核

readSignedMigrationPlan 在全部 supportingFacts 回调结束后，重新读取已锁定的报告 Artifact、核对实际元数据并重新调用当前来源准入；对每份持久 Bundle 使用当前 signer 公钥再验签，并要求公钥指纹与 Bundle 摘要不变。最后仍逐份复核证明期限、策略及请求截止时间。避免后续支撑事实验证期间撤回前面已验报告的来源或签发者后仍返回成功。

真实 Cosign/数据库测试在 Compatibility 支撑事实回调中分别撤回 Review 签发者、报告来源和 Bundle 来源，全部拒绝。该复核补齐组合路径的阶段边界，不替代部署权限 Fence：回调及数据库管理员任意并发变更仍需由当前治理锁/策略实现隔离。生产支撑事实 Owner、完整 Runner 与 Enable 继续待实现。


## 2026-09-08：持久所有权、实际 SQL 与签名证据准备链

prepareMigrationContent 在一个管理事务内读取持久 Schema 所有权，校验并捕获完整 Pack 的实际 SQL 字节，重新执行当前管理准入并比对所有权，然后验证整份签名计划。全部证据完成后再次读取持久所有权，复核寿命策略、全部报告期限与请求截止时间。返回包摘要、环境/部署版本、SQL 与对应证据，调用方不能用临时所有权声明代替部署登记。

真实 Cosign/数据库测试覆盖未登记拒绝、登记后返回 SELECT 1 及五份签名报告、内容损坏时不进入证据来源回调、内容读取后授权撤回拒绝。此准备函数要求宿主提供当前恢复的已安装 Pack 与环境，尚未自行恢复 InstalledPack 或验证实际迁移数据库角色；结果不是执行许可。下一步仍需与事务内 staging 恢复、数据影响报告和专用角色预检及 Runner 执行记录装配，生产 supportingFacts 与 Enable 仍未完成。


## 2026-09-08：目标数据库与迁移准备链装配

prepareDatabaseMigration 在读取 SQL 与签名证据之前，使用已固定的专用登录连接检查实际数据库绑定及持久所有权/权限；准备完成后再读取当前目录与持久所有权复核，最后检查证据有效期、策略与截止时间。空迁移计划拒绝此数据库准备入口，应走数据影响不适用/验证路径。当前授权 Fence 由外层管理事务保持，末次目录检查不新增用户准入回调。

真实 PostgreSQL/Cosign 场景使用独立 hello_migrator 登录连接完成准备；初始 BYPASSRLS 在证据读取前拒绝，supportingFacts 回调期间提权在末次目录检查拒绝。联合运行数据库预检场景，覆盖跨数据库/独立服务器、角色继承、参数权限与系统/外部 Schema 越权。本入口未执行 SQL，也未制造迁移完成记录。

已安装 Pack 恢复与实际数据影响报告仍由宿主装配，生产支撑事实 Owner、正式 Migration Runner、迁移结果/恢复记录与 Enable 尚待实现；准备结果不是执行授权。


## 2026-09-08：当前数据影响报告事务内装配

readCurrentPackDataImpactInTransaction 提供内部可组合入口，复用实际 Grant/当前治理、部署版本、来源 Artifact、staging 内容、影响重算与持久编译器 Bundle 验签的完整共享路径。独立 readCurrentPackDataImpact 入口提前快照输入并复用事务内入口；事务内读取返回后，Deployment/Pack advisory locks 与来源行共享锁随外层事务保留。

真实 Cosign/数据库场景在读取返回后用独立维护事务争抢 Deployment、Pack 锁和更新目标来源 Artifact，均得到 lock_timeout；外层事务结束后获取部署锁及更新来源成功。原有撤回、内容替换、签名期限和读取准入场景一并验证。后续组合必须在入口前收集所有新增权限 Fence 并遵守锁顺序，不能在聚合/来源锁之后补取更早阶段锁。

这一步提供数据影响与后续迁移准备共享 UoW 的基础，不等于已完成实际迁移、Runner 或 Enable。组合入口仍需绑定 installed Pack、影响报告、准备计划与当前环境，生产 supportingFacts Owner 仍待实现。


## 2026-09-08：影响报告与实际安装快照联合恢复

recoverImpactCheckedPack 在当前数据影响准入事务内返回已核验的 installation、impact 及同一次实际磁盘恢复得到的快照文件。checkCurrentImpact 复用原有真实 Grant/治理/部署版本、源 Artifact、影响重算和编译器签名检查，并返回其内部已验证快照；不再要求组合调用方另外拼接包来源。最终核对安装 Ref 与报告 packRef、实际 Manifest packageDigest 与 impact.subjectDigest。

readCurrentPackDataImpactInTransaction 复用联合恢复路径，仅取 impact 副本，独立读取语义保持不变。联合恢复返回的 report/installation 方法均给出副本；真实集成测试读取实际 abc 字节并验证安装、影响报告、包摘要一致，调用方修改副本不影响恢复对象。原有撤回、来源/签名篡改、期限及事务锁测试一并运行。

当前返回的是实际影响事实与恢复内容，Required/Incomplete/NotApplicable 不自行转换成迁移完成或执行权限。下一步仍需与迁移准备和所有权/数据库预检组合，明确拒绝 Incomplete，并实现正式 Runner、生产支撑事实 Owner 与 Enable。


## 2026-09-08：已安装 Pack 准备入口与无 SQL 影响分流

prepareInstalledPack 从当前持久影响报告直接恢复安装、Manifest、实际内容、环境和部署版本，不接受调用方另传这些绑定。仅允许 Staged，Incomplete 明确拒绝；没有 migrations 且报告 NotApplicable 时返回 NotApplicable；没有 SQL 但定义/投影变化导致 Required 时返回 DataVerificationRequired，不制造空 SQL 或把缺少 SQL 误当无数据影响。

有声明迁移时必须提供专用连接、完整计划、签名映射与证据准入，调用目标数据库准备链并在结束后重新验证影响/安装当前性及报告期限。调用方须在进入前取得全部迁移权限 Fence；这仍是内部准备接口，结果不等于执行许可。当前组合分支尚需有迁移 TrustedCode Pack 的完整 staging→impact→准备集成验收，以及最终执行前统一权限/签名复核。

真实 Cosign/数据库测试覆盖已安装无变化返回 NotApplicable、不完整编译器签名报告拒绝、投影变更但无 SQL 返回 DataVerificationRequired、来源撤回拒绝。报告均通过实际编译器签名、Artifact 内容及影响重算；没有通过 Fixture 状态直接跳过当前报告验证。生产 supportingFacts、Migration Runner、结果验证和 Enable 仍未完成。


## 2026-09-08：TrustedCode 已安装迁移准备集成与末次权限复核

新增真实发行夹具，将包含 SQL 的 TrustedCode Pack 经独立 release、SLSA builder、CTK 签名、持久治理策略、实际管理 Grant、validation 和 durable staging 安装，再写入实际来源 Artifact 与编译器签名影响报告，调用 prepareInstalledPack。入口返回 MigrationPrepared，SQL 字节为实际已安装内容，并复用五类持久签名迁移证据及专用 hello_migrator 连接。覆盖 durable SQL 替换、Grant 撤销、末次影响准入期间角色提权和有效期策略变更拒绝。

回归测试证明旧组合入口会漏过末次影响准入回调期间的 BYPASSRLS 提权。修复后，在该回调链完成后再次核验真实数据库绑定、持久 Schema 所有权和专用角色权限；以入口快照比较证据有效期策略，拒绝过程中修改策略。最后再检查证据期限、截止时间和事务活性。没有增加自研 SQL 安全解析器。

治理发布使用显式 Fixture 管理员准入回调；治理持久化、发行/编译器/迁移密码学验证、管理 Grant 和 staging 路径均为真实实现。来源、签名者配置及 supportingFacts 的生产治理仍待装配；本次末次数据库复核不代表所有外部准入事实均已固定，也不能防止其后的并发维护权限变更。迁移结果仍仅是准备信息，尚未执行 SQL；Runner、执行前统一授权/签名复核、持久执行与恢复记录、业务表 readiness 登记、结果验证及 Enable 仍未完成。


## 2026-09-08：迁移执行前持久领取与独立观察日志

新增 PackMigrationAttemptRecord / PackMigrationObservationRecord 契约及 maintenance-only 的 migration_packages、migration_attempts、migration_observations 表。物理迁移按数据库全局 Pack ID/version/migration ref 去重；同 ID/version 的 packageDigest 永久固定，并由唯一键和组合外键约束。领取完整计划时重验 Manifest/计划与持久 Schema 所有权，事务一次提交全部领取记录；记录绑定组织、环境、部署版本、影响报告、步骤摘要和证据引用。

claimPackMigrationAttempt 返回 created=false 的重复领取不能触发 SQL，即便观察日志为空。响应丢失或进程退出之后必须从实际数据库状态恢复，不能根据日志缺失推断没有执行。recordPackMigrationObservation 追加 CommitAcknowledged 或 OutcomeUnknown，保留首次领取和原有观察；观察的相同身份与证据可重放，不同证据拒绝覆盖。此日志不提供 Verified/Enabled 状态，也不会把提交回执转换成结果验证。

三张表属于 Core，仅维护连接可操作；运行时、Queue 和跨组织 verifier 均无读取或写入权限，避免全局日志暴露其他组织证据引用。readiness 检查表/列权限、主键、去重键和外键。低层维护调用记录的是调用方提供的事实，尚不承担当前治理/Grant、来源 Artifact、签名或恢复事实准入；已有真实安装准备夹具将其实际绑定写入日志并验证领取重放。维护连接不是业务 Pack SQL 执行连接。

正式 Runner 仍需把持久领取、执行前统一准入、专用角色事务执行、超时/取消及提交不确定性、实际结果验证和恢复流程装配。此批未执行 Pack SQL，未生成迁移验证通过或 Enable，非事务迁移恢复和业务表 readiness 登记仍待完成。


## 2026-09-08：迁移恢复日志一致性读取

readPackMigrationJournal 使用维护连接的 REPEATABLE READ / READ ONLY 事务读取原始领取、全局版本摘要登记及全部执行观察。入口固定 attemptRef 类型和版本；校验领取记录与数据库键、步骤执行摘要、版本摘要，以及观察的主键、类型和父领取绑定。观察最多两类，重复类型或超量记录拒绝。追加观察的重放也复用同一绑定校验。

空观察仅表示没有已记录的观察，不能证明 SQL 未执行；CommitAcknowledged 也不等于结果验证通过。接口不产生重试、执行或 Enable 权限。返回数据是独立读取结果，调用方修改副本不会改变持久历史。运行时和 Queue 仍无全局日志访问权限。

真实 PostgreSQL 测试覆盖无观察领取、两种观察完整读取、副本修改隔离、错误版本/不存在引用、运行时拒绝、步骤摘要篡改及观察父引用/身份/类型替换。并发测试用维护表锁确认读取已等待，再提交观察更新：当前调用返回旧快照，下一调用读取新值。记录读取一致性不代替目标数据库状态、实际 Artifact/签名、当前治理权限和恢复事实验证；正式 SQL Runner、非事务恢复、结果验证、业务表 readiness 登记和 Enable 仍待实现。


## 2026-09-08：一次性领取与专用角色事务执行原语

claimPackMigrationAttempt 在数据库确认领取事务提交后，为本进程返回的新领取对象保存私有一次性出处；复制、修改、重复使用或从持久日志恢复的对象均不能通过 consumeNewMigrationClaim。此出处仅证明新领取，不能替代当前治理或执行授权。

executeNewMigrationClaim 提供内部事务执行原语：要求独占、全新的专用角色连接和销毁连接的宿主 disposer；绑定组织、Pack 身份/摘要及完整计划中的确切步骤，只接受 transactional 步骤。宿主 prepare 提供当前已准入 SQL，原语重算实际字符串字节摘要，再以持久所有权和实际数据库绑定预检。BEGIN 后执行 SQL，调用实际结果/当前权限检查，再次核验角色权限和同一事务 ID，最后接收 COMMIT 回执。没有引入自研 SQL 安全解析器。

所有失败保守返回 OutcomeUnknown；CommitAcknowledged 只表示客户端收到了提交回执，不是迁移验证通过。专用连接在成功、错误、超时或取消后均销毁；disposer 失败或不响应由 connectionClosed=false 明确表达，宿主必须处理残留连接，不能重发 SQL。超时使后续执行器查询失效，并向准入回调传递 AbortSignal；宿主回调须遵守该生命周期。SQL 若自行提前 COMMIT，事务 ID 检查会拒绝正常回执，但不能撤销它已经提交的效果，因此必须走实际状态恢复。

真实 PostgreSQL 测试执行自有 Schema 的建表和写入，核验结果后提交；验证复制/修改/重复领取与持久重放不能执行，错误字节与非事务步骤不执行，越权 Core DDL、结果拒绝及末次角色提权导致未提交 DDL 回滚，超时销毁连接且迟到准备回调不执行 SQL。网络代理截断真实 PostgreSQL COMMIT CommandComplete 消息，确认数据已经持久化而调用方只收到 OutcomeUnknown；观察日志仍为空且不能再次执行。该测试同时发现并修复在已断开的 reserved 连接补发 ROLLBACK 引发驱动异步异常的问题；改为销毁独占连接清理未提交事务。

此原语尚未作为生产安装 Command 装配，测试中的当前 prepare/beforeCommit 准入是显式 Fixture；真实角色、内容摘要、持久领取、SQL 事务和网络故障均已执行。完整已签名安装准入、结果 Artifact/观察持久化、跨步骤验证与恢复、非事务 Runner、业务表 readiness、最终迁移验证和 Enable 仍待完成。不能将此批执行测试声明为完整 Pack 安装生命周期验收。


## 2026-09-08：已安装迁移执行装配与早期失败清理

executeInstalledMigrationClaim 将真实 prepareInstalledPack 接到一次性执行器，执行前和提交前均恢复当前已安装内容、验证影响报告与持久迁移签名；绑定领取记录的环境、部署版本、确切步骤及报告/Bundle 引用集合。执行器从同一次准入结果取得 Manifest、计划和 SQL，不再接受独立拼接的 Manifest/SQL。宿主实际结果检查先于提交前重新准入，固定原有准入函数并比较有效期策略；目标连接上的迟到查询受取消/期限约束。

修复执行器在进入清理作用域前序列化 Manifest/计划的问题：BigInt 或循环数据曾直接抛错，跳过独占连接销毁。输入捕获移到一次性领取消费之后、受控执行作用域内，失败返回 OutcomeUnknown、sqlStarted=false 并销毁连接；保留修复前回归失败证据。

真实集成夹具使用独立发行、SLSA、CTK、编译器与迁移签名，完成 staging、影响报告和持久领取；以新 hello_migrator 连接执行实际已安装 SELECT 1，检查真实会话角色后再次执行安装准入并收到 COMMIT 回执。持久领取重放没有执行 SQL。其他执行测试覆盖实际 DDL、权限拒绝回滚、超时、提前 COMMIT 和真实提交回执丢失。

本入口仍是内部装配，需宿主事先持有全部迁移权限 Fence。来源/签名配置及 supportingFacts 生产 Owner、实际结果验证器仍待完整实现；准备链的外部准入回调不保证所有外部事实原子固定。尚未自动存储执行结果 Artifact/观察，也未完成跨步骤验证、非事务恢复、业务表 readiness 和 Enable。SELECT 1 集成不能替代完整业务迁移验收；不把提交回执当成结果验证。


## 2026-09-08：真实执行结果 Artifact 与观察持久化

执行器为已消费真实领取的返回对象保存内部私有出处，绑定原领取、原始执行结果、观察时间和稳定 Command ID。persistMigrationExecutionResult 仅接受该原始对象，复制、修改或未消费领取的返回对象拒绝；在新管理事务中保存规范 JSON 的原始执行结果 Artifact，并在维护连接上追加同类观察。内容使用 abh-pack-migration-execution-v1 域标记，绑定完整领取、sqlStarted、connectionClosed 和 CommitAcknowledged/OutcomeUnknown，不包含 SQL 文本、凭据或驱动错误。

持久化前核对实际领取历史和组织；Artifact Owner 经独立证据捕获准入、引用准入与读取准入，Command 幂等重放验证实际内容后再写观察。Artifact 与观察属于两个事务，故障中间窗口可能仅留下 Artifact；同进程、同 Actor/输入重试复用稳定 Command 和实际 Artifact，不调用执行器。已撤销执行权限不自动取消历史证据责任，生产捕获身份/准入仍由宿主治理。

真实签名安装夹具注入观察 INSERT 失败，确认 Artifact 已提交；恢复后多次持久化返回相同 Artifact/观察且 Artifact 数保持 1。实际网络 COMMIT 回执丢失场景将 OutcomeUnknown 保存为观察，确认数据库数据已提交却不会被改写为 CommitAcknowledged，篡改返回值及拒绝捕获准入均无法写观察。重试持久化不重发 SQL。

当前保存的是未签名原始执行观察，不是迁移结果验证或 Enable 凭证。私有出处和稳定 Command 仅存于进程内；崩溃后仍需实际数据库状态及已持久 Artifact 的独立恢复入口，不能通过制造返回对象恢复写入。跨 Actor 捕获重试、自动 Runner 调度/结果落盘责任、正式结果 Schema 与签名、业务表 readiness、跨步骤/非事务恢复和 Enable 仍待完成。两个数据库事务不能被宣传为与专用 SQL 提交原子一致。


## 2026-09-08：持久执行结果 Artifact 恢复读取

readStoredMigrationExecutionResult 在管理事务中固定领取与 Artifact 引用、锁定实际来源行，读取 Available Artifact 原始字节并通过当前来源准入。校验规范 JSON、域标记、封闭结果字段、时间、完整领取绑定、Artifact owner 和来源集合。CommitAcknowledged 必须伴随 sqlStarted=true，不接受 Verified/重试授权字段。读取只返回原始历史观察，不生成私有执行结果出处或执行权限。

真实已签名安装/执行/持久化夹具完成读取，覆盖来源拒绝、领取版本绑定变化、返回副本修改，以及恢复结果不能重新送入依赖进程内出处的持久化入口。篡改场景同时重算 Artifact 摘要和字节长度，验证结果域、类型、字段、时间、环境绑定及非规范 JSON 仍被拒绝，避免仅靠内容摘要测试掩盖解析缺口。

本入口要求宿主从维护日志提供实际领取，校验记录内容与归属，不证明其真实性或当前目标数据库状态；没有自动补写观察，也未签署结果验证。进程重启后的实际状态核验、独立恢复授权、正式结果 Schema/签名、跨步骤与非事务恢复及 Enable 仍待完成。


## 2026-09-08：从已保存 Artifact 恢复缺失观察

recoverMigrationObservation 接受持久领取 Ref 和实际结果 Artifact Ref，读取维护日志中的领取，通过独立恢复授权和来源/捕获者准入，在管理事务中锁定来源并读取原始结果。随后锁定维护领取行，对比当前领取与之前读取的完整记录，补写或重放同类观察。维护写入完成前来源行共享锁一直由外层事务保留；读取过程中的领取变化会拒绝写入。没有传入或制造进程内执行结果对象，也没有 SQL 执行入口。

recordPackMigrationObservation 新增锁内准入回调，插入与重放都会调用，传入隔离的领取副本。恢复补写的是原始历史观察，CommitAcknowledged 不等于实际迁移验证完成；来源准入必须独立证明捕获者/来源权限，不能仅凭 JSON 结构认定可信。

真实签名安装夹具先注入观察写入失败，让结果 Artifact 单独提交；再仅凭持久引用恢复观察，多次恢复和原持久化重试返回同一观察。覆盖恢复权限拒绝、捕获来源拒绝，以及来源回调期间实际领取记录变化导致 VERSION_CONFLICT。此测试模拟进程内出处不参与恢复，并非杀死进程的整机恢复验收。

维护观察提交与外层管理事务并非一个原子提交；若管理事务随后失败，观察可能已存在，再次恢复必须重新准入后幂等读取，不可重跑迁移。实际目标状态核验、正式捕获治理 Owner、结果签名、自动 Runner 恢复调度、跨步骤/非事务恢复、业务表 readiness 和 Enable 仍待完成。


## 2026-09-08：迁移执行结果正式契约

Contracts 新增 PackMigrationExecutionResult 与 PackMigrationExecutionRecord，统一实际执行结果、完整领取和观察时间的封闭结构。CommitAcknowledged 必须包含 sqlStarted=true；OutcomeUnknown 允许执行尚未开始或连接未关闭。连接清理失败与提交回执分开表达，不凭 connectionClosed 推断执行结果。契约不提供 Verified、RetryAllowed 或 Enable 状态。

观察时间不得早于领取，跨字段比较保留微秒精度；嵌套结果和步骤同样经过关系校验，不能通过外层结果绕过迁移阶段约束。Core 结果类型复用生成类型，持久化和恢复读取使用同一契约校验，替换内部手写字段检查。既有 abh-pack-migration-execution-v1 JSON 域标记与内容格式保持兼容；来源锁、摘要、owner/来源集合和实际领取绑定继续校验，恢复读取也按微秒精度拒绝未来观察时间。

本批为原始执行结果统一格式，不增加结果真实性、来源签名或启用权限。结果签名、实际目标数据库验证、生产捕获治理、自动恢复调度、跨步骤/非事务恢复、业务表 readiness 和 Enable 仍待完成。


## 2026-09-08：迁移执行结果独立 Cosign 验签

verifyMigrationResultSignature 对正式 PackMigrationExecutionRecord 使用 abh-pack-migration-execution-v1 JCS 域标记验签，与现有原始 Artifact 内容一致。签名者必须由部署方独立配置，绑定组织和 Pack ID，限制最大历史年龄；时间判断保留微秒精度，拒绝未来结果。验签前固定记录、配置和 Bundle 字节，复用 Cosign；验证后再次检查年龄与截止时间。

已验证结果使用私有 WeakMap 保存出处，matchMigrationResultSignature 核对完整记录并重新检查原始年龄策略。返回记录和证明均为副本，复制候选对象不能伪造出处。签名证明完整领取、SQL 开始状态、连接清理状态与提交回执/未知结果未被替换，不把原始结果变成 Verified/Enable 或恢复权限。

真实已签名安装/执行/持久化夹具新增独立 capture 密钥，为实际结果生成 Bundle 并验签；覆盖替换结果、错误组织/Pack、公钥不匹配、超龄拒绝和候选/证明副本隔离。生产签名者治理、持久 Bundle 来源锁与当前配置复核尚未接入恢复入口；实际目标数据库结果验证、自动恢复调度、跨步骤/非事务恢复、业务表 readiness 和 Enable 仍待完成。


## 2026-09-08：持久结果 Bundle 验签与签名恢复入口

readSignedMigrationExecutionResult 在同一管理事务先按统一顺序锁定结果和 Bundle Artifact，再读取实际结果内容与签名字节。Bundle 必须属于同一领取、引用确切结果 Artifact，媒体类型为有界 JSON。以当前捕获签名者配置完成真实 Cosign 验签后，再次核对两类来源准入、签名配置及结果年龄/截止时间，返回私有已验证签名证明。

recoverSignedMigrationObservation 组合恢复授权、完整来源锁集合和强制持久签名认证；观察补写与重放均经过认证。底层 recoverMigrationObservation 的可选认证钩子在实际结果读取后、维护观察写入前调用；原低层无签名入口保留，不能视为生产签名恢复入口。宿主仍须事先保留恢复和捕获治理 Fence。

真实签名安装夹具将独立捕获 Bundle 存入实际 Artifact，覆盖联合读取、密钥策略在验签期间变化、结果/Bundle 来源末次撤回、Bundle 原始字节损坏，以及已存在观察的签名恢复重放和恢复授权拒绝。签名入口的缺失观察插入复用既有经过故障测试的底层写入路径，本批未额外进行进程崩溃重启验收。

签名认证证明原始观察来源，不证明实际目标状态、业务数据正确性或 Enable；生产捕获者治理 Owner、自动恢复调度、实际结果验证、跨步骤/非事务恢复、业务表 readiness 与 Enable 仍待完成。不能用已有 CommitAcknowledged 或签名回执跳过结果验证。


## 2026-09-08：恢复观察写入末次准入与验签时序

修复 recordPackMigrationObservation 仅在观察读写前检查准入的问题。现在插入完成后、重放返回前再次调用锁内准入；最终拒绝会回滚维护事务中新插入的观察，既有观察保持不变。恢复入口将认证移到取得维护领取锁后，并在最终检查再次执行，避免锁等待消耗签名年龄或期间配置撤回后仍使用旧验证。

真实 PostgreSQL 回归先证明旧实现缺少预期拒绝，修复后验证首次插入末次准入失败不留下观察、重放末次准入失败不能成功返回。签名安装夹具在观察查找后的再次认证撤回 capture key，签名恢复拒绝。每次认证复用持久结果/Bundle 来源锁、当前准入与实际 Cosign 验证，原有缺失观察恢复、来源拒绝、内容篡改等场景一并通过。

末次校验之后数据库提交仍可能发生连接失败或不可控管理员修改；这不是跨连接原子授权协议。治理 Fence、生产来源/捕获身份、实际目标结果验证、完整恢复调度、跨步骤/非事务恢复、业务表 readiness 和 Enable 仍待完成。


## 2026-09-08：迁移连接会话边界检查

修复执行器接收已开启事务的专用连接时，BEGIN 仅给出警告并沿用原事务、最终 COMMIT 将原写入一并提交的问题。一次性领取消费后、任何宿主 prepare 回调之前，执行 PostgreSQL 原生 DISCARD ALL：打开或失败的事务会被 PostgreSQL 拒绝，执行器返回 OutcomeUnknown/sqlStarted=false 并销毁独占连接；空闲会话则清理历史会话设置。此操作使用简单协议，不新增 SQL 安全解析器。

真实 PostgreSQL 回归先证明旧执行器对已有事务返回 CommitAcknowledged；修复后既有写入与迁移 DDL 均不存在，prepare 未调用。追加验证未分配写事务的只读事务、失败事务也在准备前拒绝；空闲连接的 default_transaction_read_only 设置被清理，随后受准入迁移正常执行。真实签名安装、提交回执丢失和原事务执行场景继续验证。

宿主仍必须提供专用、独占的新连接；DISCARD ALL 不是允许共享连接池复用的承诺，不能同步驱动已有 prepared-statement 缓存，也不能阻止宿主回调违规新开事务。原始领取失败后不允许重试 SQL。实际结果验证、生产治理、跨步骤/非事务恢复、业务表 readiness 和 Enable 仍待完成。


## 2026-09-08：实际迁移表结构检查

verifyMigrationTables 在专用角色的只读 REPEATABLE READ 事务中读取 PostgreSQL 16 实际目录，比较明确列出的普通/分区表：存在性、表 Owner、RLS/Force RLS、列顺序/类型/类型修饰/非空/identity/generated/default，以及约束定义/验证/延迟属性。返回实际形状、逐字段差异及预期摘要；不存在表和要求不存在的表均显式处理，视图等其他 relation 类型不冒充表通过。

期待值为封闭、有界结构，最多 100 个表、每表 1600 列与 1000 约束、总预期 1 MiB；重复表/列/约束、未知字段拒绝。所有名称作为参数查询目录，不执行预期表达式；pg_get_expr/pg_get_constraintdef 使用固定 pg_catalog search_path。要求直接登录的 Pack 角色、实际 Schema Owner 以及只读重复读事务，防止把多个读时点的结构拼接成结果。

真实 PostgreSQL 测试创建并修改自有表，覆盖完整预期匹配、列/默认值/额外列/未验证约束/Force RLS 差异、存在性、视图拒绝、错误角色/事务模式/Schema Owner、重复和未知字段及取消。预期由测试手写，并非复制当前目录后与自身比较。

这是结构结果检查原语，不是完整迁移验证：未检查业务数据、索引、策略正文、触发器、分区边界或整个 Schema 的额外表。宿主仍需绑定实际目标数据库、读取持久所有权、验证预期来源/签名与当前治理、控制事务取消/连接销毁；该原语不负责打开或关闭连接。正式结果契约/签名装配、数据验证、业务表 readiness 登记、跨步骤/非事务恢复与 Enable 仍待完成。


## 2026-09-08：实际索引与 RLS 策略正文检查

迁移表结构预期新增必填 indexes 和 policies 数组，空数组表示明确预期无对应对象。读取 pg_index 的规范索引定义及 valid/ready/live/unique/primary/replicaIdentity 状态，读取 pg_policy 的命令、宽松/限制模式、角色集合、USING 与 WITH CHECK 正文；继续在同一只读重复读事务中检查。角色按名称输出，PUBLIC 显式表示，不以易变 OID 做跨环境比较。

预期结构封闭、有数量上限且拒绝同名重复索引/策略与重复角色，实际目录超量或角色不能解析时拒绝。表达式只由 PostgreSQL 反编译后比较，不执行预期提供的表达式，也不自研 SQL 安全解析器。

真实测试确认 RLS/Force RLS 不变时，策略改成 PUBLIC USING(true)、SELECT 改 UPDATE、限制模式及 WITH CHECK 变化均可识别。手写表达式/部分索引预期与真实索引匹配；同名索引由 lower(label)/id>0 替换为 upper(label)/id>1 后仍报告 indexes 差异。维护连接注入 invalid 索引状态的夹具也被检测，随后恢复状态。

这一步检查索引定义/状态及策略文本，不证明索引物理一致性、策略实际租户隔离行为、角色继承或表达式依赖函数安全。业务数据、触发器、分区边界、Schema 完整清单、当前签名预期治理、结果契约持久化及 Enable 仍待完成。


## 2026-09-08：迁移后触发器与直接函数摘要检查

表结构预期新增必填 triggers 数组，读取非内部触发器的定义、启用模式和直接函数摘要。摘要覆盖函数 Schema/name/参数、语言、Owner、SECURITY DEFINER、leakproof/strict、volatility/parallel、配置、正文与二进制引用；使用规范 JSON 与 SHA-256，避免仅按函数名匹配而漏过 CREATE OR REPLACE。预期封闭且最多 1000 个触发器，拒绝重复名称、未知字段与非法摘要/启用模式。

真实 PostgreSQL 测试以手写函数元数据计算预期摘要，验证初始触发器匹配；禁用触发器、同名函数正文替换、SECURITY DEFINER 变化均报告 triggers 差异，恢复后匹配。既有列、约束、索引与策略检查一并通过。

当前只覆盖非内部触发器和直接函数属性/正文；不递归校验依赖函数、外部二进制内容、执行权限或实际触发行为，内部约束触发器仍通过约束层检查其声明，未单独验证内部实现。业务数据、分区边界、完整 Schema 清单、正式结果契约/签名装配、业务表 readiness 和 Enable 仍待完成。


## 2026-09-08：实际分区键、父表与边界检查

表结构预期新增 partition，包含分区键、分区边界和按继承顺序排列的父表 Schema/name/detachPending。普通独立表显式使用 null 键、null 边界及空父表；分区父表和叶表各自读取 PostgreSQL 的 pg_get_partkeydef、relpartbound 和 pg_inherits。在同一只读重复读事务中比较，避免只看 relkind 或列定义而漏过挂接关系变化。

真实 PostgreSQL 测试使用手写 RANGE 父表和叶表预期，覆盖范围变更、迁移到另一父表、解除挂接、错误预期分区键、DEFAULT 分区和 LIST 分区边界。新增预期字段封闭，父表最多 100 个且不允许重复身份。未把 OID 纳入跨环境预期。

当前比较明确列出的对象，不自动验证父表的所有子分区清单，也未验证并发 DETACH 的完整运行流程、分区内实际数据路由或整个 Schema 完整性。业务数据、结构预期治理/签名、正式结果契约持久化、业务表 readiness、完整迁移恢复与 Enable 仍待完成。


## 2026-09-08：受检 Schema 关系清单完整性比对

verifyMigrationInventory 对显式选择的自有 Schema 比较完整表类对象清单，覆盖普通表、分区父表/叶表、视图、物化视图、外部表和序列，输出实际清单、缺失、额外及类型变化。清单允许为空以表达预期空 Schema；Schema 必须实际存在并由专用登录角色拥有。要求 PostgreSQL 16 的只读 REPEATABLE READ 事务，可与详细结构检查使用同一事务快照。

预期最多 100 个 Schema、每 Schema 10000 对象、总 1 MiB；拒绝重复 Schema/关系名称、未知字段和非法类型。名称仅用于参数化目录查询。真实测试覆盖手写单表清单匹配、额外表/序列/视图、缺失对象、同名类型不符、空清单不匹配、越权 Schema 与重复预期拒绝，清理额外对象后重新匹配。

清单仅覆盖所选 Schema 的指定 relation 类型，不检查函数、类型、ACL、序列参数或对象内部定义；索引/TOAST 不在此清单内。宿主必须组合详细结构、当前持久所有权、实际数据库绑定及签名预期治理。业务数据验证、正式结果契约持久化、业务表 readiness、完整恢复与 Enable 仍待完成。


## 2026-09-08：清单与详细表结构联合检查

verifyMigrationStructure 固定整个预期与所有权输入，要求清单中每张普通/分区表均有且仅有一个详细结构预期，类型必须一致；明确不存在的表不能同时出现在清单，详细检查不能越出选定 Schema。组合复用同一只读 REPEATABLE READ 事务中的清单与表结构检查，返回联合预期摘要和两类实际结果。

matched 仅表示当前结构检查范围匹配，不等于完整迁移验证。序列、视图、物化视图及外部表等目前只做清单比对的对象明确返回 requiresAdditionalVerification，后续不能忽略这一范围。空详细表集合仅在预期清单没有普通/分区表时允许，实际多出的表仍会产生清单差异。

真实 PostgreSQL 测试验证手写清单/表预期联合通过；遗漏、重复、存在性矛盾拒绝；声明序列会列入待验证范围，未声明序列导致联合不匹配；实际默认值变化使联合匹配失败。既有结构、索引、策略、触发器、分区和清单场景一并运行。

宿主仍需绑定实际数据库、当前持久所有权、预期来源/签名和连接生命周期。正式结构契约与结果持久化、剩余对象详细验证、业务数据、readiness 登记、跨步骤/非事务恢复与 Enable 仍待完成。


## 2026-09-08：序列详细结构核验

新增 verifyMigrationSequences，读取 PostgreSQL 16 的 pg_sequence 与 pg_depend，比较序列所有者、整数类型、起始值、步长、上下界、缓存、循环以及所属表列；区分普通 OWNED BY（a）与 identity 内部依赖（i）。整数元数据统一为精确十进制字符串，避免 bigint 上界被 JavaScript Number 舍入。不读取运行计数作为结构证据，不调用 nextval 或 setval。

统一 verifyMigrationStructure 现在强制要求清单中的每个 S 对象具备唯一详细预期，sequences 为必填数组；缺失、重复或与清单矛盾会拒绝。序列结果参与联合 matched；视图、物化视图和外部表仍返回 requiresAdditionalVerification。此项替代上一批“序列只有清单检查”的限制。

真实 PostgreSQL 结构测试 13 项通过，无跳过，覆盖生成参数漂移、OWNED BY NONE、identity 绑定、bigint 精度、存在性、错误对象类型、权限、取消及检查不推进序列计数。Core 类型、构建、API 检查与文档链接检查通过，隔离测试容器剩余 0。未重复全量 Core。

这仍是内部结构检查：实际数据库绑定、当前持久所有权、预期来源与签名、正式结构契约与结果持久化、业务数据验证、readiness、恢复和 Enable 装配尚未完成。完整 ABH V1 仍有其他模块缺口。验证记录：[序列结构验证](../../../../docs/development/verification-2026-09-08-migration-sequences.json)。


## 2026-09-08：结构核验接入持久所有权与实际数据库绑定

新增内部 verifyRegisteredMigrationStructure：读取全局持久 Schema 所有权，复用随机 advisory lock 跨连接证明管理事务与目标角色连接确实指向同一数据库，再执行统一结构检查。结构清单必须精确覆盖完整迁移计划声明的 Schema，不能遗漏变更范围。检查前后均重新执行准入与数据库预检，比较持久登记是否变化。

准入接收固定的组织、Pack ID/版本、packageDigest、完整计划摘要与结构预期摘要；每次传递冻结副本，调用方异步修改原始预期不能替换核验内容。结果带同一 binding。宿主仍负责根据已安装制品、实际签名及部署状态认证该 binding，并持续持有治理 fences；这里没有用回调接口冒充已完成签名装配。调用方仍管理目标只读 REPEATABLE READ 事务和连接生命周期，未提供数据验证、正式报告持久化、readiness 或 Enable。

本批真实 PostgreSQL 数据库预检及结构测试 35 项通过，无跳过；Core 类型、构建、2 个 API 报告及文档链接检查通过，隔离测试容器剩余 0。未重复全量 Core。验证记录：[持久登记结构核验](../../../../docs/development/verification-2026-09-08-migration-registered-structure.json)。


## 2026-09-08：结构预期签名与实际目标核验

新增 verifyStructureSignature，以独立部署公钥执行真实 Offline Cosign 验证。签名域为 abh-pack-migration-structure-expectation-v1，覆盖组织、Pack ID/版本、packageDigest、完整迁移计划摘要、结构预期摘要、环境摘要、部署版本及有效期；有效期使用微秒精度比较。验证凭证使用私有对象身份保存，复制对象不能冒充已验证凭证，返回内容为独立副本。

verifySignedMigrationStructure 将签名与持久登记/实际数据库结构核验组合。每次治理准入前后匹配签名所绑定的结构摘要，并重新读取当前环境与签名者配置；密钥或策略轮换、来源撤回、检查期间过期不能继续得到通过结果。签名有效但数据库有未声明对象时，仍返回结构不匹配。

报告暂为内部类型，尚未进入正式 Contracts；报告/Bundle 的实际持久制品读取、已安装包与当前来源认证仍由宿主提供，不能视为这些装配已完成。签名只证明结构预期来源，业务正确性、数据验证、结果持久化、readiness、恢复与 Enable 仍待实现。

真实 Cosign 与 PostgreSQL 联合测试 39 项通过，无跳过；Core 类型、构建、2 个 API 报告和文档链接检查通过，隔离测试容器剩余 0。未重复全量 Core。验证记录：[结构预期签名验证](../../../../docs/development/verification-2026-09-08-migration-structure-signature.json)。


## 2026-09-08：持久结构预期报告与 Bundle 读取

readSignedStructureExpectation 在管理事务内同时锁定报告和 Bundle 来源，读取 InlineArtifactOwner 的实际字节。验证双方所有者、媒体类型和大小，Bundle 必须引用该报告；报告必须为规范 JSON 签名域封装，且完整 binding 与目标组织/包/计划/结构摘要一致。随后执行真实 Cosign 验证，并在返回前刷新两个来源准入与签名者配置、重新检查有效期。原始 options 与管理事务的取消信号共同控制验签。

真实 PostgreSQL Artifact Store Command 写入报告和 Bundle 后可成功读取；缺少引用、所有者版本不符、非规范 JSON、报告替换、密钥策略轮换及后期来源撤回均拒绝。本批签名与持久读取测试 5 项通过，无跳过；Core 类型、构建、2 个 API 报告及文档检查通过，隔离测试容器剩余 0。未重复全量。

这里只认证结构预期，未产生实际迁移完成证据。已安装包、部署状态和来源权威仍由宿主准入提供；尚需将持久读取与目标核验直接装配，补齐正式契约、数据验证、实际结果持久化、恢复及 Enable。验证记录：[持久结构预期验证](../../../../docs/development/verification-2026-09-08-migration-stored-structure.json)。


## 2026-09-08：持久签名预期到实际数据库的装配

新增 verifyStoredMigrationStructure，直接接受报告/Bundle 的 Artifact Ref、结构预期与迁移计划，组合持久字节读取、真实 Cosign 验证、全局 Schema 所有权以及实际目标数据库结构检查。返回结构差异、精确报告/Bundle Ref 与签名证据。调用方替换结构预期会因签名 binding 不匹配而拒绝；真实多出的序列仍使 matched=false。

每次准入重新读取报告和 Bundle 并执行验签；部署准入回调结束后再验证来源与密钥，保证该回调中的撤回/轮换不会被忽略。整个调用的签名者配置固定比较，环境和部署版本必须符合签名报告，检查期间有效期持续生效。这一实现有重复验签开销，尚未做缓存优化。

真实 Artifact/Cosign/PostgreSQL 测试 5 项通过，无跳过，包括目标结构检查之后的部署变化、来源撤回和密钥策略轮换。Core 类型、构建、2 个 API 报告及文档链接检查通过，隔离测试容器剩余 0。未重复全量。安装/部署权威及 fences、连接生命周期仍由宿主承担，正式契约、业务数据检查、实际结果持久化、恢复和 Enable 尚待完成。验证记录：[持久预期目标装配](../../../../docs/development/verification-2026-09-08-migration-stored-inspection.json)。


## 2026-09-08：结构预期报告正式 Contracts

新增 PackMigrationStructureBinding 与 PackMigrationStructureReport 正式契约，统一组织、精确 Pack 版本、包/计划/结构摘要、环境、部署版本及有效期。字段封闭且必填，部署版本限定正安全整数；关系校验按微秒精度要求 expiresAt 严格晚于 issuedAt。报告级摘要策略覆盖全部字段，包括完整嵌套 binding。Core 的结构签名校验与绑定类型现使用该正式契约，移除重复本地字段校验。

Contracts 全量 255 项测试通过，48 项生成制品及一致性检查通过；类型和构建通过，9 个 API 报告已更新并检查。Core 真实 Cosign、Artifact 和 PostgreSQL 联合回归 40 项通过，无跳过，类型、构建、2 个 API 报告及文档检查通过。隔离测试容器剩余 0，未重复全量 Core。

此契约描述签名结构预期元数据，不证明实际迁移完成。详细表/序列预期仍是内部类型，安装与部署权威、业务数据验证、实际结果持久化、恢复及 Enable 尚待完成。验证记录：[结构预期正式契约验证](../../../../docs/development/verification-2026-09-08-migration-structure-contract.json)。


## 2026-09-09：实际结构观察结果持久化

verifyStoredMigrationStructure 现在仅为真实返回的原始对象保存私有生产者记录，包括捕获快照、所有者、观察时间和稳定 commandId。persistMigrationStructureResult 拒绝复制或修改结果，使用独立管理事务写入 Artifact 并读回核对内容、所有者及来源引用。重复保存复用命令身份，重验捕获准入，不重复检查或执行目标 SQL；末尾准入撤回会使写入事务回滚。

持久载荷使用 abh-pack-migration-structure-observation-v1，包含实际结构结果、差异、未覆盖对象范围、签名报告和公钥/Bundle 摘要。Bundle 字节由原持久 Ref 与摘要标识，不重复嵌入。matched=false 的观察同样可以保存，不将结构不匹配丢弃或改写为成功。

真实 Artifact/Cosign/PostgreSQL 测试 5 项通过，无跳过，覆盖原始对象限制、修改拒绝、准入回滚、重试同 Ref、重放准入拒绝、实际内容读回及不匹配保存。Core 类型、构建、2 个 API 报告与文档检查通过，隔离测试容器剩余 0。未重复全量 Core。

这仍是未签名的结构观察，不能替代完整迁移验证或 Enable。详细观察契约与恢复读取尚待完善，Inline Artifact 大小限制仍适用，大结果对象存储未实现；安装/部署与捕获权威、业务数据验证及 Enable 装配仍待完成。验证记录：[实际结构观察持久化](../../../../docs/development/verification-2026-09-09-migration-structure-persist.json)。


## 2026-09-09：持久结构观察重新核验读取

readRevalidatedStructureResult 锁定观察、报告及 Bundle 来源，读取真实观察 Artifact，再要求回调在同一管理事务中产生新的原始 verifyStoredMigrationStructure 结果。私有生产者记录增加事务身份；其他事务的旧返回对象不能冒充当前重新核验。逐项比较持久观察与当前完整结构、binding、摘要、报告和来源 Ref，仅允许验签执行时间不同；观察时间和验签时间检查使用微秒顺序。

数据库发生真实结构漂移时，先前 matched=true 的观察无法继续通过；持久观察 matched 被篡改会拒绝。历史与当前均不匹配时允许读取该观察，但 current.matched 保持 false。返回前重新验证观察来源，撤回不能被初始读取掩盖。该流程不重放 SQL，也不签发执行或 Enable 权威。

真实 Artifact/Cosign/PostgreSQL 测试 5 项通过，无跳过，包括旧事务结果拒绝、内容篡改、末尾来源撤回、额外序列漂移及不匹配恢复。Core 类型、构建、2 个 API 报告与文档检查通过，隔离测试容器剩余 0。未重复全量 Core。

宿主仍负责真实目标回调、连接与治理 fences；独立历史观察契约/签名、业务数据验证、完整恢复与 Enable 尚未完成。验证记录：[结构观察重新核验](../../../../docs/development/verification-2026-09-09-migration-structure-revalidate.json)。


## 2026-09-09：普通视图与物化视图定义核验

新增 verifyMigrationViews，在专用角色的只读 REPEATABLE READ 事务中读取 pg_get_viewdef、列类型、所有者、reloptions 及 relispopulated，比较普通视图与物化视图定义。search_path 固定 pg_catalog，选项排序后比较，列保持实际顺序；不执行视图表达式、不读取物化业务数据、不触发 REFRESH。

真实 PostgreSQL 测试覆盖手写预期、同名替换定义、security_barrier/security_invoker、列类型变化、WITH NO DATA 与刷新后状态变化，以及不存在、错误对象类型、重复预期、权限和取消。初次测试发现 CREATE OR REPLACE VIEW 未指定选项会同时重置选项，已将测试 DDL 改为明确保留选项以分别验证定义与选项漂移。最终结构套件 14 项通过，无跳过；Core 类型、构建、2 个 API 报告及文档检查通过，隔离测试容器剩余 0，未重复全量。

本批为独立详细检查器，尚未接入统一签名结构预期，因此统一入口中的视图仍保留 requiresAdditionalVerification。视图依赖行为、触发器/规则、物化索引、ACL 与业务数据正确性尚未覆盖，不能据此宣称完整迁移验证或 Enable 完成。验证记录：[视图定义验证](../../../../docs/development/verification-2026-09-09-migration-views.json)。


## 2026-09-09：视图核验接入签名结构流程

MigrationStructureExpectation 增加必填 views 数组；清单中每个普通/物化视图要求唯一详细预期，遗漏、重复或存在性矛盾均拒绝。统一检查在同一只读 REPEATABLE READ 事务中执行视图核验，视图字段进入预期摘要、联合 matched、实际结果持久化与恢复比对。现有旧预期不能静默跳过新增字段，需要重新提供并治理新的摘要。

真实签名制品测试使用实际视图作为预期对象，验证同名定义漂移使联合结果不匹配，旧成功观察恢复拒绝，新不匹配观察可持久保存并重验保持 false。清单覆盖、签名、Artifact、数据库权限及结构回归共 41 项通过，无跳过；Core 类型、构建、2 个 API 报告和文档检查通过，隔离测试容器剩余 0。未重复全量 Core。

普通/物化视图仍保留 requiresAdditionalVerification，因为依赖行为、规则/触发器、物化索引及 ACL 尚未完整检查；业务数据验证和 Enable 装配也未完成。验证记录：[视图签名装配验证](../../../../docs/development/verification-2026-09-09-migration-views-integrated.json)。


## 2026-09-09：视图规则与物化索引核验

MigrationViewShape 增加必填 rules 与 indexes，读取 pg_rewrite 中非 _RETURN 规则的定义/启用模式，以及 pg_index 中索引定义、valid/ready/live、唯一性、主键和 replica identity 标志。_RETURN 查询定义仍通过 pg_get_viewdef 检查。新增字段进入现有签名预期摘要、持久观察和恢复比对，列表上限与字段/名称唯一性封闭校验同步加入。

真实测试创建并替换同名视图规则，检查 DO INSTEAD 与 DO ALSO 定义差异；创建物化唯一索引后替换为部分表达式索引，并在隔离实例注入/恢复 indisvalid=false 验证状态读取。PostgreSQL 不支持对视图使用 ALTER TABLE DISABLE RULE，测试已改为受支持的规则替换。规则内容仅检查定义，未执行其业务行为。

结构及实际签名/持久化/恢复联合测试 19 项通过，无跳过；Core 类型、构建、2 个 API 报告和文档检查通过，隔离测试容器剩余 0，未重复全量。视图依赖、触发器、ACL、业务数据和 Enable 仍待完成，requiresAdditionalVerification 继续保留。验证记录：[视图规则索引验证](../../../../docs/development/verification-2026-09-09-migration-view-rules.json)。


## 2026-09-09：视图触发器与共享函数指纹

从表检查提取 readMigrationTriggers，表与视图共用非内部触发器定义、启用模式和直接函数指纹读取。视图预期增加必填 triggers，沿用闭合字段、摘要格式和数量/名称唯一性约束；触发器差异进入统一签名预期、实际观察持久化和恢复比对。

真实 PostgreSQL 测试创建 INSTEAD OF INSERT 视图触发器，比较手写触发器定义与独立计算的函数指纹，验证同名函数体替换、SECURITY DEFINER 切换以及恢复原函数后的匹配。既有表触发器、签名和持久恢复场景一并回归，共 19 项通过，无跳过；Core 类型、构建、2 个 API 报告及文档检查通过，隔离测试容器剩余 0，未重复全量。

函数指纹只覆盖直接函数定义/配置，不递归验证依赖与二进制内容；视图依赖、ACL、实际业务数据及 Enable 仍未完成，额外验证标记继续保留。验证记录：[视图触发器验证](../../../../docs/development/verification-2026-09-09-migration-view-triggers.json)。


## 2026-09-09：对象与列级直接 ACL 核验

新增 verifyMigrationAcl，在专用角色只读 REPEATABLE READ 事务中比较对象及列级 ACL，展开 NULL relacl 对应的默认所有者权限，保留授权者、被授权者（含 PUBLIC）、列名、权限及 grant option，返回缺失和额外授权。真实测试发现序列 relkind 与 acldefault 类型代码不同，已使用正确的小写 s 展开序列默认权限。

真实 PostgreSQL 测试覆盖默认所有者权限、PUBLIC SELECT、列级 UPDATE WITH GRANT OPTION、撤销 grant option 及序列 USAGE 授权。最终结构测试 15 项通过，无跳过；Core 类型、构建、2 个 API 报告及文档检查通过，隔离测试容器剩余 0，未重复全量。

本批为独立检查器，尚未装配到签名结构预期。直接 ACL 不能替代角色继承、超级用户、RLS、函数间接权限及 Schema/数据库权限验证；完整迁移验证与 Enable 仍未完成。验证记录：[直接 ACL 验证](../../../../docs/development/verification-2026-09-09-migration-acl.json)。


## 2026-09-09：直接 ACL 接入统一签名结构核验

MigrationStructureExpectation 增加必填 acl 数组，清单中每个关系对象必须具有唯一、类型一致的权限预期。遗漏、重复、清单外对象及类型不符均拒绝；ACL 检查在统一只读 REPEATABLE READ 事务内执行，实际差异参与 matched、预期摘要、持久观察与恢复比对。新增必填字段要求重新提供和治理签名预期，不静默接受旧摘要。

真实测试在已签名预期对应视图上增加 PUBLIC SELECT，确认整体核验不匹配、此前成功观察不能恢复，新不匹配观察可保存并重验保持 false。表、序列及视图的 ACL 清单覆盖与签名/Artifact/数据库权限回归共 42 项通过，无跳过；Core 类型、构建、2 个 API 报告及文档检查通过，隔离测试容器剩余 0，未重复全量 Core。

直接 ACL 不证明角色继承或间接权限安全，也不验证实际业务数据；视图依赖及外部表定义仍保留额外验证范围，完整迁移验证和 Enable 尚待实现。验证记录：[ACL 签名装配验证](../../../../docs/development/verification-2026-09-09-migration-acl-integrated.json)。


## 2026-09-09：Core 全量回归

在当前工作树运行 Core 完整 test/*.test.ts，配置固定本地 Cosign v2.6.1、真实 PostgreSQL/Testcontainers 和默认测试并发 2。443 项全部通过，失败/跳过/取消均为 0，耗时 76,195 ms；隔离测试容器剩余 0。这次全量包含近期结构契约、表/序列/视图/ACL、签名 Artifact、观察持久化与重新核验，以及既有 HTTP、Owner、Durable/Wait 和执行链路测试。

此前多个结构批次未重复全量的限制，现由本次当前工作树证据补充；历史日志仍按原记录保留。测试通过仅证明现有测试覆盖，不能证明 V1 全部实现。重新核对 V1 Mission Controller 设计及当前数据清单，Mission/Run 实际 Owner 仍未实现；生产治理/默认服务、Pi/Gateway、ObjectStore、Projection/Workbench、SDK/CLI 及完整 Pack Enable 等也仍有缺口，不将迁移结构工作等同于整个目标。

验证记录：[Core 全量回归](../../../../docs/development/verification-2026-09-09-core-full.json)。


## 2026-09-09：已安装 Pack 的结构核验装配

新增 verifyInstalledMigrationStructure，从 prepareInstalledPack 当前持久安装记录推导 Manifest 与结构报告所有者，从已签名数据影响报告推导环境及部署版本，再执行持久签名结构预期与实际数据库核验。组合固定输入和回调方法，持续检查迁移证据有效期策略；每轮结构准入重验 staging、治理/Grant、签名 compiler impact 和完整迁移准备，安装或影响内容变化拒绝。

真实安装集成 fixture 以已签名 SELECT 1 迁移和空 Schema 预期验证成功路径，结构来源撤回及核验期间的 impact 准入撤回均拒绝。现有执行、观察 Artifact、签名恢复场景随同一个集成测试运行通过：1 项通过，无跳过。Core 类型、构建、2 个 API 报告和文档检查通过，隔离测试容器剩余 0。本批之后未重复 Core 全量，前一批 443 项证据单独保留。

该入口补齐安装/影响到结构核验的组合，不产生 Enable 或业务数据正确性结论。宿主仍负责权威回调、fences 与专用只读连接生命周期，重复准备存在验签/文件读取开销；实际 DDL/ACL 变更由独立结构套件覆盖，生产迁移编排与完整数据验证仍待完成。验证记录：[安装态结构核验](../../../../docs/development/verification-2026-09-09-migration-installed-structure.json)。


## 2026-09-09：包内真实 DDL 与 TOAST 预检修复

安装 fixture 从 SELECT 1 改为包内实际 CREATE TABLE（整数主键与带默认值 text 列），所有 SQL 长度/摘要、包签名、迁移证据、staging 和后续校验均使用真实字节。结构预期在执行前独立编写并签名；执行前缺表拒绝，执行后核对列、主键、索引、ACL 并持久读取实际观察，修改默认值后报告列差异。

该实质场景暴露并修复了 verifyPackMigrationDatabase 的 TOAST 误判：PostgreSQL 会在 pg_toast 为 text 等列生成内部存储及索引，旧预检把它们当作外部所有权。现在仅豁免通过 reltoastrelid/pg_index 明确关联到专用角色自有已登记 Schema 表、且内部对象所有者相同的 TOAST 对象。其他外部对象继续拒绝；隔离测试通过注入外部表 TOAST 所有者变化验证无法借用豁免。

真实安装签名、迁移执行与专用角色数据库预检联合测试 38 项通过，无跳过；Core 类型、构建、2 个 API 报告及文档检查通过，隔离测试容器剩余 0。未重复全量 Core。本批替代安装测试此前只有 SELECT 1/空 Schema 的限制，但不代表业务数据验证或 Enable 已完成。验证记录：[安装真实 DDL 验证](../../../../docs/development/verification-2026-09-09-migration-installed-ddl.json)。


## 2026-09-09：实际数据不变量检查

新增 verifyMigrationData，对已登记 Pack 的普通非继承表检查精确行数、指定列空值数及指定键重复组数，计数使用十进制字符串。只接受固定不变量和受限标识符，不接受 SQL/谓词表达式；复合键中的 NULL 按分组相等语义检查，要求键值完整时需同时声明 nonNull。

要求专用角色、真实表及 Schema 所有权和只读 REPEATABLE READ 事务，拒绝超级用户/BYPASSRLS；设置 row_security=off 并拒绝强制 RLS，不能把策略隐藏后的零行当成全表通过。当前拒绝继承关系及分区表，未声称支持跨分区数据范围。

真实 PostgreSQL 测试创建/更新/删除数据，检出行数缺失、空值、单键及含 NULL 复合键重复；强制 RLS、继承、缺列、表达式注入、重复语义键、越界 Schema、事务模式与取消均覆盖。结构/数据套件 16 项通过，无跳过；Core 类型、构建、2 个 API 报告及文档检查通过，隔离测试容器剩余 0，未重复全量。

此为独立基础检查器，签名数据预期、安装态装配、结果持久化和完整领域验证仍未完成，不能据此 Enable。验证记录：[实际数据不变量验证](../../../../docs/development/verification-2026-09-09-migration-data.json)。


## 2026-09-09：数据检查的表身份与快照稳定性

verifyMigrationData 在目录检查前取得目标表 ACCESS SHARE 锁，保持到调用方事务结束，并比较当前名称解析得到的 OID 与快照目录对象，避免将不同对象的目录与数据拼接为一次通过结果。该锁阻止 DROP/结构 ALTER，不阻止普通数据写入；REPEATABLE READ 保证本次全部计数使用同一数据快照。

真实并发测试在目录读取边界通过独立连接执行 ALTER TABLE，确认因锁超时拒绝；同一边界执行 INSERT 成功，本次核验仍匹配旧快照，下一次核验看到新增行而不匹配。事务结束后 ALTER 可以执行。数据/结构测试 16 项通过，无跳过；Core 类型、构建、2 个 API 报告与文档检查通过，隔离测试容器剩余 0，未重复全量。

签名数据预期、安装态数据装配、完整领域验证与 Enable 仍未实现。验证记录：[数据检查并发验证](../../../../docs/development/verification-2026-09-09-migration-data-lock.json)。


## 2026-09-09：数据不变量接入持久登记与实际目标

新增 verifyRegisteredMigrationData，读取持久 Schema 所有权，复用跨连接随机锁证明实际目标与管理事务为同一数据库，再执行数据不变量检查。检查前后重新运行准入和数据库预检、比较持久所有权，绑定固定 DataInvariants 类型、组织、Pack ID/版本、packageDigest、完整迁移计划及数据预期摘要。检查对象必须位于迁移声明的 Schema 内。

真实 PostgreSQL 联合测试 40 项通过，无跳过，覆盖另一台同名数据库拒绝、迁移范围外 Schema、后期准入撤回、调用方输入修改隔离及实际空值/重复数据。Core 类型、构建、2 个 API 报告和文档检查通过，隔离测试容器剩余 0，未重复全量。

该入口仅覆盖明确列出的表，完整数据范围仍需治理认证；准入回调不是实际签名验证，签名数据报告、安装态数据装配、结果持久化与 Enable 仍待完成。验证记录：[持久登记数据核验](../../../../docs/development/verification-2026-09-09-migration-data-registered.json)。


## 2026-09-09：数据预期签名与实际核验

新增 verifyDataSignature 和 verifySignedMigrationData。真实 Offline Cosign 签名使用独立 abh-pack-migration-data-expectation-v1 域并要求 DataInvariants binding，覆盖组织、Pack、完整计划、数据预期摘要、环境、部署版本及有效期。使用私有凭证身份、输入副本和持续有效期检查；结构签名 Bundle 不能替代数据签名。

组合入口在当前持久登记/实际目标数据核验前后匹配凭证、刷新环境与签名者配置并执行来源/安装准入。数据报告暂为内部类型，复用正式结构报告的身份、环境和时间字段约束，独立正式数据契约尚未生成。宿主仍提供报告/Bundle 字节及权威配置，持久数据报告读取与安装态组合仍待实现。

真实 Cosign/PostgreSQL 联合测试 6 项通过，无跳过，覆盖跨签名域替换、摘要篡改、错误组织/密钥、复制凭证、输入修改隔离、实际重复键漂移、配置变化和后期来源撤回。Core 类型、构建、2 个 API 报告及文档检查通过，隔离测试容器剩余 0，未重复全量。此结果不证明完整领域验证或 Enable 完成。验证记录：[数据预期签名验证](../../../../docs/development/verification-2026-09-09-migration-data-signature.json)。


## 2026-09-09：持久签名数据预期读取

新增 readSignedDataExpectation，在管理事务中锁定数据报告和 Bundle 来源，读取实际 Artifact 字节；验证所有者、媒体类型/大小、Bundle 对报告的引用、规范签名域封装以及完整 DataInvariants binding。使用真实 Cosign 验签，返回前再次执行两个来源准入与签名者配置比较、有效期检查；调用方与管理事务取消信号共同生效。

真实 Artifact Store Command 写入报告/Bundle，测试覆盖合法读取、结构报告替换、报告内容篡改、错误所有者、缺少来源引用、非规范 JSON、同 Ref、后期来源撤回及密钥策略变化。现有结构/数据签名与目标验证联合测试 6 项通过，无跳过；Core 类型、构建、2 个 API 报告及文档检查通过，隔离测试容器剩余 0，未重复全量。

该读取器只认证数据预期，正式数据契约、持久报告到实际目标的直接组合、安装态数据验证、结果持久化和 Enable 仍待完成。验证记录：[持久数据预期验证](../../../../docs/development/verification-2026-09-09-migration-data-stored.json)。


## 2026-09-09：持久签名数据预期到实际扫描的装配

新增 verifyStoredMigrationData，直接接收数据报告/Bundle Ref 和明确数据不变量，组合真实 Artifact 读取、独立 Cosign 验签、持久 Schema 所有权和同库目标数据扫描。扫描前后各准入均重读来源；部署准入回调结束后再次认证报告和 Bundle，整个调用固定比较签名者配置，避免遗漏回调期间撤回或轮换。

真实测试覆盖合法数据扫描、调用方修改行数预期导致摘要拒绝、实际重复行导致 matched=false，以及扫描后的部署版本变化、来源撤回与签名策略轮换。签名/持久数据及既有结构回归 6 项通过，无跳过；Core 类型、构建、2 个 API 报告和文档检查通过，隔离测试容器剩余 0，未重复全量。

宿主仍提供安装/部署权威及目标连接生命周期；重复读取和验签尚未优化。正式数据契约、安装态数据装配、实际数据观察持久化、完整领域验证和 Enable 仍待完成。验证记录：[持久数据预期扫描验证](../../../../docs/development/verification-2026-09-09-migration-data-composed.json)。


## 2026-09-09：安装态数据核验与观察恢复

新增 verifyInstalledMigrationData，从当前 Staged 安装、签名数据影响报告和迁移证据装配实际数据扫描。包清单、所有者、环境与部署版本来自当前安装；扫描期间重新准备安装并检查签名来源、策略和部署变化。真实已提交 DDL 后插入两行，验证空值漂移可独立于结构检查失败，后期影响报告撤回会拒绝核验。

新增 persistMigrationDataResult 和 readRevalidatedDataResult。实际扫描输出保存私有生产者身份、不可变观察副本与稳定命令 ID；复制或篡改输出不能保存，重试返回同一 Artifact，匹配及不匹配观察均可审计。恢复锁定实际观察和签名来源，并要求当前管理事务重新扫描目标；比较全部数据、绑定、报告与签名摘要，仅允许验签时间变化。旧事务结果和实际数据漂移不能恢复为原观察，不重放迁移 SQL。

安装态、签名与实际数据联合测试 7 项通过，无跳过；Core 全量 447 项通过，失败和跳过均为 0，类型、构建与 2 个 API 报告通过。该全量执行在后续正式数据契约替换前完成。

这仍是明确表范围内的数据不变量观察；报告与观察的独立正式契约、生产目标连接生命周期、完整领域/回填/投影验证、ObjectStore 大结果和 Enable 装配仍待完成。Mission/Run/Pi、Gateway、生产治理与服务、Projection/Workbench、SDK/CLI 的整体设计缺口继续保留，不能据此宣布 ABH 完成。验证记录：[安装态数据核验与恢复](../../../../docs/development/verification-2026-09-09-migration-installed-data.json)。


## 2026-09-09：独立数据预期正式契约

新增 PackMigrationDataBinding 与 PackMigrationDataReport，要求 DataInvariants 类型、组织、精确包版本、包/计划/数据预期摘要、环境和部署版本，以及按微秒严格递增的签发/过期时间。封闭字段并将全部报告字段纳入契约摘要；Core 直接使用生成的数据类型与校验器，独立数据签名域保持不变。

Contracts 全量 258 项通过，生成的 48 个产物一致性与 9 个 API 报告检查通过。契约替换后真实安装态/签名/持久观察恢复回归 7 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离测试容器剩余 0。此前本批次 Core 全量 447 项已通过，契约替换后未重复全量。

已完成数据报告独立正式契约；数据观察本身的正式契约、生产生命周期和完整 Enable 仍未完成。验证记录：[正式数据契约验证](../../../../docs/development/verification-2026-09-09-migration-data-contracts.json)。


## 2026-09-09：实际数据观察正式契约

新增 PackMigrationDataObservation，描述明确表范围内的实际计数、空值、重复键组、匹配状态、签名报告及来源 Ref。计数保持十进制字符串并限制为非负 PostgreSQL bigint；校验重复表/列/语义键、计数可能性、聚合匹配一致性、完整报告 binding 和微秒时间顺序。摘要覆盖实际观察与时间，签名仍仅认证预期报告，不认证实际数据。

persistMigrationDataResult 保存前使用正式契约；readRevalidatedDataResult 解析实际 Artifact 时使用同一契约，并继续要求同管理事务的新实际扫描和私有生产者凭证。规范 JSON 或契约校验通过本身不产生可信实际验证、完整领域验证或 Enable 权限。

Contracts 全量 262 项通过，类型、构建、48 个生成产物一致性、9 个 API 报告通过；真实 PostgreSQL/Cosign 安装态与签名回归 7 项通过，覆盖非法持久计数拒绝及原有数据漂移/恢复。Core 类型、构建、2 个 API 报告通过；隔离测试容器剩余 0，本批未重复 Core 全量。

数据观察正式契约缺口已补齐；结构观察契约、结构与数据统一装配、完整领域/回填/投影验证、生产生命周期、ObjectStore 和 Enable 仍待实现。ABH 整体目标继续保留。验证记录：[实际数据观察契约](../../../../docs/development/verification-2026-09-09-migration-data-observation.json)。


## 2026-09-09：安装态结构与数据统一核验

新增 verifyInstalledMigrationState，将两个独立签名预期装配到同一安装快照、同一管理事务和同一目标只读 REPEATABLE READ 事务。包、计划、环境、部署版本与所有者来自当前安装；每次准入重新验证安装和影响报告。数据扫描期间及结束后重读结构签名预期并固定比较签名者配置，随后再次认证数据预期；分别保留原有结构/数据观察的持久化生产者凭证。

目标连接的后端进程、事务起始时间、快照和事务模式在准备及返回时比较，中途结束并重启目标事务会拒绝。返回的 matched 是结构范围和明确数据不变量的合取，不表示完整领域/回填/投影完成。来源与安装权威仍必须在管理事务中保留准入 fences，宿主负责目标连接生命周期。

真实 PostgreSQL/Cosign 安装迁移集成测试通过（1 个顶层测试内含联合核验用例），覆盖合法组合、结构通过而数据空值导致总体失败、数据阶段结构来源撤回、目标事务中途重启，以及既有迁移执行/恢复和到期拒绝回归。Core 类型、构建、2 个 API 报告通过；隔离测试容器剩余 0。长集成夹具的常规证据有效期调整至 180 秒，显式短期到期拒绝用例保留。本批未重复 Core 全量。

结构/数据统一检查入口已补齐；组合观察的持久化恢复、结构观察正式契约、完整领域/回填/投影验证、生产执行生命周期、ObjectStore 和 Enable 仍待实现。ABH 其他模块的整体设计缺口继续保留。验证记录：[统一安装态核验](../../../../docs/development/verification-2026-09-09-migration-state.json)。


## 2026-09-09：联合迁移观察持久化与实际恢复

verifyInstalledMigrationState 现在为原始联合结果记录私有生产者身份、两个原始子结果身份、不可变观察副本和稳定命令 ID。新增 persistMigrationState，将结构/数据观察及四个签名来源 Ref 保存到同一规范 Artifact；命令重试返回同一 Ref，同时重查当前来源准入。复制、篡改和替换子结果不能获得联合生产者凭证。

新增 readRevalidatedMigrationState，锁定联合观察及四个预期来源，在当前管理事务中要求重新执行同目标事务的结构/数据核验。恢复比较完整观察、签名报告、摘要、来源与所有者，只允许两次验签时间变化；校验时间顺序及报告有效期，不重放迁移 SQL。旧事务联合结果和真实数据漂移不能恢复旧观察，不匹配观察可保存并恢复为不匹配。

真实 PostgreSQL/Cosign 安装迁移测试通过（1 个顶层集成测试包含上述用例），覆盖稳定重试、来源撤回、原始身份检查、合法恢复、旧事务拒绝、数据漂移拒绝与不匹配恢复，并保留原有安装、执行、签名到期及目标事务重启回归。Core 类型、构建和 2 个 API 报告通过，隔离测试容器剩余 0；本批未重复 Core 全量。

联合观察目前为内部格式，结构和联合观察的正式契约、ObjectStore 大结果、完整领域/回填/投影验证、生产安装生命周期和 Enable 仍待完成。宿主继续负责来源 fences 和目标连接生命周期；单次范围核验不能替代 ABH 整体设计验收。验证记录：[联合观察恢复](../../../../docs/development/verification-2026-09-09-migration-state-recovery.json)。


## 2026-09-09：迁移检查目标连接生命周期

新增 inspectMigrationTarget，接管新建独占目标连接。使用 DISCARD ALL 拒绝已有事务，创建只读 REPEATABLE READ 快照，固定目标进程、事务起点和快照，在检查返回后再次确认并回滚。无论成功、错误、取消或超时，均调用宿主销毁专用连接池；只有销毁确认后才返回观察结果。销毁等待限制为 1 秒，失败或未确认不能返回成功。查询代理在任务停止后拒绝迟到回调的新查询，组合管理事务取消和调用方取消。

真实安装态联合核验的成功路径已通过该入口运行，并继续完成联合观察持久化与实际恢复。生产宿主仍负责提供独占连接与真实销毁实现，此入口不提供 SQL 沙箱、目标连接创建配置、安装 Worker 或 Enable。

目标生命周期及安装态 PostgreSQL/Cosign 联合回归 7 项通过；补齐资源回收用例后生命周期专项 9 项通过（两次命令覆盖有重叠，不累加为 16 项）。覆盖已有事务拒绝、事务替换拒绝、只读写入拒绝、取消迟到回调、取消执行中查询、无响应回调到期、销毁失败与销毁不确认。Core 类型、构建、2 个 API 报告通过；隔离测试容器剩余 0，本批未重复 Core 全量。

完整领域/回填/投影验证、结构与联合观察正式契约、ObjectStore、生产安装调度和 Enable 仍待完成，整体 ABH 目标保持未完成。验证记录：[检查目标生命周期](../../../../docs/development/verification-2026-09-09-migration-inspection-target.json)。


## 2026-09-09：检查目标延迟查询派发保护

复核锁定的 postgres 3.4.9 驱动发现，PendingQuery 在 await/then/游标消费时才派发，原先仅在创建查询时检查生命周期不足。inspectMigrationTarget 现在在实际查询 handler 再次检查活动状态；拒绝使用当前 Query 的 reject 回调，兼容游标接管错误处理。任务结束前创建、结束后消费的普通、unsafe/simple、values 和 cursor 查询不能触及已关闭目标。

驱动 file 接口会在异步读取文件后直接调用底层派发，检查入口因此明确拒绝该接口；实际结构/数据核验仅使用固定查询文本。宿主仍是受信代码，该保护不构成 SQL 或进程沙箱。实现依赖锁定驱动的 PendingQuery 行为，驱动升级必须保留相关真实回归。

生命周期与实际安装、签名、观察保存恢复联合回归 11 项通过，无失败或跳过；Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0。本批未重复 Core 全量。目标连接创建和真实销毁仍由宿主提供；完整领域/回填/投影验证、生产安装 Worker、正式结构/联合观察契约、ObjectStore 与 Enable 仍待完成。验证记录：[延迟查询保护](../../../../docs/development/verification-2026-09-09-migration-lazy-query.json)。


## 2026-09-09：安装核验运行流程

新增 runInstalledMigrationInspection，将管理事务、独占目标生命周期、安装态联合核验和独立观察 Artifact 保存装配为一次调用。输入与回调方法在进入异步流程前固定；新观察在目标回滚/销毁确认及管理事务提交后保存。恢复模式从实际 Artifact 读取旧观察，在当前事务与受控连接上重新核验，不重放迁移 SQL，并返回同一观察 Ref。

联合核验私有凭证新增具体目标连接身份。运行流程检查回调结果来自当前管理事务及其受控目标，不能用普通对象或其他事务结果代替。目标清理由流程接管：输入准备或管理事务准入失败时也执行有界销毁，正常交接后由检查原语负责销毁。

实际生命周期与已安装签名迁移联合回归 11 项通过；扩展启动失败专项 11 项通过（两次命令覆盖有重叠，不累加）。覆盖实际新观察保存、稳定重试、旧观察恢复、数据漂移拒绝、不匹配恢复，以及事务启动前到期、输入快照失败、伪造回调结果拒绝和目标清理。Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0；本批未重复 Core 全量。

运行入口仍是内部安装核验流程，宿主提供受控目标和真实安装核验回调；尚无完整生产安装 Worker/任务发现、领域/回填/投影完成证明、ObjectStore 大结果、正式结构/联合观察契约和 Enable。持久保存失败后可以重新检查实际状态，无自动迁移 SQL 重放；整体 ABH 目标继续保持未完成。验证记录：[安装核验流程](../../../../docs/development/verification-2026-09-09-migration-inspection-run.json)。


## 2026-09-09：Staged 安装恢复发现

新增 discoverStagedPacks，为同组织 Pack 管理流程按不可变 deploymentVersion 有界扫描实际 Staged 安装。每页最多 100 个扫描记录，使用 InstalledPackOwner 检查记录、Manifest 摘要与物理列一致性。内部数字游标仅供管理恢复使用；隐藏记录仍消耗扫描名额并保留后续游标，扫完后可重新开始一轮。

调用要求当前组织级数据影响管理 Grant，持有组织、主体、Grant 与部署提供的来源 fences。空页同样执行部署准入；返回前重验当前准入和 Grant，回调期间撤权会拒绝。来源可见性独立裁剪，传给回调的是副本。此入口返回发现候选，不产生工作租约、迁移完成证明或 Enable；后续阶段仍须认证签名、安装、环境、部署与来源。

真实 StagePack 后调用发现入口，额外构造一致的存储行仅用于分页及跨租户隔离验证，不能被解释为额外包已通过签名或执行准入。实际发现与原有安装签名/执行/核验/恢复联合测试通过（1 个顶层集成测试包含上述用例）；Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0，本批未重复 Core 全量。生产安装 Worker/租约、影响报告选择、完整领域/回填/投影验证、ObjectStore 和 Enable 仍待完成，ABH 整体设计目标不变。验证记录：[Staged 安装发现](../../../../docs/development/verification-2026-09-09-staged-pack-discovery.json)。


## 2026-09-09：当前影响报告唯一选择

新增 selectCurrentPackDataImpact，以完整安装 Ref、环境摘要和部署版本筛选当前有效的持久报告，最多读取两个候选以区分 Missing、Ambiguous 与唯一候选。多个候选不会按时间或 ID 任意选取。Missing/Ambiguous 只是恢复提示，不表示迁移不适用、完成或可 Enable；无候选时也必须执行选择准入。

唯一候选通过 recoverImpactCheckedPack 认证实际签名 Bundle、来源 Artifact、治理、安装内容及当前部署。选择准入结束后再次完整恢复认证，比较报告与安装一致性；最后在已持有的部署锁下重查候选集合，拒绝新增歧义或绑定变化。宿主选择准入需授权发现并按顺序保留所有后续影响报告治理 fences。

验证覆盖真实签名持久报告的唯一选择、其他环境 Missing、无结果时准入拒绝，以及第二次真实记录同一报告后的 Ambiguous。返回前来源撤回测试与已有安装/执行/核验/恢复联合回归通过（1 个顶层集成测试包含上述用例）；Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0。本批未重复 Core 全量。生产安装调度与工作租约、完整领域/回填/投影验证、ObjectStore、正式结构/联合观察契约和 Enable 仍待实现，ABH 整体目标保持未完成。验证记录：[影响报告选择](../../../../docs/development/verification-2026-09-09-impact-selection.json)。


## 2026-09-09：安装只读检查 Worker

新增 runPackInspectionWorker，按页发现当前 Staged 安装，固定同组织 Service 身份，持续刷新上下文；宿主准备唯一影响报告、明确预期及独占目标后，直接调用实际安装核验/保存/恢复流程。回调返回结果必须匹配当前候选的安装 Ref、包摘要、管理事务和受控目标连接。Missing/Ambiguous 计数只作诊断，不代表完成；实际观察 Ref 可通过有界通知回调交给宿主持久登记。

取消、上下文刷新失败、任务参数准备失败时清理尚未交接的目标；准备回调取消后才返回的目标也执行销毁。任务参数和回调在交接前固定，清理责任随后转给 runInstalledMigrationInspection。Worker 只运行只读核验，不创建执行租约、不重放迁移 SQL；并行 Worker 可以重复观察，后续状态仍依赖实际 Artifact 与当前重验，不能使用内存游标推进 Enable。

真实 Service 场景从发现进入已有联合观察恢复，并验证保留原 Artifact Ref；身份切换拒绝并销毁目标，准备期间取消的迟到目标得到清理。Core 全量在本 Worker 修改前执行，458 项通过、无失败跳过；本次 Worker 及既有安装/签名/执行/核验/恢复集成通过（1 个顶层测试含多个实际场景），Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0。本入口尚未作为生产默认托管服务安装；完整安装调度/租约、领域/回填/投影证明、ObjectStore、结构与联合观察正式契约及 Enable 仍待完成。验证记录：[安装检查 Worker](../../../../docs/development/verification-2026-09-09-pack-inspection-worker.json)。


## 2026-09-09：安装检查的租户宿主装配

TenantRuntimeOptions 新增显式可选 packInspection。createTenantRuntimeLoops 将检查 Worker 纳入与其他循环相同的组织/Workspace/acting organization 绑定及 joinRuntimeLoops 取消监督；未配置时不创建 Pack 检查循环。检查身份仍要求同组织管理用途 Service，不从其他用途的 Worker 身份推导权限。

宿主/服务关闭测试验证可选安装、无响应身份源被取消、错误用途/主体在调用准备前拒绝，并保留既有同伴失败、HTTP 停入站、排空和依赖关闭顺序回归。真实安装场景改为通过租户宿主生成的 Pack 循环完成联合观察恢复并退出。该集成只启动实际 Pack 循环，其他循环各有既有测试，不能据此证明全部生产 Worker 同时运行。长集成上下文有效期从 60 秒调整至 180 秒，独立超时/到期拒绝用例保留。

宿主/服务回归 12 项和真实安装集成 1 项通过，无失败或跳过；Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0，本批未重复全量。生产默认配置、真实 Secret/身份提供器和所有 Worker 联合运行仍待完成；本装配不执行迁移 SQL，不产生租约或 Enable。完整领域/回填/投影验证、ObjectStore 和正式结构/联合观察契约继续保留为缺口。验证记录：[安装检查宿主](../../../../docs/development/verification-2026-09-09-pack-inspection-host.json)。


## 2026-09-09：Pack 检查宿主配置固定

createTenantRuntimeLoops 在生成循环时固定 Pack 检查配置，而非等循环启动后重新读取 input.packInspection。Grant 列表深复制，身份源、发现准入、准备和通知方法保存原方法并绑定接收者，页大小、周期与期限也固定。运行期间依旧通过原治理回调查询当前权威状态；配置快照不冻结真实 Grant 或治理有效性，也不隔离回调内部可变状态。

新增方法私有字段接收者及配置替换回归；真实安装场景在循环创建后替换身份源、准备、可见性、Grant 列表和页大小，验证已安装循环仍走原始签名/治理与观察恢复流程。宿主/服务测试 13 项和真实安装集成 1 项通过，无失败或跳过；Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0。本批未重复 Core 全量。该修改只覆盖 Pack 检查配置，其他循环的配置生命周期需要分别核对。

生产默认配置、完整领域/回填/投影验证、迁移执行租约、ObjectStore、结构与联合观察正式契约、Enable 及 ABH 其他模块的整体缺口仍待完成。验证记录：[宿主配置固定](../../../../docs/development/verification-2026-09-09-pack-host-snapshot.json)。


## 2026-09-09：执行与检查共享延迟查询保护

抽取 guardMigrationConnection，统一用于 inspectMigrationTarget、executeNewMigrationClaim 及 executeInstalledMigrationClaim 给宿主回调的连接。查询创建和 postgres 3.4.9 PendingQuery 实际派发两处均检查生命周期，当前游标拒绝回调保持有效；异步 file 加载执行入口拒绝。执行停止后的回调查询不能因提前创建而越过连接关闭边界。

新增真实安装态执行回调先创建查询、等实际 COMMIT 与连接关闭后才消费的回归，要求 DEPENDENCY_TIMEOUT。既有实际提交、丢失 COMMIT 响应保留 Unknown、角色提升拒绝、超时清理、检查游标/延迟消费和安装观察恢复一并回归。真实 PostgreSQL/Cosign 联合回归 26 项通过，无失败或跳过；Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0，本批未重复 Core 全量。该共享保护仍依赖锁定驱动行为，受信宿主可以持有原连接，因此不是沙箱或 SQL 解析器。

完整迁移执行 Worker/租约、领域/回填/投影验证、生产默认装配、ObjectStore 与 Enable 仍待完成，ABH 整体目标保持未完成。验证记录：[迁移执行延迟保护](../../../../docs/development/verification-2026-09-09-migration-execution-guard.json)。


## 2026-09-09：执行结果捕获最终准入

persistMigrationExecutionResult 在实际 Artifact 读回后增加最终捕获准入，并比较实际 sourceRefs 与原始证据来源；期限/取消配置在入口固定并在提交前检查。最终准入失败会回滚新建 Artifact，不会进入独立维护观察写入；已有 Artifact 重试也必须通过最终准入。此处准入仍是独立结果捕获权限，不要求已撤回的 SQL 执行权限重新有效。

真实 PostgreSQL 执行回归 14 项通过，无失败或跳过。实际丢失 COMMIT 响应用例验证已提交数据仍存在、OutcomeUnknown 不变，读回期间撤回捕获准入时新 Artifact 与维护观察均未留下；之后合法重试只保存证据，不重放 SQL。重试读回后撤权同样拒绝，原有日志保持一条。Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0。本批未重复 Core 全量。

完整执行 Worker/租约及执行到捕获的生产调度仍待实现，领域/回填/投影验证、ObjectStore、正式结构/联合观察契约与 Enable 保持未完成。验证记录：[执行捕获最终准入](../../../../docs/development/verification-2026-09-09-execution-capture-admission.json)。


## 2026-09-09：维护日志恢复的持续准入

recoverMigrationObservation 在维护事务获得锁后的准入和提交前准入中重新执行恢复权限检查，并重读实际执行 Artifact、重新比较完整记录。签名恢复继续在这些检查后执行当前捕获签名认证，避免最初合法读取被当作整个锁等待期间持续有效。调用的期限配置也在入口固定。

新增实际提交但丢失 COMMIT 响应场景下的恢复撤权回归：锁后权限撤回、锁后来源撤回以及维护提交前权限撤回均拒绝；合法恢复返回原 Artifact/观察，日志仍仅一条，SQL 不重放。执行回归 14 项与真实安装/签名恢复集成 1 项通过，无失败或跳过；Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0，本批未重复 Core 全量。恢复准入必须保留当前权限 fences，且重复调用保持幂等；读回不是数据正确性或 Enable 证明。

生产执行调度/租约、完整领域/回填/投影验证、ObjectStore、结构与联合观察正式契约及 Enable 仍待完成。验证记录：[维护恢复准入](../../../../docs/development/verification-2026-09-09-execution-recovery-admission.json)。


## 2026-09-09：专用迁移连接工厂

新增 connectMigrationTarget，由受信部署 URL 创建仅含一个连接的新池并独占 reserve，返回幂等 dispose。连接建立受调用期限/取消控制，失败销毁池；连接配置/驱动错误映射为 Core 错误，不返回包含端点或认证信息的驱动诊断。调用成功后的连接归执行/检查生命周期所有，获取阶段取消不会替代后续生命周期的取消机制。

真实检查生命周期和已安装迁移的 createTarget 已使用该工厂。测试覆盖无响应 PostgreSQL 握手被取消和到期后套接字关闭、重复销毁、错误凭据隐藏，以及原有只读快照、延迟查询、执行与观察恢复。生命周期专项 13 项与真实安装集成 1 项通过，无失败或跳过；Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0，本批未重复全量。URL 必须由宿主部署配置提供，不能接受 Pack 自带连接配置；该工厂不授予权限，角色/同库/Schema 权限仍由实际迁移准入验证。

Secret 提供器、默认生产配置、完整执行 Worker/租约、领域/回填/投影验证、ObjectStore、结构与联合观察正式契约及 Enable 仍待完成。验证记录：[专用迁移连接](../../../../docs/development/verification-2026-09-09-migration-target-connect.json)。


## 2026-09-09：迁移连接显式身份绑定

connectMigrationTarget 要求部署 URL 显式包含用户名和数据库，避免驱动回退到进程默认身份/数据库；解析百分号编码后，在返回专用连接前查询 session_user、current_user 和 current_database，与显式目标比较。数据库查询参数覆盖等导致实际身份不一致时拒绝并销毁池。实际身份检查包含在获取连接的期限和取消范围内。

真实 PostgreSQL 生命周期专项 13 项通过，无失败或跳过，覆盖省略身份/数据库拒绝、百分号编码用户名正确解析、查询参数把目标数据库替换为 postgres 后拒绝，以及原有超时、取消、清理和延迟查询。Core 类型、构建、2 个 API 报告通过；隔离测试容器剩余 0。本批未重复完整安装或 Core 全量。

显式连接身份不替代持久 Schema 所有权、同库证明或角色权限准入。部署 Secret、生产默认配置、完整执行 Worker/租约、领域/回填/投影验证、ObjectStore 及 Enable 仍待完成。验证记录：[连接身份绑定](../../../../docs/development/verification-2026-09-09-migration-target-identity.json)。


## 2026-09-09：逐 Pack 安装阻塞诊断

PackInspectionWorker 新增可选 onBlocked(candidate, reason, options)，逐项报告 Missing 或 Ambiguous，保留原有分页计数；Ready 的检查结果和证据 Ref 继续通过 onObservation 返回。通知只提供恢复诊断，不是持久验证证据。宿主在创建循环时固定回调并保留原接收者；Worker 传入候选副本，并限制通知的期限和取消。通知失败仍让循环失败并交由宿主管理，不吞掉诊断故障。

新增真实 Service/数据库回归覆盖两种阻塞、分页计数、禁止产生观察、装配后替换回调无效，以及通知挂起时取消退出。验证结果见[逐项诊断](../../../../docs/development/verification-2026-09-09-pack-inspection-diagnostics.json)。

持久安装 Job、doctor 查询、完整执行 Worker/租约、领域/回填/投影验证及 Enable 尚未完成。


## 2026-09-09：安装检查准备装配

新增 preparePackInspection，组合当前部署的唯一实际影响报告选择、专用连接工厂及签名结构/数据联合检查。Missing/Ambiguous 在创建目标连接前返回；Selected 必须与发现的完整安装记录一致。检查事务内重新选择相同影响 Ref，持有当前部署锁后执行原有真实安装验证，防止把准备阶段选择当作持续有效的凭证。准备阶段固定配置、方法接收者、Grant、签名期望和观察来源。

宿主真实安装恢复用例改用该装配，保留原 Artifact Ref，覆盖缺报告时不打开无效 URL、选择拒绝与配置替换。结果见[准备装配验证](../../../../docs/development/verification-2026-09-09-pack-inspection-preparation.json)。返回 Ready 后，调用者必须运行检查或销毁目标；Worker 已承担该生命周期。

此装配仅处理已声明 SQL 迁移的安装检查，不能将无 SQL 的数据影响标记为完成。生产 Secret、持久 Job/doctor、执行调度/租约、完整领域/回填/投影验证和 Enable 仍未完成。


## 2026-09-09：结构与联合观察正式契约

新增 PackMigrationStructureObservation、PackMigrationStateObservation 及复用的子结果 Schema，沿统一生成链输出验证器、类型、摘要规则和 API 报告。结构证据关闭并限制目录、表、序列、视图、ACL 及详细差异格式；关系校验约束来源 Ref、绑定、签名时间、重复对象与组件匹配状态。联合观察要求同组织、包版本、包摘要、计划、环境及部署，四个来源不同，并递归校验结构和数据观察。

结构及联合观察持久化与恢复已接入正式契约，原有 Artifact envelope 不变。Schema 校验不能替代原始 producer provenance、签名验证、当前权限、真实数据库复查或完整领域验证。RequiresAdditionalVerification 保留在结构结果中，不会因 matched=true 被清除。

新契约接入前 Core 全量 462 项通过；Contracts 全量 266 项通过。最终类型、生成链、API 和真实安装恢复证据见[观察契约验证](../../../../docs/development/verification-2026-09-09-migration-observation-contracts.json)。本批将结构与联合观察格式从内部 JSON 提升为正式契约；生产 Job/doctor、执行租约、领域/回填/投影验证、ObjectStore 与 Enable 仍未完成。


## 2026-09-09：持久联合观察发现

新增 discoverMigrationState，按当前组织、Pack owner 和四个精确来源查询 Available 的 JSON Artifact，并在有界页内读取实际字节、验证摘要和正式联合观察契约。只返回目标包摘要、环境、部署匹配的观察 Ref、时间和 matched；其他环境占扫描槽位，不能让游标跳过潜在结果。UUID 游标仅供内部恢复使用。ArtifactStore 提供按 owner/source 的内部 keyset 扫描，权限由上层发现准入和逐 Artifact 读取准入承担。

查询开始及返回前均验证管理 Grant/准入，空页也不得绕过权限；先保留权限 fences，再锁定整页 Artifact 与四个来源。不会按时间或顺序替多条结果选一个，返回 Ref 只用于下一步 readRevalidatedMigrationState 真实状态复查，不能证明签名持续有效、当前数据库正确或 Enable。数据库扫描仍受事务期限约束，尚无专用生产观察索引。

真实安装宿主恢复改用发现出的 Ref。新增验证覆盖唯一观察、环境不匹配、非法边界、缺 Grant、读取拒绝、最终准入撤回、空查询拒绝、重复 Artifact 分页及墓碑过滤。结果见[持久观察发现验证](../../../../docs/development/verification-2026-09-09-migration-state-discovery.json)。生产自动选择/调度、持久 Job/doctor、领域/回填/投影验证、ObjectStore 和 Enable 仍未完成。


## 2026-09-09：有界观察选择与自动恢复装配

新增 selectMigrationState：完整有界页中的唯一结果才返回 Selected，无匹配返回 Missing；已发现多个匹配返回 Ambiguous，仍有未扫描内容且匹配数不足两个则返回 Incomplete。单页最多读取 100 个候选，零个或一个匹配不能在扫描截断时证明不存在或唯一。选择仅为当前发现时刻的恢复提示，不是持久租约；后续仍执行真实证据与目标状态复查。

preparePackInspection 新增显式 recoveryDiscovery 配置，与手动 recovery Ref 互斥。唯一观察进入原 Ref 恢复，完整扫描无观察进入新的实际检查；多观察和截断分别返回 ObservationAmbiguous、ObservationSearchIncomplete，均在创建目标连接前返回。Worker 将这两类阻塞传给 onBlocked，并在 onPage 独立计数。配置在准备入口固定。

真实安装用例的首次观察与宿主重启恢复均使用此装配；重复真实 Artifact 场景验证两类阻塞不会打开无效目标 URL，截断且没有当前环境匹配也不会误报 Missing。证据见[观察选择与自动恢复](../../../../docs/development/verification-2026-09-09-migration-state-selection.json)。严格恢复中发现旧证据与当前状态不一致仍拒绝，不自动替旧证据生成新事实。

生产默认配置/配额、持久 Job/doctor、观察索引、执行租约、领域/回填/投影验证、ObjectStore 与 Enable 仍未完成。


## 2026-09-09：观察发现索引与就绪约束

新增第 51 批数据库迁移：data.artifacts 的 owner_lookup/sources_lookup 为 PostgreSQL 存储生成列，使用 JSONB 等值哈希；部分 B-tree 索引按组织、owner/source 查找键和 Artifact id 排序，只包含未删除 Available JSON Artifact。查找仍保留完整 owner/source JSON 等值条件、目的与 workspace 范围，哈希只定位候选，内容完整性仍由原 SHA-256 验证。JSON 数字 1 与 1.0 的等值表示不会因文本不同而漏查。

实际 RLS 执行计划证明普通表达式索引只利用组织条件，因此最终实现使用存储生成列；未修改 RLS、函数泄漏属性或运行身份权限。就绪校验登记并验证生成表达式、类型、索引完整定义、所属表/Owner 及 valid/ready/live 标志。缺索引、同名弱索引或普通列替代均拒绝启动；应用不能写入生成列。

真实 PostgreSQL 测试使用 4,000 个其他 owner 的 Artifact 存储夹具、100 项来源列表，以及实际生产 scanOwnedSources 查询。首查询、游标后续空页和 JSON 等值表示变化后的查询均使用 owner/source 索引条件，未额外过滤行。现有数据库安全与真实安装恢复同时回归，结果见[观察发现索引验证](../../../../docs/development/verification-2026-09-09-artifact-discovery-index.json)。

生成列迁移会计算既有记录的派生值并构建索引；尚未验证生产规模迁移窗口或生产负载 SLO。持久 Job/doctor、生产调度/租约、领域/回填/投影验证、ObjectStore 与 Enable 仍未完成。


## 2026-09-09：Pack 检查租约 Owner 装配

新增 claimPackInspectionLease、renewPackInspectionLease、releasePackInspectionLease 和 requirePackInspectionLease，复用 runtime.work_leases 唯一租约来源及现有 Command/Receipt/Audit 事务。管理 Service 必须拥有当前组织的 data-impact Grant，实际 Staged 安装记录须与候选完整一致；各次租约变更前后重新验证。工作占用不授予 SQL 执行、迁移完成或 Enable 权限。

同 Worker 的重复有效认领不续期、不增加 token；其他 Worker 竞争被拒绝。续约更新 Ref 版本且保持 fencing token，释放后接管增加 token。require 检查按当前 token 识别所有权，旧 Worker 迟到操作不能借旧 Ref 或队列回执继续。调用提交前检查时，调用者须先获取其余 control/deployment 锁，再获取租约聚合锁；租约上限仍是 30 秒。

实际安装记录/Service/Grant 测试覆盖重复与竞争认领、失效候选、缺 Grant、Human 拒绝、续约 CAS、释放和接管后旧 token 拒绝；并回归通用租约的真实数据库时间过期和身份撤回。证据见[Pack 检查租约验证](../../../../docs/development/verification-2026-09-09-pack-inspection-leases.json)。

本批完成租约 Owner 操作及检查入口，尚未把周期心跳、失租取消、结果事务 fencing 和退出释放装入 PackInspectionWorker。持久 Job/doctor、生产调度、完整领域/回填/投影验证、ObjectStore 与 Enable 仍未完成。


## 2026-09-09：检查与观察结果事务 fencing

InstalledMigrationInspectionRun 新增显式 lease 绑定，经 preparePackInspection 和 Worker 固定传递。真实检查/恢复完成且专用目标已关闭后，在管理事务提交前验证当前租约；新观察的独立 Artifact 事务在 Command 准入和最终读回后再次检查。检查使用实际 producer 的 ownerRef 与包摘要约束租约目标，不能借其他 Pack 的有效租约提交。租约 Ref 版本可因续约变化，所有权仍由实际 fencing token 判断。

真实集成发现 Pack 治理锁先于原 DurableExecution 租约锁会违反全局锁顺序，因此 WorkLeaseOwner 对 installed-pack 目标统一使用后置 WorkLease 聚合命名空间；所有认领/续约/释放/检查使用同一键，其他目标维持既有顺序。没有放宽锁顺序检查。

实际 Service 宿主恢复使用显式租约，并验证准备期间更换 token 配置不会重定向检查。另验证释放后旧租约恢复拒绝、实际 Artifact 写入期间租约到期导致事务回滚、合法新 token 重试只保留一份观察、旧 token 即使重放已有 Artifact 仍拒绝，以及错误 Pack 绑定拒绝。证据见[检查结果 fencing](../../../../docs/development/verification-2026-09-09-pack-inspection-fencing.json)。

本批只在显式提供 lease 时启用这些检查；Pack Worker 的自动认领、周期心跳、失租取消和退出释放仍待装配。Control fences 当前使用排他行锁，后续心跳调度必须考虑检查事务的锁占用及租约期限，不能假设可以在持锁期间无限续约。持久 Job/doctor、完整领域/回填/投影验证、ObjectStore 与 Enable 仍未完成。


## 2026-09-09：Pack Worker 租约生命周期

PackInspectionWorker 新增可选 lease 配置，workerId 标识运行实例，默认每 10 秒续约 30 秒租约。每个候选先认领，再进入准备、真实检查和观察事务；实际租约绑定由 Worker 注入并使用既有提交 fencing。竞争认领通过明确的 WorkLeaseBusyError 区分，不吞掉其他权限/存储错误；仅认领竞争转为 LeaseBusy 诊断与分页计数，已进入工作后的错误仍传播。宿主创建循环时固定租约配置。

新增 withPackInspectionLease 生命周期：续约失败或本地租约期限到达会取消 scoped signal；操作期限取单次预算与已知租约期限的较早者，不因心跳无限延长。退出时停止并等待续约，再用独立的 10 秒清理期限取得同一 token 的最新 Ref 版本并释放，避免续约提交/取消竞态。已过期或被接管的旧 token 不释放新所有者；其他清理失败保留错误，未能释放的租约仍由数据库期限回收。

真实测试覆盖续约 Ref 版本增长、双实例竞争、实际接管后的旧任务取消且新租约保留、Worker 准备取消后释放、宿主配置替换无效，以及自动认领后恢复原观察并释放。手动 run.lease 与 Worker 自动 lease 不可混用。证据见[Worker 租约生命周期](../../../../docs/development/verification-2026-09-09-pack-inspection-lifecycle.json)。

此能力由显式配置启用，不是持久安装 Job 或默认生产服务。Control fences 的排他锁可能延迟续约，工作仍受既有租约和事务期限限制；生产心跳容量/延迟 SLO 尚未验证。持久 Job/doctor、完整领域/回填/投影验证、ObjectStore 与 Enable 仍未完成。

本批最终 Core 全量 463 项通过，无失败或跳过；类型、构建与 API 检查通过。清理只忽略 WorkLeaseNotCurrentError 这一明确失去所有权的结果，其他权限/完整性/上下文错误继续传播；非 Error 的抛出值也保留。专项日志在最终清理错误分类前生成，最终源代码以本批全量日志为准。


安装检查进度已具有正式 PackInspectionJobRecord 契约和内部 validatePackInspectionJobTransition 前后快照一致性检查。该函数不执行数据库 CAS、权限、租约或 Artifact 来源验证；持久 Job Owner/Worker/doctor 装配仍待完成。Succeeded 保存实际 matched，不代表安装启用。


安装检查 Job 已有 extension.inspection_jobs 存储表及内部 PackInspectionJobOwner 读取/有界扫描接口，扫描包含到期非终态以便后续终结。读取和扫描均要求调用方提供当前准入检查；它们不是写入 Owner，也不证明 Artifact 来源或租约有效。创建与状态迁移 Command、事务 CAS、Audit/Outbox、Worker/队列/doctor 仍待装配。


requestPackInspection 已通过内部 RequestPackInspectionCommand 创建 Pending Job；要求独立 abh.packs.request-inspection Grant 和宿主当前环境/部署准入，原子写入 Job、回执、Audit、Outbox。重放核对当前进度中的不可变请求字段，保留原创建 Ref。状态迁移、队列/Worker/doctor 与实际观察证据装配仍待实现。


startPackInspection 使用内部 StartPackInspectionCommand 执行 Pending/Waiting → Running，要求当前 Service、独立启动 Grant 和实际 Pack 租约，原子写入 CAS/回执/Audit/Outbox。尝试累计、耗时保留；每个 Pack 至多一个 Running Job。重放不重开已推进状态，也不绕过当前租约。Waiting/终态、耗时结算与 Worker 装配仍待完成。


expirePackInspection 使用独立当前管理权限与数据库时钟收尾到期/耗尽 Job，无需旧 Worker 租约存活。原 Job 快照和计算过程写入正式诊断 Artifact，与 Failed/CAS/回执/Audit/Outbox 原子提交。Running 墙钟耗时累计，Pending/Waiting 不计工作耗时；重放读取原证据、不重复结算。此入口不证明 Worker 已停止，也不代替未到期失租恢复、成功验证或 Enable。


completePackInspection 使用原始安装检查对象和观察 Artifact 执行 Running → Succeeded，拒绝复制对象及旧检查冒充当前运行。读取并锁定观察及四个签名来源，保留真实 matched，支持实际复查后的等价旧 Ref；最终来源/租约检查后结算累计耗时。CAS/回执/Audit/Outbox 原子提交，不代表领域验证齐全或 Enable。Waiting/取消/一般失败及 Worker/队列/doctor 装配仍待完成。


preparePackInspection 的真实阻塞返回具有私有来源证明；waitPackInspection 要求原始结果、当前执行人、精确 Running 版本和实际租约，原子写入 Waiting 诊断/回执/Audit/Outbox。预算不足拒绝 Waiting，最终准入耗时计入累计预算。onBlocked 普通通知不传递来源证明，持久 Job 装配需直接使用准备结果。取消/一般失败和持久 Worker/队列/doctor 仍待实现。


cancelPackInspection 要求独立管理权限、实际取消依据 Artifact 和宿主语义准入，原子保存终结诊断/CAS/回执/Audit/Outbox。Human/Service 可终结非终态；已耗尽时长保留 Failed/BudgetExhausted。取消不操作旧租约或声称旧进程已停止，重放不重复结算。一般失败、持久 Worker/队列/doctor 与生产治理装配仍待完成。


waitPackInspection 在真实阻塞发生于最后一次允许尝试时提交 Failed/BudgetExhausted，附 PackInspectionRetryExhaustedEvidence；有剩余尝试才进入 Waiting。两种分支保留原阻塞和累计耗时、执行事务 CAS/诊断/Audit/Outbox，终态重放不重开。最后一次成功检查仍可正常 Succeeded。


runPackInspectionJob 已装配单个精确 Pending/Waiting Job：当前权限读取、租约生命周期、Start、实际准备/检查、Waiting 或 Complete、预算取消与退出清理。已提交 Running 的异常保留进度用于显式收尾；不隐式重开旧投递或终态。持久扫描/队列投递确认、一般失败、失租恢复与 doctor 仍待实现。


## 2026-09-09：巡检 Job 旧投递的当前进度解析

新增 PackInspectionJobOwner.readCurrent：以投递 Ref 为最低版本提示读取实际记录，拒绝未来版本，并复用组织隔离、管理上下文、存储字段一致性和当前准入检查；原 read 保持精确版本语义。

resolvePackInspectionDelivery 读取真实 Job 后区分 Execute、Progressed、Running、Terminal、Expire。只有投递版本与当前 Pending/Waiting 精确一致才返回 Execute；旧投递遇到新 Waiting 不直接启动下一次尝试。非终态预算使用数据库时间与既有累计耗时规则判定，超时优先交给正式 Expire 命令；终态同样需要宿主授权读取。结果只是快照，后续命令仍执行 CAS、权限和租约检查。

验证覆盖真实 PostgreSQL 中的精确可执行版本、旧版本推进、未来版本拒绝、Running 保留、绝对到期、运行耗尽时长、终态读取拒绝和跨租户隔离。本批不增加队列确认或自动重试；持久发现/投递/确认 Worker、一般异常失败、未到期失租恢复和取消通知仍待完成。不能把 Running 或 Progressed 当作执行成功，也不能仅凭此快照证明检查通过或 Enable。


## 2026-09-09：持久巡检 Job 管理恢复 Worker

新增 runPackInspectionJobWorker，并通过 TenantRuntimeOptions.packInspectionJobs 可选装配。Worker 从 extension.inspection_jobs 分页发现非终态，只保留宿主当前可见的 Job；即使空页也检查实际组织级 data-impact 管理 Grant 与发现准入。随后逐项读取当前进度，检查启动 Grant 与读取准入，再调用正式执行或到期命令。隐藏记录仍消耗扫描槽位，游标可在进程重建后从头恢复。

Pending/Waiting 的精确版本执行一次，下一轮扫描才发现后续 Waiting 版本；Running 未到期保持原状。租约竞争跳过本次候选，版本冲突必须重新读取并确认 Job 已推进才能跳过。准备超时后重新用数据库时间判定，实际预算耗尽则提交正式 Expire 与证据，其他异常继续交给运行时监督器。所有页面之间都有可取消间隔，不以循环计数、回调或游标保存业务进度。

宿主装配前固定回调 receiver、配置、Grant 与诊断参数，上下文刷新固定组织和执行人。停止时使用既有执行器的取消与租约清理；仍不保证跨进程取消已经到达所有活跃检查。发现、解析和执行各自有短事务，检查不进入 Inbox 消费事务。

这部分提供数据库恢复调度；尚未接入 Job 队列投递/确认，也未完成一般 InspectionFailed、未到期失租恢复、doctor、领域/回填/投影验证与 Enable。


## 2026-09-09：巡检 Job 队列契约与冻结路由

JobEnvelope 新增 abh.pack-inspection-job.advance 与精确 PackInspectionJobRef；DurableExecutionPort.enqueue 登记该目标类型。关系校验要求事件 causeRef/version=1 与原始 commandRef/version=1，拒绝错误 Owner 目标、倒置时间窗口及 Mission/ExecutionAuthority。消息只传递调度意图，管理授权在执行入口重新获取。其他已有 Job 类型与 Wait Port 目标范围保持原契约。

createPackInspectionJobRouter 只接收实际已提交的 requested/wait 事件，在当前 runtime Service 组织范围回读事件并核对完整内容，派生目标版本、causation command、事件 cause 和 event/consumer 去重键。队列时间窗口来自数据库时钟，Waiting 带已安装的重试延迟；窗口不是业务预算。OutboxOwner 在当前发布准入下冻结路由，重放复用原消息。宿主配置与 consumerRef 在创建时固定。

pg-boss 将巡检推进消息映射到 background 队列，以已有原生交付身份、重放与确认机制传输，避免占用 control/reconcile 容量。此变化尚未提供巡检业务消费者；不可把队列适配器完成确认的测试视为真实检查完成。

后续仍需接入实际巡检消费者与 Owner 结果确认、处理长时间工作与 Inbox 短事务边界、可靠恢复和取消；现有数据库恢复 Worker 继续可独立装配。一般 InspectionFailed、未到期失租恢复、doctor、完整安装阶段、领域/回填/投影验证与 Enable 仍未完成。


## 2026-09-09：巡检投递的可靠接收与执行衔接

新增不可变 PackInspectionDeliveryRecord，绑定组织、精确 Job 版本、源事件及摘要、原始命令、数据库接收时间和自身摘要。extension.inspection_deliveries 使用强制租户 RLS、仅 SELECT/INSERT、无 workspace/删除；事件唯一和 Job/version 唯一索引纳入 readiness，数据库清单升级为 54。完整身份 CHECK 拒绝缺字段，不能用孤立接收记录代替实际 Inbox。

createPackInspectionJobConsumer 作为标准 InstalledEventConsumer，只接收真实 requested/wait 事件，同时验证 abh.runtime.consume-event 和新的 abh.pack-inspection-jobs.accept-delivery 权限。它在 Inbox 的事务内调用 PackLoader 写接收记录、Audit 和 Outbox，全部成功后才允许 runDeliveryWorker 确认原生队列消息。接收不是 Succeeded；记录不授予管理执行权限，不启动租约或长时间检查。重放仍检查当前权限、事件内容和已有接收记录摘要。

PackInspectionJobWorker 默认 requireDelivery=true：Pending/Waiting 必须存在精确版本的接收记录及其已提交 Inbox，才进入既有管理权限、租约、Start/Wait/Complete 链路。旧请求版本的接收不能启动更新的 Waiting；Running 不重开；到期清理不要求接收记录。显式 requireDelivery=false 仅用于单独装配的管理恢复模式。Worker 的游标和进程重建不会改变业务预算。

宿主使用已有 publisher.router 接入 createPackInspectionJobRouter，将该 consumer 放入 background DeliveryWorker 的 consumers，并装配 packInspectionJobs。Runtime 的发布/消费/有限接收 Grant 与管理 Worker 的管理 Grant 分别验证；不复用运行时用途执行管理命令。实际检查继续在 Inbox 事务外运行，通过原有 Owner 保存终态与观察。

本批完成调度意图的发布、可靠接收、队列确认与管理执行衔接，不表示整个安装管线已完成。仍缺一般 InspectionFailed、未到期失租恢复、跨进程取消通知、doctor、统一生产配置与背压策略、完整安装阶段和领域/回填/投影验证及 Enable。接收记录、源事件和 Inbox 的清理必须保留未终结 Job 的恢复依据；本批没有实现清理器。


## 2026-09-09：运行中巡检对已提交取消的持续观察

runPackInspectionJob 在正式 Running 后启动只读状态检查，按已配置 heartbeatMs 间隔、在当前同组织/执行人 Context 下检查精确 Running 版本。PackInspectionJobOwner.assertRunning 仅作为内部停止条件，读取最小版本/状态字段，不返回业务记录、不获取 Control/聚合写锁、不授予执行权限。租约心跳和各提交 Owner 继续独立执行实际权限、租约与 CAS 验证。

另一事务提交取消、超时收尾或其他版本变化后，状态检查中止当前准备/检查的有界信号；未主动返回的准备回调不再使 Worker 等到整个 Job 预算耗尽。迟到 Ready 的真实目标沿用既有关闭路径。提交 Wait/Complete 前停止并等待状态检查退出，之后以 Owner CAS 处理竞争，避免将自身正常状态提交当作外部取消。

任务退出前等待检查循环停止，再清理租约；父任务、预算或租约本身的取消保留原错误语义，不被轮询 delay 的 AbortError 替换。这是对持久取消事实的轮询响应，时效受轮询间隔、上下文获取和数据库有界访问影响；并非立即杀死远程进程，也不证明对方已停止全部工作。正式取消预算仍按取消证据中的数据库判定时刻结算。

一般 InspectionFailed、未到期失租恢复、doctor、生产背压和完整安装/领域验证管线仍待完成。


## 2026-09-09：未到期失租的正式失败与可选恢复装配

新增 PackInspectionLeaseLossEvidence 和内部 fail-lost-lease 命令及独立管理权限。证据保存原 Running Job、同一安装目标的实际租约快照、数据库判定时刻、累计耗时、Expired/Replaced 原因及最终诊断。校验原租约身份、版本/token 单调关系、同 token 的 worker 绑定和微秒级到期边界；只有续约导致版本推进而 token 仍有效时，不允许判为失租。

WorkLeaseOwner.observe 在与认领/续约相同的目标锁下读取租约，再读取数据库时间；没有租约行不能作为失租证明。读取同时补上 leaseRef.id 与物理行 id 的一致性校验。failLostPackInspection 在现有 Control、Deployment、Job 和租约锁顺序下调用观察，原子写失败 Artifact、Failed、Receipt、Audit 与 Outbox；保留全部 Running 累计耗时。若判定时已经时长超支或到绝对期限，诊断保留 BudgetExhausted/Expired，否则为 InspectionFailed。终态不重开，也不释放后来接管者的租约。

重放验证实际保存的诊断内容、原 Job 与租约绑定、预算推导、Artifact 字节和当前准入，不要求历史租约仍存活。PackInspectionJobWorker 可显式安装 leaseLoss 准入；Running 候选会调用正式失租检查，只有明确的仍有效租约结果被视为正常保留，其他权限或完整性错误继续上抛。未安装此选项时保留既有到期恢复行为。新 leaseLost 页面计数不作为业务事实。

本批收尾依据是租约过期/被替换，不是异常消息或队列超时；不证明旧进程或远程工作已经停止。一般 InspectionFailed 异常来源、doctor、生产配置/背压、完整安装阶段和领域/回填/投影验证及 Enable 仍待完成。


## 2026-09-09：巡检诊断查询后端

新增内部 inspectPackInspectionJob，作为后续 doctor 的查询后端。在当前 Service 管理 Context、组织级 data-impact 管理 Grant 和宿主当前准入下，读取当前精确 Job；按既有 Deployment/Job/租约锁顺序观察状态，验证已提交 Inbox 接收记录与实际结果 Artifact 字节，仅返回引用及预算摘要。

输出区分 AwaitDelivery、AttemptExecution、ObserveRunning、SettleExpired、SettleLostLease、Terminal，并给出实际当前 Job Ref、已接收记录/租约/证据 Ref、失租原因、数据库判定时间和累计/剩余预算。旧版本提示可解析到最新进度，未来版本拒绝。终态耗时固定为已提交预算，不继续累计；还有剩余预算也不能重开终态。下一步是诊断建议，执行仍需对应命令的当前权限与 CAS；并发提交可在诊断后改变条件。

查询不写业务记录、Receipt、Audit、Outbox，不续租、不入队、不执行修复；当前准入与结果证据读取权限在每次调用中验证。它不证明检查语义完整、Enable 或远程工作已停止。本批未提供 abh doctor CLI/HTTP 路由或生产运维 UI，也未实现一般异常失败。


## 2026-09-09：恢复 Worker 不再依赖启动权限

修复 PackInspectionJobWorker 的进度解析提前检查 start Grant，导致只有到期/失租清理权限的服务无法恢复任务的问题。解析现在检查组织级 data-impact 发现权限和既有宿主读取准入，执行分支仍交给 runPackInspectionJob 检查 Start、实际安装与租约；到期和失租分支分别由正式 Owner 验证各自独立权限。发现授权不允许开始新尝试。

真实夹具分别签发不含 Start 的 expiry-only 和 lease-loss-only 管理 Grant（均保留发现权限），验证未投递到期 Pending 和失租 Running 能正式收尾。同时尝试以 expiry-only Grant 执行未到期 Pending，必须在准备之前拒绝，状态与尝试数保持原值。

本批修复权限装配，不扩展一般异常失败、doctor CLI 或完整安装验证的完成范围。


## 2026-09-09：巡检与共享租户运行时的统一装配

新增内部 installPackInspectionRuntime，接收现有 TenantRuntimeOptions 和巡检安装配置，输出可交给 createTenantRuntimeLoops/runTenantRuntime 的完整配置。它把巡检 requested/wait 路由合入现有 Publisher，使用宿主指定的新组合规则 Ref；把可靠接收消费者合入唯一 background DeliveryWorker；安装固定配置的管理 Job Worker，并强制 requireDelivery=true。

该入口保留一个共享 Publisher 和一个 background 原生领取器，避免独立循环竞争彼此的冻结路由或队列消息。已有消费者和路由继续按原订阅处理，未知事件拒绝；已有巡检 Worker、重复巡检消费者、重叠事件订阅、缺失或多个 background 领取器在装配时拒绝。巡检投递使用独立 runtime Context 并核对消息组织；现有租户宿主继续把各循环绑定到同一组织。

在装配时固定巡检 Worker、Grant、回调 receiver、消费配置和发布入口。创建配置不打开连接、不启动工作、不关闭依赖；宿主原有监督器和 drain 管理生命周期。队列准入目录仍须由宿主登记 abh.pack-inspection-job.advance 及对应 runtime Grants；管理 Worker 的执行/恢复权限继续由各 Owner 检查。本批没有自动签发权限或生成生产连接配置。

验证范围为配置合并、拒绝冲突、原订阅保留、配置替换隔离、组织拒绝与有界停止；实际队列和 Owner 行为沿用此前链路，未将配置测试算作新的端到端数据库验证。一般异常失败、doctor CLI、生产配置/背压及完整安装验证仍待实现。


## 2026-09-09：真实共享运行时、扩展存储启动检查与锁竞争恢复

完整巡检夹具使用新建 runtime 连接、真实 pg-boss 队列和独立运行时 Grant，同时启动 Publisher、Delivery、InspectionJob、Recovery、Consumption 五个循环。验证 requested 事件的冻结路由、持久 Inbox 接收、一次真实签名／目标检查、Succeeded 观察记录、消费覆盖和租约释放；在传输空闲边界停止并检查实际 drain 结果。强制取消已领取工作时保留 remainingRefs 的语义沿用独立关闭测试。

新连接暴露已迁移 Pack 表被启动检查误认作未登记表的问题。现在只有维护登记与实际所有权一致、角色非特权且无角色继承、runtime／queue／verifier 对 Schema、表、列、序列均无访问权的隔离 Pack 存储可通过检查。授权漂移、错误所有者与损坏登记拒绝启动。这不是扩展业务表准入、迁移完整性证明或 Enable；扩展函数仍受原函数清单约束。

实际签名检查持有 Control fence 时，可靠消费者曾因正常锁竞争超时退出。增加显式数据库冲突恢复，仅装配在可幂等恢复的发布、消费和消费覆盖操作；识别 PostgreSQL 55P03／40P01／40001，初次之后最多三次，按 1／2／4 秒基线加入有界抖动并受总期限和取消信号约束。每次重新读取当前权限与持久事实。不会自动重跑队列领取／确认、外部 Provider 副作用或巡检尝试；不放宽数据库锁超时。

生产凭据与宿主配置、一般检查异常证据、doctor CLI、背压及完整安装验证／Enable 仍有缺口。

本批 Core 全量运行 480 项：479 通过，1 项在 Docker 端口绑定阶段超时、未进入业务断言；该 Artifact 索引测试单独补跑通过。真实共享运行时端到端、隔离 Pack 存储启动检查与冲突重试定向验证通过；类型、构建、API、文档检查通过。全量首次失败与补跑日志均保留，未将首次运行记作全绿。证据见[共享运行时真实验证](../../../../docs/development/verification-2026-09-09-pack-inspection-runtime.json)。


## 2026-09-09：巡检诊断 HTTP 与公开 SDK

登记 PackInspectionDiagnostic、PackInspectionDiagnosticResponse 与 abh.pack-inspection-jobs.inspect 查询合同，公开 GET /v1/queries/abh.pack-inspection-jobs.inspect?id=...。CoreHttpInstallation.packInspectionDiagnostic 必须显式提供候选 Grant 解析与当前部署／证据准入，默认没有该路由。HTTP 使用真实 IdentityIngress，后端继续要求同组织 Service、abh.pack.manage 用途、组织级 data-impact 发现权限与当前 Artifact 读取准入。

每次查询从当前 Job 版本解析 AwaitDelivery／AttemptExecution／ObserveRunning／SettleExpired／SettleLostLease／Terminal；合同约束状态、实际 lease／delivery Ref 和非负预算，不输出证据正文。权限拒绝与不可见 Job 返回 RESOURCE_NOT_FOUND，认证失败仍走统一身份入口。支持默认与 Strong，Projection 返回 SCHEMA_UNSUPPORTED。QueryMeta.asOf 使用同次数据库评估时间，pack-inspection-source 摘要仅为该次来源结果指纹，不是连续消费水位或修复权限。

公开客户端新增 packInspections.inspect({id, consistency?}, options?)，复用原有认证头、截止时间、取消、响应字节上限、禁止重定向和生成协议校验。安装时固定诊断回调并保留 receiver，替换宿主配置不能重定向已创建的应用。查询不提交 Receipt、Audit、Outbox，不修改 Job 或租约。

同时移除查询权限生成器按 Owner 在 Action／Decision 间猜测目标与用途的逻辑，全部查询显式登记 targetTypes／purposeNames。生成器拒绝缺失、未知登记或借查询扩大既有内部 action 的授权范围。巡检查询沿用现有 data-impact 发现权限，没有被错误合并进 Action 准备用途。

本批实现 HTTP／SDK 诊断查询；CLI doctor inspection／pack、真实生产 IdP 与凭据配置、一般异常失败证据及完整安装验证仍未完成。HTTP 夹具使用显式测试 IdP 和数据库中的真实身份／Grant／Pending Job，不能作为生产 IdP 或 Pack 已安装验证证据。

本批契约全量 292 项、HTTP／SDK 定向 13 项、真实签名巡检链路 1 项通过，无失败或跳过。构建、Core 类型、生成漂移、API 和文档检查通过；隔离容器无残留。本批未重跑 Core 全量。证据见[巡检查询验证](../../../../docs/development/verification-2026-09-09-inspection-query.json)。


## 2026-09-09：巡检 Job 的可执行 CLI 诊断

新增 abh doctor inspection --id <Job UUID>，经公开 SDK 对已安装的巡检 HTTP 路由发起 Strong 查询。命令只读取显式 ABH_API_BASE_URL／ABH_API_TOKEN，不接收 actor、Purpose、Grant 或修复参数；API 负责真实身份与组织绑定。HTTPS 或显式 loopback HTTP 可用，URL 内嵌凭据、查询串、fragment 和重定向拒绝，响应限制为 64 KiB，超时／取消有界且无自动重试。

返回的 Job 必须匹配请求，Strong 响应不得 stale，元数据时间须与诊断评估时间一致。CLI 输出采用统一生成的 CliInspectionDiagnosticResult，并检查顶层 evidenceRefs 与诊断中已有证据 Ref 完全一致；commandRef 始终为 null。文本输出提供实际 Job 状态、评估时间、预算、Refs 和独立授权的下一步建议，JSON 保留结构化诊断。

成功读取为 Reported／退出码 0，不能将其解释为 Job 成功、验证通过或 Enable；终态 Failed 也会如实 Reported。诊断调用失败则不返回 Job 或证据，输入配置／身份权限／前置兼容／依赖分别映射 2／3／4／6。错误不包含 API Token、响应正文或原始异常。命令不会入队、续租、取消 Job 或调用修复 Owner。

真实集成在隔离数据库与 HTTP 服务上启动 CLI 子进程，确认取得当前 Pending Job、Grant 撤销后返回不可见错误，以及 Receipt／Audit／Outbox／Job 均未变化。测试 IdP 仍为显式夹具，不能视为生产身份提供方验证。网络测试覆盖错误 Job、时间不一致、stale、超大／非法响应、重定向、超时与预取消。

该命令查询巡检 Job；完整 doctor pack 仍须汇总签名、CTK、能力、迁移和引用等各阶段阻塞，不能把巡检 Job 报告当作其替代。生产凭据／Secret Ref、一般异常失败证据、完整安装与其他 V1 设计仍未完成。

本批契约全量 293 项、CLI 测试 3 项、真实 HTTP／数据库／CLI 子进程集成 1 项通过，无失败或跳过。工作区构建、类型／CLI 语法、生成漂移、API 和文档检查通过；隔离容器无残留。本批未重跑 Core 全量或签名链路。证据见[巡检 CLI 验证](../../../../docs/development/verification-2026-09-09-doctor-inspection.json)。


## 2026-09-09：检查失败与目标清理失败分别保留

修复 inspectMigrationTarget 在检查已失败时忽略目标清理未确认，以及 runInstalledMigrationInspection／runPackInspectionJob 在 finally 中用清理超时覆盖原始失败的问题。统一的 requireMigrationInspectionDisposal 保持一次有界清理：清理成功时原样抛出原始失败；检查与清理同时失败时保留为 AggregateError 的两个独立条目；只有清理失败则返回 MigrationInspectionCleanupError（稳定 DEPENDENCY_TIMEOUT 码）。undefined、null 和字符串等非 Error 抛出值也保留。

清理未确认不会返回成功观察；一秒清理等待结束后的迟到确认也不会改变已返回的失败。CleanupError 仅说明没有收到清理确认，不证明连接仍存活或任意远程工作已停止。清理回调的原始错误细节不进入新增错误消息，检查原始错误仍只用于内部诊断。

本批没有将一般异常自动持久化成 Failed，也没有把异常当作独立清理权限。双重失败后的 Running Job 仍需正式 Owner 根据当前 Grant、版本和数据库租约／期限事实处理；一般异常证据、迟到准备结果清理失败的持久报告以及完整安装验证仍未完成。

本批目标检查／清理定向 16 项和真实签名巡检链路 1 项通过，无失败或跳过。实际 Job 双重失败保留 INVALID_ARGUMENT 与独立 CleanupError，目标仅清理一次，Job 保持 Running；随后以当前 Grant 和真实已释放租约调用失租 Owner 正式收尾。类型、构建、API 和文档检查通过，隔离容器无残留；本批未重跑 Core 全量。证据见[检查与清理失败验证](../../../../docs/development/verification-2026-09-09-inspection-failure-cleanup.json)。


实际执行异常可通过 `runPackInspectionJob` 的显式 `failure` 准入装配正式收尾，需独立 `abh.pack-inspection-jobs.fail` Grant。`inspection-failure.ts` 对拒绝的实际尝试生成不可序列化的进程能力；`fail-pack-inspection.ts` 校验原 Running 快照和仍有效的原租约，原子保存受限故障证据与 Failed 状态。目标清理先完成有界等待，清理未确认标记不证明远程停止；失败提交拒绝时保留两项异常。未装配该入口仍使用已有到期／失租恢复。


巡检可使用 `grantSets` 分别装配 start／waiting／completion／failure／discovery／expiry／leaseLoss 权限。基础 `grants` 仍用于租约；省略动作项沿用基础列表，空数组明确拒绝。不同动作的 Grant 不应混在同一要求全部适用的列表中。使用独立检查与租约 Grant 时，准备器通过 `inspectionFenceRefs` 声明选择／治理额外 Control fences；生成任务的 `fenceRefs` 与租约 fences 在任何检查聚合锁之前共同锁定。

`InstalledMigrationInspectionRun.fenceRefs` 在有／无租约的调用中均生效。声明或预锁失败时，工作流在检查开始前清理已取得的目标，并保留准入与清理的独立失败。

巡检启动前后使用 Start 权限读取，Wait／Complete／Fail 提交后的结果读取使用对应收尾动作权限。已提交 Wait／Complete 的后续读取异常不再进入执行故障观察器或尝试再次提交 Failed；read 准入和实际安装检查仍每次执行。


`recordMigrationNonApplicability` 从当前真实 staged 内容与签名影响报告生成 `abh-pack-migration-not-applicable-v1` Artifact，仅接受完整清单下无迁移、无定义／投影变化的结论。调用方提供稳定 commandId／idempotencyKey、影响 Ref、保留配置和当前来源／读取准入。报告及 Receipt／Audit／Outbox 原子保存，重放重新验证来源、信任和实际报告字节；不创建空迁移，不产生 Enable 权限。

`readMigrationNonApplicability` 在当前 UoW 复核报告真实字节、预期影响 Ref、安装和当前签名来源；读完后再次检查当前事实。调用方仍须保持所属 Owner 的提交权限与门禁，不可把返回的普通数据对象当成 Enable 能力。

`selectMigrationNonApplicability` 对当前影响进行有界恢复发现，返回 Missing／Selected／Ambiguous／Incomplete；不完整扫描不宣称唯一或缺失。结果仅为提示，消费 Owner 必须在提交 UoW 中重新调用复核读取。


CTK 制品：pack-conformance-artifact 提供内部 RecordPackConformanceCommand 与消费读取。Stage 和 CTK 写入 Grant 分开输入，全部 Control fences 在 Pack 锁之前声明；实际报告来自 staged 签名文件且匹配原 validation 摘要。Artifact 使用规范 JSON envelope，绑定安装 Owner 与验证／治理 sources。重放、回读和取消不会绕过当前证据及权限检查。

prepare-pack-enable-proposal 组合当前 CTK Artifact、签名影响报告及迁移不适用 Artifact，从真实安装派生 PackEnableProposal；先取得 Deployment／Pack 锁，审查影响上界后重新读证据。当前只支持 NotApplicable 验证分支；不产生批准或 Enabled 状态，仍需正式审批请求及 Enable Owner。


request-pack-enable 已接入内部 RequestPackEnableCommand：独立请求 Grant、当前真实提案重建、冻结 Request／Decision 包绑定、必须安装的路由资格策略与 Human Gateway 原子创建。重放仍重验当前来源及权限，并核对原冻结路由；已关闭请求只返回原回执，不重开。请求与资格全部 fences 必须预先声明，后置校验失败回滚所有请求事实。它只请求审批，不启用 Pack。


PackDeploymentRevisionOwner 读取独立的组织部署版本历史，持 Deployment 锁精确 CAS 追加，目标必须是同组织实际已写入且版本一致的 installed_packs 行。Stage 将该记录与安装／Journal 同事务提交，数据影响读取相同版本源；禁止再用 Stage 最大值作为未来生命周期版本。旧库迁移保存历史 Stage 版本及时间。该基础设施未打开 Enabled 状态，后续生命周期命令仍需完整证据、审批和独立授权。


InstalledPackOwner.readHistorical 提供显式历史 exactRef 读取，需要历史证据准入且不代表当前安装可运行。Stage 通过 retainCurrent 在同事务保存只追加历史，冲突正文拒绝覆盖；重放核对当前与历史一致。迁移保留既有 Stage 正文及时间，历史表仅 SELECT／INSERT，遵循无物理外键规则。当前仍只接受 Staged version 1，生命周期版本迁移尚待实施。


preparePackEnableCommit 联合当前签名提案、Enable 专用 Grant 与 Human 审批消费；全部来源 fences 在 Deployment／Pack 锁前收集，依赖／兼容／隔离准入回调在最终证据重读之前执行。返回 PackEnableRecord 仅为待提交数据，不能作为跨 UoW 的授权凭证。生命周期 Owner 尚需在原事务提交能力注册、安装状态、历史、部署版本与 Journal；当前不会写 Enabled。


preparePackCapabilities 校验显式构建期能力映射：完整覆盖 Manifest provides、引用真实 artifact Schema、权限不超出 Manifest，实际字节验证后通过必需的 Schema 与安装实现准入。登记摘要绑定完整语义和包／Schema 摘要；输入及回调方法固定，回调内容副本隔离。prepareInstalledCapabilities 组合真实 staged 恢复并在回调后重验当前安装。返回登记数据，不持久化、不执行代码，也不构成业务 Grant；Registry 与 Enable 原子装配仍待实现。


registerPackCapabilities 使用独立内部命令和 register Grant，将受信构建期映射经实际 staged 验证后保存到只追加 capabilities／capability_sets。登记是 Staged 管理事实，不开放运行时。完整集合与子记录逐项校验摘要／身份，永久拒绝覆盖同 kind/id/version；重放仍校验当前授权、内容与原集合。注册和 Journal 同事务回滚，部署版本不因此推进。未来 Enable 必须核对此登记并原子激活，查询／exact resolve 尚待实现。

## 能力集合与 Enable 提案

`preparePackEnableProposal` 要求实际 `capabilitySetRef`，通过 Registry Owner 读取完整集合与子记录，核对安装版本、Manifest 的提供能力、包／Schema 摘要和权限上界，将实际 setDigest 纳入提案摘要。宿主必须提供 `capabilityFenceRefs` 和 `capabilities`：前者在 Deployment／Pack 锁之前声明所有权限 fences，后者验证当前读取授权、受信实现和健康条件。回调入参均为副本，不能将检查当作运行时授权。Request 和每份审批包必须包含集合 Ref；Enable 预提交也重建同一集合。当前仍只准备提交数据，不写 Enabled 或暴露运行能力。

## 受控 Enabled 状态写入

安装记录现支持 Staged/version 1 与 Enabled/version 2；Enabled 必须包含匹配 Pack、包摘要、验证／治理依据、部署版本和审批期限的完整 `PackEnableRecord`。迁移 `1788886000000` 保留历史表只追加，当前表仅向运行角色授权生命周期六列 UPDATE，包身份列仍禁止写入；安全 manifest 58 检查精确列权限与两个生命周期 CHECK 的定义摘要。

`applyPackEnable` 在调用者 Command UoW 内执行真实预提交准入，再 CAS 当前记录、保留两个安装版本、推进部署修订、写 Audit／Outbox，最后重新检查审批与 Enable Grant。调用者仍负责 `executeCommand` 的 Receipt 和历史重放准入；当前没有完整 Enable 命令宿主，不能将此入口当作可重复提交的生产管理 API。Stage 重放读取原始历史版本并与当前记录的不可变部分核对；Staged 恢复入口仍拒绝其他版本。

运行时能力选择／激活、完整 Enable 命令重放、Suspend／Retire 和适用迁移验证仍缺。签名联测验证真实审批后的 Enabled 写入及整笔事务回滚；独立存储夹具验证提交后当前／历史读取和数据库门禁，不代表完整生产启用验收。

## 2026-09-09：Enable 命令与已提交回执重放

`enablePack` 已装配内部 `EnablePackCommand`：在同一 Command UoW 中执行独立 Enable Grant、真实提案／审批准入、受控状态写入及 Receipt。幂等锁内读取实际回执决定初次提交或重放；不同 payload 保持 IDEMPOTENCY_CONFLICT，新幂等键不能将已启用版本再推进一次。

`readPackEnableAcceptance` 从实际 Enabled 历史记录读取原始提案，核对原 Staged 历史、当前安装、部署修订、完整能力集合、保存的验证报告、实际本地内容和当前签名治理。无关治理版本／撤回清单变化可复核后继续读取；签名密钥、来源、CTK 或部署验证前提改变则要求重新验证。宿主仍必须装配当前管理读取／签名者／实现健康准入及提前声明的 fences。回调后再次读取事实和内容，并重新检查 Enable Grant。

重放只返回既有回执，不重新消费审批、不执行迁移或重新跑完整 CTK。真实数据库时钟超过原提案期限、审批人 Grant 随后撤销，都不删除已经完成的事实；当前管理 Grant 撤销、内容替换、能力记录损坏、回执记录不一致仍会拒绝读取。联测通过真实签名／Human 审批提交后，从新事务和并发连接确认只产生一次状态推进；随后仅重置隔离测试夹具，以继续执行原 Staged 管理测试。

当前仍仅支持 NotApplicable 数据变更分支；运行时能力查询／解析、挂起／退休、验证前提变化后的完整重验装配，以及适用迁移的完整验证仍未完成。Enabled 成功回执不是运行授权。

## 2026-09-09：业务用途能力候选查询

新增 `QueryPackCapabilitiesQuery`／候选／可用性／结果契约及 `abh.capabilities.read` 独立查询权限。`queryPackCapabilities` 接受当前业务用途 Context，检查实际 Grant 后在部署与 Pack 锁下读取 Enabled 安装、完整登记集合、验证报告和当前治理；管理读取入口仍保留原用途限制。候选只暴露能力身份、安装 Ref、登记／Schema 摘要和兼容／健康布尔值，不泄漏实现路径或密钥，也不返回执行句柄。

查询支持精确 ID／版本、最多 256 字符和 8 个分支的 semver 范围、最多 100 个返回项与 1000 个扫描候选。扫描或返回被截断时 `complete=false`，不自动挑选版本；普通范围不隐式接受预发布版本。宿主必须提供提前声明的查询 fences 和有期限的可见性／兼容性／健康检查，最后重读候选来源、安装、完整集合及治理，重新检查读取 Grant。

本批是内部查询实现及公开查询契约，HTTP 运行入口仍标记 Unavailable。精确解析、Assignment／Pin 绑定、实际 Schema 字节及受信实现句柄、运行前撤回检查、Suspend／Retire 仍待完成。查询本身不授予调用权限。非空候选测试使用明确的行政数据夹具，真实签名回归仍使用空 provides 包，不能据此声明非空签名能力运行验收。

## 2026-09-09：精确能力的实际 Pin 校验

`StaticReleaseOwner.requirePinnedCapability` 从实际保存的 PinSet 和当前 Assignment／Release 校验指定 behavior slot 的完整 CapabilityRef（含版本与摘要），返回固定 Assignment Ref。重验同时核对行版本、组织、状态、执行标志及 Release 绑定，拒绝记录与索引列不一致。正常停止新分配不破坏既有 Pin；紧急暂停禁止执行。调用方仍须校验业务授权、Enabled 能力及 Schema／实现／健康状态，此入口不提供执行句柄。

专项覆盖摘要／版本／名称替换、Assignment／Release 记录版本篡改、进程重启后固定引用和紧急暂停。精确 Registry 解析与受信句柄装配仍未完成。

## 实际能力 Schema 字节

`readCapabilitySchema` 校验注册摘要、完整 Manifest 摘要、包身份、Schema 路径／摘要及权限上界，读取最多 2 MiB、100000 块且受原期限约束的字节。读取时复制缓冲区，拒绝长度偏差、内容替换和共享内存；失败／取消尝试关闭迭代器。此入口不解析 Schema、不加载包代码，也不授予执行权限。调用者仍必须先完成当前 Enabled、信任、Assignment／Pin 和实现准入。

## 2026-09-09：同事务精确能力解析

`resolvePackCapability` 在调用者 UoW 内依次检查实际 PinSet／Assignment、当前 Enabled 候选、完整登记摘要、实际受信实现 Ref 和当前业务／隔离准入，核验完整包内容与 Schema 字节。公开 CapabilityRef 的 digest 绑定完整 registrationDigest，公共 kind 与注册 kind 的映射由显式构建期 binding 固定；禁止仅按名称猜测或动态导入实现。返回私有 Schema 副本读取器和部署注入的实现对象。

查询入口已拆出同事务形式，所有新增 fences 在部署／Pack 锁之前声明。宿主回调后再次读取安装、登记、信任和权限，最后读取实际内容，再作无宿主回调的事实复核与 Pin 重验，拒绝最后一次 source 回调篡改集合或撤销权限。返回实现对象是内部解析结果，业务 Owner 仍必须在实际派发时校验 Snapshot／Permit，不能将读取 Grant 当作执行授权。

本批非空能力／Release／解析联合测试使用行政元数据夹具与实际字节来源，尚无真实签名非空包的端到端验收。生产 Gateway 默认装配、每次调用的治理门禁、HTTP 入口、Suspend／Retire 及适用迁移验证仍待完成。

## 2026-09-09：能力候选 HTTP 查询装配

`createCoreHttpApp` 新增显式 `capabilityQuery` 安装，接通 `GET /v1/queries/abh.capabilities.query`。查询先由真实 IdentityIngress 生成私有 VerifiedContext，再有界获取部署安装的读取 Grant，调用既有业务用途候选查询，在事务内复核当前 Grant、Enabled 安装、完整能力集合及兼容／健康状态。返回 `PackCapabilityQueryResult`，保留精确版本／范围过滤和 complete 截断标志，不返回实现句柄。

创建服务时校验并绑定 Grant／fence／inspect 方法；缺少安装时不注册路由（404），安装不完整时拒绝创建。查询没有命令、审计或 Outbox 写入。实际数据库与 HTTP 联测覆盖有效非空候选、分页截断、无身份、非法过滤、缺少／撤销 Grant 及安装对象方法替换。非空包仍为行政元数据夹具，不能代替真实签名非空包端到端验收。生产部署默认治理安装、Gateway 调用装配、Suspend／Retire 仍未完成。

## 2026-09-09：同事务解析准备与执行锁顺序

新增 `preparePackCapabilityResolution`／`resolvePreparedPackCapability`，提前收集并固定解析输入、部署 binding、当前检查方法、读取 Grant 和所需 Control fences。准备对象不暴露实现，不接受 Grant、不读取内容，也不授权调用。消费仅允许原 UoW 一次，保留原期限；消费时仍走完整实际 Pin、Enabled、治理、包／Schema 字节及实现 Ref 验证。

组合方必须先将声明 fences 与业务 fences 一起按序锁定；聚合阶段按 Action → Deployment → OperationController → PackLoader 获取锁。新增 `lockPackCapabilityDeployment` 供组合方在 Operation 锁前获取部署锁，候选查询复用相同锁。准备对象不能绕过锁序：遗漏早期 fences 或部署锁仍由 UoW 拒绝。不能把解析直接放入已取得全部业务锁的 target 回调而补拿早期锁。

这提供后续出口装配的事务内基础，尚未接成生产派发／查回 Gateway，不能据此声明默认运行装配完成。

## 2026-09-09：真实签名非空 Connector 夹具

新增可复用 `signedConnectorFixture`：实际 ConnectorPack Manifest 提供一个 `abh.connector` 能力和合法 JSON Schema 字节，发布／Builder／CTK 各用独立 Cosign 临时密钥签署同一包摘要。函数返回公开验证材料和内容来源，临时私钥在返回前删除。CTK 使用明确的测试声明，不能作为生产 Connector 已通过完整 CTK 的证明。

实际密码学联测验证发布签名、SLSA 来源、CTK 能力声明、非空 preparePackCapabilities 登记和 readCapabilitySchema 原字节；替换能力版本并重算摘要仍无法复用旧签名／来源／CTK，Schema 替换、空登记、空 CTK 声明及来源公钥替换均拒绝。

本批真实 Cosign 专项 1 项通过、0 跳过，Core 类型检查通过。该夹具尚未接入持久 Stage／Human 审批／Enable／T1／Permit／传输和 Capture；它关闭的是非空签名输入夹具缺口，完整成功执行验收仍未完成。

## 2026-09-09：非空签名包当前验证与跨进程恢复

真实签名 Connector 夹具接入 validateCurrentPack，校验当前部署策略、发布／来源／CTK 三类独立证明和完整包内容；经 stageLocalPackSnapshot 保存后，由新 Node 进程 recoverLocalPackSnapshot 重建 Manifest、报告与实际 Schema。恢复的原字节重新生成与原先完全相同的完整能力登记。恢复对象不具备 GovernedLocalPack 进程内信任标记，也不自动产生安装或执行权限。

专项覆盖持久化 payload 篡改后恢复失败和当前治理撤回后验证失败。实际 Cosign／新进程恢复联合 2 项通过、0 跳过，类型检查通过。当前治理来源仍是测试安装，尚未贯通实际治理发布、数据库 Stage／Human 批准／Enable 和完整执行链；这些验收缺口继续保留。

## 2026-09-09：非空签名 Connector 的真实数据库安装与登记

签名夹具新增实际 PostgreSQL 联测，使用独立管理员临时密钥签署部署治理，通过 publishPackTrustPolicy 写入治理版本，再从 databasePackGovernanceSource 验证同一非空 Connector 包。recordPackValidation、StagePack、RegisterPackCapabilities 依次产生验证报告、Staged 安装、完整非空能力集合及命令回执，不行政写入 Pack／能力事实。

Stage 与登记重放不重复写入；最终只有一条安装、一条能力和四条命令回执。新数据库连接回读完整能力集合与原记录一致；撤销管理 Grant 后登记重放拒绝。身份与 Grant 仍为显式行政夹具，Schema／实现治理为测试安装。安装保持 Staged，尚未接真实 Human 启用批准、Enabled、T1、Permit 和成功传输／Capture；不能从登记成功推断执行权限。

## 2026-09-09：非空签名包的数据影响与不适用证据

非空 Connector 数据库安装联测新增两份实际完整库存 Artifact，由独立 Compiler 临时密钥签署绑定 packRef、deploymentVersion、环境、基线／目标 Ref 与影响结论的报告，经 recordPackDataImpact 保存。recordMigrationNonApplicability 从当前治理、实际签名报告、库存内容和 staged 包字节生成不可变不适用证据，随后从新事务读取验证。

当前夹具确实没有迁移、数据或投影变化，使用完整空库存；不会为它创建空迁移作业。替换 impactRef 无法读取报告，重复命令返回原证据，撤销 Grant 后登记和不适用报告重放均拒绝。Compiler 身份／来源治理仍是显式测试安装，适用迁移的完整 Domain／回填／投影验收未完成。

真实 Cosign／数据库联合 2 项通过、0 跳过，类型检查通过。下一步仍须将非空能力集合、CTK 和此不适用证据绑定到真实 Human Enable 提案与审批；尚不声明 Enabled 或运行成功。

## 2026-09-09：非空签名包的完整 Enable 提案

非空 Connector 联测通过正式 recordPackConformanceArtifact 保存并回读独立签名 CTK，保留实际非空 claimedCapabilities。preparePackEnableProposal 从当前数据库与 staged 内容重建提案，绑定同一包摘要、部署版本、完整能力集合摘要、CTK、影响报告及迁移不适用证据；重复重建得到相同提案摘要。

替换 CTK 为不适用报告、替换能力集合 Ref、当前实现准入拒绝及 Grant 撤销均拒绝提案重建。构建提案不改变 Staged 状态，不等同于批准或执行授权。实际 Cosign／数据库联合 2 项通过、0 跳过，类型检查通过；真实 Human 开单／批准及 Enable 消费仍是下一段未完成的非空包验收。

## 2026-09-09：非空签名包 Human 批准与原子 Enable

非空 Connector 联测通过真实 assignResponsibility、requestPackEnable、DecisionOwner.submit 创建路由、Decision 与整体完成证据，再由 verifyPackEnableApproval 验证精确提案／完整能力集合和各项证据。正式 enablePack 命令读取这些实际事实并原子推进 Staged/version 1 → Enabled/version 2，保留原 Staged 历史。

开单与 Enable 重放返回原事实，替换批准 Ref 不推进状态，撤销 Enable Grant 后拒绝重放；原有登记／不适用证据／提案在管理 Grant 撤销后的拒绝覆盖继续保留。身份、Grant、资格和安装健康治理是测试安装，审批通过真实 Human 领域 Owner 完成，尚未覆盖 HTTP 审批入口或生产职责分离配置。

此证据首次将非空实际签名内容、持久治理、Stage、登记、影响／CTK／不适用报告、Human 批准与 Enabled 连为一条测试链。Release/Pin、T1、Permit 到成功派发／查回／Capture 仍待接通，Enabled 本身不授予运行权限。

## 2026-09-09：非空签名 Connector 的业务 Action 与精确 Pin 解析

真实签名安装联测在 Enabled 后撤销 Pack 管理 Grant，用独立业务 Grant 查询实际非空候选。正式 StaticReleaseOwner 创建 Release/Assignment；实际业务载荷写入 Artifact，ActionOwner 创建 Action/冻结 Intent，再通过 validateAction 和 pinAction 的当前 Grant 检查完成校验与 Pin。Pin 绑定真实 Intent 摘要、准备 Grant 和登记摘要，重放返回原 Pin；Action 保持 Validated，尚无执行 Authority。

resolvePackCapability 从实际 Enabled 集合、持久包内容和该 Action Pin 解析出原始 Schema 与安装绑定。派发共用的 preparePackCapabilityResolution/resolvePreparedPackCapability 两阶段入口亦消费同一链路，声明 fences 后锁 Deployment，再完成一次性解析。Schema 返回副本，错误精确摘要、重复消费 token、健康失败、Assignment 急停均拒绝；业务 Grant 撤销后候选查询和 Pin 重放均拒绝。

真实 Cosign／数据库联合 2 项通过、0 跳过，Core 类型与文档检查通过。身份、Grant、Domain/Release 治理是显式测试安装，执行实现仍为测试句柄；未连接 T1、Permit、实际传输、独立查回与 Capture，也未覆盖生产 HTTP 审批或完整 Connector CTK。本批只修改联测与文档，未重跑全量 Core。见 [签名 Connector 业务解析验证记录](../../../../docs/development/verification-2026-09-09-signed-connector-resolve.json)。

## 2026-09-09：签名 Connector 的实际编译与 Operation 登记

真实签名安装链继续经过 ActionCompilerHost、compilePreparedAction 和 registerOperationPlan。Release 同时固定显式测试 Compiler 与实际非空包的 Connector 登记摘要；编译前后及登记／重放准入均重新解析当前 Enabled Connector。正式登记持久化完整 OperationPlan 和一个 Pending、零 Attempt 的 Operation，重放不重复创建。撤销业务 Grant 或健康检查失败后，计划登记重放拒绝。

该联测发现并修复编译／登记入口的锁序缺口：能力准入可能取得 Deployment 锁，因此两个入口现在都在 Control fences 后先锁定并核验 Action，再调用当前能力准入。编译仍在数据库事务外执行；登记仍独立核验当前 Grant、Pin、载荷和完整计划。

Compiler、Domain 与治理为显式测试安装；未声称 Compiler 本身来自签名包，也未生成执行 Authority、T1、Permit 或外部效果。后续继续接业务授权、派发／独立查回和 Capture。验证结果见 [签名 Connector 计划验证记录](../../../../docs/development/verification-2026-09-09-signed-connector-plan.json)。

## 2026-09-09：签名 Connector 的 T1、Permit、派发与 Capture

真实签名非空 Connector 链新增独立业务 Authorization Request/Decision/完成证据，经 ExecutionAuthorityOwner 签发绑定实际 Action/载荷的 Service Grant 与 Authority。重建摘要后尝试用 Pack Enable 批准替换业务批准，仍因主体不匹配拒绝。Action 提议现在通过 executeCommand 生成实际源命令回执，供 T1 核验提议来源。

正式 Purpose、Connection、显式资源 Envelope 和已安装 Wasm Mandatory/Behavior 策略参与 T1，两个策略评估、Snapshot 与 Authorized 状态原子提交。测试计划声明无计量资源，因此显式空 Envelope 不产生 Reservation；不代表资源扣款场景已在本链覆盖。Service 的独立 capability-read Grant fence 在 T1 固定，后续实际 WorkLease、Permit 和 dispatchPackAndCapture 使用同组 fence 与精确登记摘要。

安装的测试传输校验 Permit/载荷，并用新数据库事务读到已提交出口后才返回响应。正式 Capture 使用独立观察 Grant；注入持久化失败后经 retryTransportCapture 保存原始 Artifact、规范化 Receipt 和 Capture，整个链路只调用一次传输，已消费重试句柄和重复派发均拒绝。

实际 Cosign／数据库联合 2 项通过、0 跳过，Core 类型和文档检查通过。身份/Grant/治理、Compiler、Domain、Policy 和传输为显式测试安装，未调用真实 Provider，未覆盖生产 HTTP 审批或完整 Connector CTK。独立 queryPackAndCapture、暂停/退役与兼容查回仍待完成；Capture 也不等同于 Operation 终态归并。本批未修改生产源码、未重跑全量 Core。见 [签名 Connector 执行验证记录](../../../../docs/development/verification-2026-09-09-signed-connector-t1.json)。

## 2026-09-09：签名 Connector 的独立预算查询与 Capture

真实签名 Connector 执行联测继续接入 queryPackAndCapture。查询使用独立 Grant、Purpose、资源 Envelope 与一次查询额度的实际累计账本；ScopeAuthorityPolicyInput 经过已安装 Wasm 策略评估，再由正式 createScopeAuthority 创建 Scope Authority，未直接插入 Authority 事实。撤销原派发 Grant 后，同一实际 Operation 仍可在原精确 Enabled Connector 上合法查回。

查询传输在新事务可见实际 query exit 后才返回测试响应，实际预算只消耗一次。缺少 capability-read Grant 时不调用传输、不计费；Capture 注入持久化失败后仅重试证据保存，已消费句柄拒绝复用。预算耗尽后拒绝第二次查询，查询调用总数保持一。返回空匹配使用 Partial coverage，Operation 保留未决状态与既有 Attempt，不据此确认无外部效果。

本批仅扩展联合夹具，身份/Grant/Domain/治理与传输仍是测试安装；没有真实 Provider、Suspend/Retire 后的兼容能力或终态归并验收。当前 Enabled 原能力上的独立查询成功不能代替暂停后安全恢复。验证见 [签名 Connector 查询验证记录](../../../../docs/development/verification-2026-09-09-signed-connector-query.json)。

## 2026-09-09：Pack 原子暂停与历史保留

新增内部 SuspendPackCommand、独立 abh.packs.suspend 管理动作、暂停输入及历史事实合同。suspendPack 在当前 Grant/部署策略准入后，以部署锁、expectedDeploymentVersion 和 Enabled 精确版本 CAS 原子推进 Suspended，保留原 Enable 事实、前后历史、部署 revision、命令回执、审计与 durable outbox 事件。emergency 只交给当前部署策略核验，不跳过 Grant 或证据要求；暂停无需重验已经失效的签名/CTK 才能停用。

新增数据库迁移扩展真实生命周期约束，并更新 readiness 对数据库实际 pg_get_constraintdef 的摘要验证。合同与数据库共同约束原 Enabled 引用、连续 Pack 版本、部署序号和暂停时间。回执重放重新校验当前管理权限，返回原历史结果；不重新激活能力，不删除包字节、Action Pin、Operation 或未决责任。

真实签名完整执行／查询链之后，暂停专项覆盖准入拒绝、缺 Grant、部署版本冲突、历史持久化故障回滚、成功与重放、旧 Enabled 历史回读、候选消失、精确解析拒绝以及撤权后重放拒绝。暂停事件已持久化，既有运行的通知消费、Retire/引用水位和兼容查回仍待实现；当前不得把此暂停入口视为完整恢复能力。验证见 [Pack 暂停验证记录](../../../../docs/development/verification-2026-09-09-pack-suspend.json)。

## 2026-09-09：Pin 的实际选择准入与暂停保护

ActionPinChecks 新增 selected 回调，在实际 Pin 产生后的同一命令事务内校验选中能力，原命令重放也校验实际持久 Pin。回调所需 Control scopes 必须提前由 fenceRefs 声明；Action 在能力准入取得 Deployment 锁前锁定并核验版本。函数入口固定回调及接收者，pinRequestedAction 将该检查传到授权 Worker 的真实推进链。

签名 Connector 夹具安装实际 resolvePackCapability 作为 selected 检查。Enabled 时 Pin/重放通过；Suspended 后，新 Action 的选择被拒绝，Pin 写入与 Action 绑定一并回滚，已有 Pin 重放也拒绝。独立请求推进测试覆盖检查拒绝、回滚、恢复推进和重放拒绝。静态非 Pack 安装仍可不提供此回调；生产 Pack 宿主必须显式装配它，不能把通用 StaticReleaseOwner 本身当成 Loader 准入。

本批未实现引用枚举、暂停通知消费、Retire 或兼容查回；这些待办继续保留。验证见 [Pack Pin 验证记录](../../../../docs/development/verification-2026-09-09-pack-pin.json)。

## 2026-09-09：精确能力的 Pin 引用发现

新增内部 queryCapabilityReferences，按完整 CapabilityRef（含摘要）查询实际 PinSet，校验持久摘要及主体元数据，以 Pin UUID 游标分页，限制每页最多 100 个匹配候选。当前租户、Workspace、用途过滤与独立发现准入、逐对象可见性检查都保留；隐藏一整页时仍返回下一扫描位置，避免漏扫后续可见结果。回调有统一期限，前后重新检查当前准入。

真实签名联测创建两个实际 Action Pin，暂停包后仍能分页找到原精确能力引用；覆盖跨页无重复、隐藏页仍可前进、错误版本无匹配和 Grant 撤销拒绝。返回历史主体及 Pin 引用，不改变 Action/Operation，也不授予执行或回收权限。

此入口是当前作用域内的通知发现基础，不是全组织引用水位或删除证明。跨作用域通知消费、Artifact/Run 其他引用检查、并发水位、Retire 与兼容查回仍待完成。验证见 [能力引用发现验证记录](../../../../docs/development/verification-2026-09-09-pack-references.json)。

## 2026-09-09：暂停通知的已提交事件来源

新增管理侧 readPackSuspension：要求当前暂停管理 Grant 与部署准入，从真实 Outbox 暂停事件读取精确 Suspended 历史，核验其 Enable 绑定、完整能力集合摘要及每项登记的包摘要，返回原登记身份、implementationRef、暂停原因和证据。输入只接受事件 Ref，不接受调用方自报的受影响能力列表。

真实签名联测验证实际暂停事件与原能力集合一致，Enable 事件不能冒充暂停事件，缺 Grant 和撤权后读取均拒绝。该读取不要求重新启用已暂停包，也不改变任何运行。后续 Worker 仍须建立受权业务 Context、映射注册能力类型，再以独立引用发现权限扫描通知目标；管理权限不替代业务对象的读/通知权限。

运行通知路由/消费、Retire、全局引用水位和兼容查询仍未完成。本批验证见 [暂停事件来源验证记录](../../../../docs/development/verification-2026-09-09-suspension-source.json)。

## 2026-09-09：暂停通知目标的分作用域扫描

queryPackSuspensionTargets 串接实际暂停事件/历史能力集合与业务 Pin 引用分页，管理 Context 和业务 Context 必须同组织且各自经过当前准入。调用方部署代码提供显式注册 kind 与公共 CapabilityRef 映射，能力 id/version/登记摘要须与暂停包集合精确匹配。扫描后再次读取暂停来源并校验管理权限，结果只包含业务侧可见目标。

游标绑定事件、能力集合、精确能力、组织、Workspace、用途和业务身份；每个事件/Pin/能力组合产生稳定 notificationKey，便于后续持久消费去重。真实签名联测验证两个实际 Action 的分页、续扫、同页重读稳定性、错误游标与错误能力拒绝。

这是内部扫描组合，不写通知效果或更改运行，不提供全局删除证明。扫描位置不是并发插入水位，Worker 完成一轮后仍需重新扫描；游标不是授权凭证。持久调度、业务 Owner 消费、Retire 和兼容查回仍待完成。见 [暂停目标扫描验证记录](../../../../docs/development/verification-2026-09-09-suspension-targets.json)。

## 2026-09-09：有界暂停目标扫描循环

scanPackSuspension 执行指定事件/精确能力/业务作用域的一轮有界扫描，每页刷新独立管理与业务 Context，统一传递原截止时间和取消信号。页大小与最大页数有上限，部署回调确认处理页后才推进游标；返回的进度可以持久化，未确认页可以使用稳定 notificationKey 重放。结束一轮不代表全局无引用或业务通知已完成。

签名数据库联测覆盖页处理后确认丢失、重启重读相同去重键、单页预算与续扫、预先取消及身份刷新挂起超时。页接收器当前为显式测试安装，尚无持久目标表/队列和 Owner 消费；不能把内存去重测试当作崩溃后 exactly-once 承诺。回调须配合取消并自行校验实际写入权限。

Retire、兼容查回和完整通知持久化仍待继续。见 [暂停扫描循环验证记录](../../../../docs/development/verification-2026-09-09-suspension-scan.json)。

## 2026-09-09：暂停扫描页的实际持久化与进程恢复验证

签名 Connector 联测的扫描 accept 安装改为正式 storeInlineArtifact 命令，要求独立存储 Grant，以实际页内容摘要构造幂等键。页文档绑定暂停事件、能力、目标和下一游标，Artifact owner/source 指向事件、暂停记录及实际 Pin。注入存储成功后确认丢失，重读同页返回原 Artifact，不重复生成证据。

续扫后两页经新数据库连接回读，另起 Node 进程只凭持久 Artifact Ref、数据库与测试身份读取页面，核验内容摘要并重建相同 notificationKey 集合；不依赖父进程的 Set。恢复进程是明确的测试身份夹具，不能用于生产认证。页面仅为扫描证据，不是运行 Owner 执行授权，也不是已发送通知的回执。

本批补强实际存储装配与验收，未实现自动任务发现、页消费状态、通知业务效果、Retire 或兼容查回。见 [暂停扫描页验证记录](../../../../docs/development/verification-2026-09-09-suspension-pages.json)。

## 2026-09-09：可复用暂停扫描页存储装配

新增 storeSuspensionPage，固定调用参数与准入回调，校验事件、精确能力、Pin/主体引用、页完成状态/游标以及每个 notificationKey，拒绝重复目标与错误摘要。页面按规范 JSON 和内容摘要生成稳定幂等键，通过正式 storeInlineArtifact 的当前 Grant、引用和保留策略检查保存；返回实际 Artifact 接受 Ref 与页摘要。

签名联测的扫描器改用此生产内部装配，保留确认丢失后的幂等复用及新进程读取验证，并覆盖错误 notificationKey、缺存储 Grant 拒绝。该入口受现有存储命令的 abh.action.prepare 用途和 64 KiB 限制，其他用途不能借此绕过准入；部署方应选择合适页大小。

持久文档仍是扫描证据，不能直接当作通知授权或消费回执。自动发现、业务 Owner 消费状态、Retire 与兼容查回仍待完成。见 [暂停页存储装配验证记录](../../../../docs/development/verification-2026-09-09-suspension-store.json)。

## 2026-09-09：暂停扫描页的正式恢复读取

readSuspensionPage 从实际 Artifact 恢复扫描证据，要求调用方给出预期事件、精确能力和页摘要；读取原字节后复验完整内容摘要、Artifact owner/source、实际 Outbox 暂停事件和所有通知目标的 packRef/Pin/去重键。当前 Artifact 读取策略在读取前后均检查，固定回调与参数并共享截止时间。

签名联测使用新数据库连接调用该生产内部入口恢复两页，内容与原页一致，替换页摘要拒绝。宿主仍须提供独立 Artifact 读权限及保留/来源政策，文档中的目标不自动获得业务读或通知权限。后续实际 Owner 消费必须重新检查当前 Pin/Action 并原子记录效果和 Inbox。

业务通知消费、Retire、兼容查询仍未完成。见 [暂停页恢复验证记录](../../../../docs/development/verification-2026-09-09-suspension-read.json)。

## 2026-09-09：Action 暂停通知观察与 Inbox 消费

actionPackSuspensionConsumer 提供每个 Action/精确能力的固定消费者，使用当前 runtime.consume-event Grant 和安装的来源/业务通知策略，锁定 Action 后核验实际 PinSet 摘要、引用与能力成员。消费者保存 ActionPackSuspensionObservation Artifact，记录已提交暂停事件、精确能力、Pin、当前 Action 及全部子 Operation 版本/状态/Attempt 数；同一事务由真实 InboxOwner 写入去重回执。

实际签名链联测覆盖观察持久化失败时 Inbox 为零、成功后重复消费与新连接重放只有一条 Inbox、撤权后重放拒绝。消费前后 Action/Operation 事实完全相同，未决责任和既有 Attempt 不因通知丢失、重放或确认而释放。

这里实现的是业务 Owner 的持久暂停观察，不自动取消业务或推断远端效果。来源与业务通知治理仍为显式安装策略；目前联测直接调用 consumeCommittedEvent，扫描页到队列的自动路由/投递尚待装配，Retire 和兼容查回仍缺。见 [Action 暂停消费验证记录](../../../../docs/development/verification-2026-09-09-suspension-consumer.json)。

## 2026-09-09：暂停通知的原生队列投递与来源事实校验

新增内部 actionPackSuspensionRouter，为一个已提交暂停事件冻结明确安装的完整订阅名单（1—100 个），以 Action／登记摘要派生消费者与队列去重键。Job 绑定实际 Action、原事件与命令，不携带执行 Authority。此名单不能使用单个扫描页替代；超过上限拒绝，不截断。自动分页订阅发现、跨范围回填和全局完成水位仍未实现。

签名 Connector 联测通过真实 publishCommittedEvent 与隔离 pg-boss 入队、fetch、consumeOutboxDelivery、队列确认和 recordOutboxConsumption。两条实际 Action 分别生成观察与 Inbox；只完成第一条时不能记录整体消费完成。篡改 Job 目标、混用消费者、持久化失败、重复发布／消费、新连接重放及撤权后重放均验证。

消费者新增历史来源事实核对：在当前 Service 通知 Grant 下读取事件绑定的 Suspended 历史版本及原能力集，复验集合摘要、包摘要、登记 kind/id/version/digest。错误 kind 即使安装回调放行也拒绝；Enable 事件不能冒充暂停来源。注册 kind 与公共 kind 的映射、业务通知权限和 Artifact 保留政策仍由可信安装提供。观察保持父子事实与未决责任，不授予新执行或终止远端效果。

验证证据见 [暂停通知投递记录](../../../../docs/development/verification-2026-09-09-suspension-routing.json)。

## 2026-09-09：扫描页到 Action 的恢复投递

新增内部 deliverActionSuspensionPage：从持久 Artifact 回读并核验完整扫描页，为每个 Action 或 Run 刷新独立 Service 身份，在相同组织/Workspace 中调用对应实际暂停消费者。页面读取权限与业务通知权限分别检查；消费者额外核对页内 pinSetDigest 与实际 Pin。未知 Owner 类型或缺 Run admission 整页失败，不能静默跳过。

每个效果以原暂停事件和原 Action 消费者为 Inbox 去重依据，分页边界、重新扫描与既有队列投递共享相同回执。当前目标失败只回滚它自己的事务；已完成目标仍可在新数据库连接中回放。可选 onHandled 在效果提交后有界执行，确认丢失不会重复写入观察。输入、回调及策略配置在等待前固定，整页共用调用方截止时间和取消信号。

真实签名链联测覆盖：第一条已完成而第二条写入失败、第二条成功后确认丢失、新连接恢复、重复消费、真实扫描从一页拆为两页后仍返回原回执、跨 Workspace 身份拒绝、伪造 Pin 摘要拒绝、取消与撤权后重放拒绝。scanPackSuspension 的 accept 已在联测中组合实际 storeSuspensionPage 与该投递入口，只有全页返回后推进扫描。

此入口完成一页中实际 Action 的效果，不写入原事件的冻结路由或全局消费完成凭证。跨范围发现、宿主持久任务调度、新订阅回填水位及 Run 暂停 Owner 仍待实现；Retire、兼容查回和其余 V1 范围不变。验证见 [分页投递记录](../../../../docs/development/verification-2026-09-09-suspension-page-delivery.json)。

## 2026-09-09：持久暂停页的数据库恢复发现

queryStoredSuspensionPages 按实际暂停事件、当前组织/Workspace/用途发现可用 JSON Artifact，使用绑定事件、精确能力和当前身份的 UUID 游标。发现先独立授权，再逐项授权读取正文；仅返回经过 readSuspensionPage 完整复验的匹配页面。其他能力或无关证据不会成为通知任务，空匹配页仍保留扫描游标。

独立 Node 进程恢复联测现在仅接收数据库、测试身份、事件、能力和 Grant，不再传入 Artifact 列表；它实际分页发现并重建全部通知键。覆盖发现拒绝、正文读取拒绝、游标替换以及空匹配分页。该接口返回已存工作而非仅未完成任务；投递继续依靠原事件 Inbox 去重。宿主循环、跨业务范围调度、全局完成水位和 Run Owner 仍未完成，UUID 扫描需重扫以覆盖并发插入。

验证见 [持久页发现记录](../../../../docs/development/verification-2026-09-09-suspension-discovery.json)。

## 2026-09-09：暂停通知恢复 Worker 与 Runtime 宿主

新增 runSuspensionRecoveryWorker，持续分页发现指定事件/能力/业务范围的持久页面，并执行实际 Action 暂停消费。整轮完成后重置 UUID 游标进行重扫；每页的所有效果及 onPage 确认成功后才推进游标。失败向宿主抛出，重启重扫仍复用已提交 Inbox。不同页面分别有界，停机取消可中断身份源、读写和观察回调。

TenantRuntimeOptions.suspensionRecovery 可显式安装多个范围的恢复循环，加入现有共同租户绑定及监督收尾。安装配置、引用和回调在 createTenantRuntimeLoops 时固定，业务 Service 身份与页面发现身份分别刷新，组织/Workspace 漂移拒绝。

真实签名链联测验证连续两轮扫描只保留两条 Inbox、每轮重新获取身份、身份范围漂移拒绝、卡住的身份源被停机取消，以及实际 Runtime 生成的恢复循环在安装对象被修改后仍处理原事件。已有队列投递与扫描重放共同使用原事件 Inbox。

当前仍要求宿主明确安装 eventRef/capability；全局暂停事件/业务范围发现、故障任务隔离、Run Owner、Retire/兼容查回及生产治理尚未完成。验证见 [暂停恢复 Worker 记录](../../../../docs/development/verification-2026-09-09-suspension-worker.json)。

## 2026-09-09：管理侧暂停事件的恢复发现

discoverPackSuspensions 从实际已提交 Outbox 分页发现暂停事件，并回读历史 Suspended Pack 与完整能力登记集合。要求同组织、无 Workspace 的 pack.manage 身份、当前 packs.suspend Grant、独立发现政策与每个来源的读策略。UUID 游标绑定当前组织/身份/用途，返回前重新校验发现权限；不以已经发布或已有消费者回执排除事件。

独立进程恢复联测现在也不传 eventRef：新进程用管理身份发现事件，再用独立业务读取身份发现持久扫描页，重建相同通知键。覆盖缺 Grant、用途错误、游标替换、结束游标、发现/来源策略拒绝、返回前拒绝及撤权后重放。能力类型映射及当前业务通知权限仍独立安装，不从管理权限推导。

该入口补齐事件查询，不代表生产全局调度已完成。跨业务范围枚举、自动扫描与投递任务装配、Run Owner、Retire/兼容查回仍缺；UUID 扫描仍需重扫处理并发插入。验证见 [暂停事件发现记录](../../../../docs/development/verification-2026-09-09-suspension-events.json)。

## 2026-09-09：Retire 命令和退役证据契约

新增 RetirePackPayload、RetirePackCommand、PackRetirementRecord 及独立内部管理 action abh.packs.retire。命令要求原 Suspended 版本 3、预期部署版本、原因、证据、referenceReviewRef 和 rollbackWindowEndsAt；无 emergency 绕过字段。退役证据要求同一包推进至版本 4，部署版本推进一次，retiredAt 不早于回滚窗口结束。

契约校验不证明引用水位审查实际完成，也不证明窗口由可信治理确定。下一步必须实现 Owner 在当前授权下回读引用审查证据、校验真实时间与版本，并以迁移将 InstalledPackRecord/数据库转换接入 Retired。当前 InstalledPackRecord 仍只支持 Staged/Enabled/Suspended，不得将新增命令注册误报为退役执行已实现。任何包字节删除都仍未授权实现，未决对账代码必须保留。

Contracts 全量 307 通过，生成制品及公开 API 报告同步更新。测试覆盖缺失审查/窗口、错误引用、跳版本、错误部署推进、窗口前退役、内部可见性和独立用途限制。见 [退役契约验证](../../../../docs/development/verification-2026-09-09-retire-contracts.json)。

## 2026-09-09：Retired 状态、数据库约束和 Owner 转换

retirePack 已接入内部管理命令：当前独立 packs.retire Grant、控制 fences、部署锁、精确 Suspended CAS、真实数据库时钟及必填引用审查策略。读取实际 referenceReviewRef Artifact 并核验其 owner 是原 Suspended 版本，交给可信安装校验引用覆盖与回滚窗口。首次转换和历史重放均检查当前授权、审查和政策。

InstalledPackRecord 新增 Retired/retirement；迁移 1788889000000_pack_retirement.cjs 更新当前表及历史表的生命周期约束。版本 4 与部署版本递进、原 Enable/Suspend 身份和时间顺序、回滚窗口及审查引用必须一致。数据库约束摘要使用隔离 PG 的 pg_get_constraintdef 实测并更新 readiness；临时计算脚本已删除。

实际转换原子保留旧/新历史、推进部署修订、写 Journal/Outbox/CommandReceipt，不删除包字节，不修改 Action/Operation/账本。签名联测覆盖审查拒绝、缺 Grant、未来窗口、版本冲突、历史写入故障整体回滚、成功重放、旧 Suspend 来源仍可读取、父子事实不变、撤权与当前审查拒绝重放，以及伪造退役时间被数据库拒绝。

这实现逻辑退役，不代表物理包移除或全局引用水位完成。审查 Artifact 的真实跨 Owner 覆盖和窗口治理仍是必填可信安装；联测明确保留已有 Pin/Action/Operation 引用。Run Owner、全局引用目录、兼容查回和生产治理仍缺。验证见 [退役生命周期记录](../../../../docs/development/verification-2026-09-09-retire-lifecycle.json)。

## 2026-09-09：替代 Pack 查询解析装配

queryPackOnce 现在根据显式 compatibility 安装选择替代查询解析路径。预备令牌在原事务内收集替代能力的完整 fences，业务锁之后、出口提交之前消费一次；保留原 Action 的真实 Pin 输入，不为替代能力生成或改写 Pin。resolveEnabledPackCapability 复用原解析器的当前 Enabled/注册摘要/implementationRef、内容完整性、Schema、信任和健康复核；普通派发解析仍要求当前可执行的 Assignment。

替代路径读取实际 QueryExit、兼容 Artifact 和原 Pin，核对 Action/Operation、两个 Connector、Connection、Account、摘要及数据库时间。原 Pin 仅证明历史绑定，暂停的 Assignment 不妨碍独立授权的对账。证据共享锁持续到提交，Pack 回调之后再次验证，拒绝解析期间作废证据。发送仍发生在出口与预算消费提交之后。

真实 PostgreSQL Actions 回归覆盖缺少独立能力读取 Grant、错误实现引用、当前策略拒绝、Schema 内容损坏、解析期间证据作废的零额外调用和预算回滚；成功场景已撤销派发 Grant，替代查询保留原 Pin/Permit 幂等键及未决 Operation。另在独立回滚事务内暂停原 Assignment，验证历史查询 Pin 仍可读取、普通执行 Pin 拒绝；事务回滚保持共享 fixture 隔离。普通能力解析回归及原有真实 Cosign 签名 Connector 链路也通过。

替代 Pack 使用明确的管理元数据 fixture，不能作为两个实际签名 Pack 在 Suspend/Retire 后联合恢复的验收。兼容证据发行治理、兼容归一化及签名替代 Pack 的最终对账联测仍待实现；未重跑全量 Core，V1 总体尚未完成。验证见 [替代 Pack 查询解析记录](../../../../docs/development/verification-2026-09-09-compatible-pack.json)。

## 2026-09-09：双签名 Pack 退役后查回与最终收敛

安装 fixture 提取为 installSignedConnectorFixture，读取组织当前部署修订，复用真实签名治理发布、Validation、Stage、Capability 注册、签名数据影响报告、迁移不适用证明、CTK、Human 决策和 Enable；身份及管理 Grant 仍是显式管理 fixture。第二个 Pack 使用独立生成的 release/builder/CTK 签名密钥和不同包身份，部署修订沿同一组织继续推进。

原 Connector 完成一次派发，只返回 Pending 接受事实；随后原包经 Suspend、Retire，原 Assignment 暂停。替代包在同一组织真实安装并 Enabled，以独立 Scope 查询 Authority、能力读取 Grant、兼容 Artifact 和预算完成查询。原包源读取次数为零，替代字节通过两次内容验证；出口先提交，保留原 Connector/幂等键并记录替代身份。Capture 故障后只重试持久化，替代 Provider 查询共一次，查询累计费用为两次。

原派发 Pending 与第一次空查询不足以证明成功。替代查询提供同一外部身份的更高版本 Applied 事实，经全部三条真实 Receipt 参与 Reconciliation 得到 ConfirmedSuccess。独立当前 Controller Grant 和 Lease 下应用结果，错误授权及最终写入故障整体回滚；成功后 Operation Closed/Succeeded、资源占用清除。ActionResult 按完整子版本与报告集合汇总至 Closed/Succeeded，重放不重复写入；本 Action 未声明计量资源，资源结算集合为空，查询费用单独保留。

该链路为真实 PostgreSQL/Cosign/Owner 联测，Provider、兼容证明授权、归一化、比较规则及结算政策仍是可信测试安装，不代表生产治理或独立 CTK 验收。兼容证据正式发行治理、生产宿主与 V1 其他模块仍有缺口。未重跑全量 Core。验证见 [双签名恢复验证](../../../../docs/development/verification-2026-09-09-signed-recovery.json)。
