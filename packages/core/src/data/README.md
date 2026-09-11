
### 内联准备 Artifact 受理入口

`storeInlineArtifact` 使用组织级创建目标与当前 `abh.artifacts.store-inline` Grant，将固定 Human/Service 准备用途、来源 fence、数据治理和 owner/retention/source 引用检查装配到真实 InlineArtifactOwner。治理必须验证用途目录、数据分级、地域、保留和内容策略，不提供默认放行。64 KiB 惰性 UTF-8 内容仍由 Owner 验证，Staged→Available、Audit/Outbox 和幂等回执原子提交。

重放继续验证当前 Grant/治理/引用，返回原受理引用而不重新发布已 Tombstoned 的对象，也不授予正文读取权限。该受理层已有显式内联 HTTP 安装与客户端调用；它不是完整 StoreArtifact 流式上传 API，大正文、ObjectStore staging/scan/Quarantined/GC 仍待完成。

数据库清单版本 44 新增 extension.validation_reports，由 PackLoader 内部 Owner 管理不可变验证证据，强制租户 RLS，运行时只允许 SELECT/INSERT。数据库启动检查覆盖新 Schema、表权限及 verifier 列权限。报告保存与审计/Outbox 使用同一 TenantTransaction；当前尚未提供部署治理 Command 的用途/Grant/幂等/治理锁装配，不能将内部写入能力当作 Pack 启用授权。
