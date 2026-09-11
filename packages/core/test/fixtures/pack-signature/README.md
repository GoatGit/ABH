# Pack 签名测试证明

此目录仅保存测试公钥及公开的 Sigstore Bundle v0.3，不含私钥，也不构成部署信任配置。

使用 Cosign 2.6.1 生成两个独立临时密钥。对 pack-fixture.ts 所生成 Manifest 的 digestPackManifest.signaturePayload UTF-8 原文运行 sign-blob --tlog-upload=false --new-bundle-format；对同一原文运行 attest-blob --type https://slsa.dev/provenance/v1，predicate 固定测试 Builder、buildType 和源码 URI/commit。生成后销毁临时私钥。provenance subject 名为 payload，in-toto Statement 版本为 Cosign 生成的 v0.1。

运行实际密码学回归需要显式 ABH_TEST_COSIGN=/absolute/path/to/cosign。未配置时实际签名/DSSE 两项测试显式跳过，不计入密码学通过证据。固定失败/取消测试仍执行。测试二进制 darwin-arm64 的发行校验和为 54047052cf46f40a5c3c95a510db276e164ba77e096aea1ca1b733f770359689。

非空 Connector 签名夹具由 `../../signed-connector-fixture.ts` 在运行时生成，发布、Builder、CTK 使用三个独立临时密钥，返回前删除私钥。`../../signed-connector.test.ts` 验证同一包摘要对应的实际 Schema、完整能力登记与三类签名。该测试需要同一个 ABH_TEST_COSIGN 配置；其 CTK 声明仅用于夹具，尚不代表真实业务 Connector 的完整验收。
