# ABH Workbench

这是 V1 的可选 Next.js 参考应用，不是 ABH 服务必需组件。当前页面覆盖总览、责任待办、Decision 审批、Mission 进展/暂停/恢复、Action 列表/详情/取消/补偿，以及宿主声明的 Settings 快照和治理命令；所有 ABH 查询都走公开 HTTP 合同，服务端最终授权。

## 启用前提

1. 设置 `ABH_API_URL` 为 ABH HTTP 服务地址。
2. 替换 `src/lib/identity.ts` 的 `denyAllIdentityAdapter`：必须从真实 IdP/session 解析当前 Human 身份，在 `apiHeaders` 中为每个 API 请求注入宿主凭据，并区分 `actingOrganizationId` 与 `resourceOrganizationId`。
3. 组织选择 Cookie 只是用户意图；适配器必须在每次请求重新验证成员资格、Workspace、acting/resource 组织和用途。
4. 提供稳定且非保密的 `authorizationDigest`，用于隔离客户端缓存；它不能替代服务端授权。
5. 需要补偿时，替换 `src/lib/compensation.ts` 的 `denyAllCompensationAdapter`，返回已注册 Action 定义的补偿模板；适配器必须核对 Action 可见性、状态、定义归属和授权。
6. 需要自定义责任表单时，替换 `src/lib/decision-forms.ts` 的 `contractDecisionFormsAdapter`；默认表单只暴露公开 `SubmitDecisionPayload` 的 reason、condition refs 和 reauth proof。自定义适配器必须核对当前 Decision 可见性、状态和审批授权，且只能声明已注册 Schema。
7. 需要 Settings 治理时，设置 `WORKBENCH_SETTINGS_URL` 启用显式生产 HTTP 装配。服务必须返回有界非保密快照和已注册命令；`execute` 会在每次调用中重新授权、绑定请求 ID 保证幂等。也可以继续替换 `src/lib/settings.ts` 的 `denyAllSettingsAdapter`，由宿主完成业务审计与 Core/治理系统集成。
8. 不要在浏览器返回、日志或 Next 缓存中保存 API 凭据。页面和 BFF 均禁用共享缓存。

未替换适配器时，应用只显示未登录，不会发送 ABH 请求。

## 当前边界

- 已有审批稳定幂等键与 If-Match；界面不乐观显示“已生效”。
- Mission 投影与 Decision 状态通过 TanStack Query 刷新；同源 SSE BFF 注入身份并支持有界 Last-Event-ID，禁用或失败时回退授权轮询。
- Mission 投影使用语义表格和懒加载 ECharts SVG 图；只有通过形状守卫的授权摘要才渲染图表，数据异常时安全降级。
- Decision 审批使用懒加载 JSON Forms；服务端强读 Decision、复核状态和 Package 摘要，并用 Ajv 2020 重新校验注册表单输入。生产构建浏览器旅程、axe 扫描和 LCP/CLS 门禁可运行 `pnpm test:e2e`。
- 已提供 acting/resource 组织上下文显示与显式切换 UI；宿主必须验证组织选择 Cookie，不能信任浏览器改写。
- 补偿表单使用宿主声明的 JSON Schema 与 JSON Forms；生产 Action 定义、完成策略和业务治理仍由 Core 宿主装配最终裁决。
- Settings 页面只渲染宿主声明的成员、用途、连接、自动化和命令；适配器未安装时默认拒绝。连接视图不得包含凭据，命令受理不等于治理变更已生效。
- 当前不包含生产 Settings/Domain Pack 治理装配、真实 IdP/生产 API 旅程、读屏用户确认、移动与桌面视觉矩阵、INP/SSE 恢复旅程。
