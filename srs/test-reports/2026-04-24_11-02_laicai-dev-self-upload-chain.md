# Laicai dev 自传 APK 全链路测试报告

- 时间：2026-04-24 11:02
- 执行人：Alice
- 环境：dev
- 项目：laicai
- 入口：`https://srs-dev.infinex.cn`
- 证据文件：`test-reports/2026-04-24_11-02_laicai-dev-self-upload-chain.json`
- 测试文件：`/tmp/laicai-srs-chain-test.apk`（43 bytes，fake apk for chain test）

## 测试对象
- objectKey：`laicai/dev/android/release/chaintest-node-full-20260424/apk/2026/04/71008997-61d5-4726-8f3d-221f1b1e43b0-laicai-chain-test-20260424.apk`
- release id：`cmocbqp1r000601qi2vpltwwf`
- distributionUrl：`https://dl-dev.infinex.cn/laicai/dev/android/release/chaintest-node-full-20260424/apk/2026/04/71008997-61d5-4726-8f3d-221f1b1e43b0-laicai-chain-test-20260424.apk`
- provider url：`https://origin-dev.infinex.cn/laicai/dev/android/release/chaintest-node-full-20260424/apk/2026/04/71008997-61d5-4726-8f3d-221f1b1e43b0-laicai-chain-test-20260424.apk`

## 用例结果

### CASE 1 — upload-request
- 结果：PASS
- 请求：`POST /v1/objects/upload-requests`
- 返回：HTTP 201
- 结论：SRS 成功签发 objectKey 与 uploadUrl。
- 截图：N/A（CLI HTTP 测试）
- 证据：JSON 中 `steps.upload_request`

### CASE 2 — PUT 上传到 provider
- 结果：PASS
- 请求：PUT `uploadUrl`
- 返回：HTTP 200
- 结论：对象已成功写入 dev shared COS。
- 截图：N/A（CLI HTTP 测试）
- 证据：JSON 中 `steps.put_object`

### CASE 3 — complete
- 结果：PASS
- 请求：`POST /v1/objects/complete`
- 返回：HTTP 200，状态 `active`
- 结论：SRS 已接受 complete，说明 object 记录已至少部分入库并被标记 active。
- 截图：N/A（CLI HTTP 测试）
- 证据：JSON 中 `steps.complete`

### CASE 4 — create release
- 结果：PASS
- 请求：`POST /v1/releases`
- 返回：HTTP 201
- 结论：release 成功创建，distributionUrl 已生成并指向 `dl-dev.infinex.cn/{objectKey}`。
- 截图：N/A（CLI HTTP 测试）
- 证据：JSON 中 `steps.create_release`

### CASE 5 — authenticated release list
- 结果：PASS
- 请求：`GET /v1/releases?platform=android&limit=5`
- 返回：HTTP 200
- 结论：刚创建的测试 release 可从鉴权列表接口读到，release 真相源写入成功。
- 截图：N/A（CLI HTTP 测试）
- 证据：JSON 中 `steps.list_releases`

### CASE 6 — public latest release
- 结果：FAIL
- 请求：`GET /v1/releases/latest?platform=android&env=dev` + `X-Project-Key: laicai`
- 返回：HTTP 404，`{"error":"no release found"}`
- 结论：当前测试 release 为 `draft`，未进入 active channel；`latest/check` 读侧不会命中该 release。
- 截图：N/A（CLI HTTP 测试）
- 证据：JSON 中 `steps.latest_release`

### CASE 7 — public release check
- 结果：FAIL
- 请求：`GET /v1/releases/check?...`
- 返回：HTTP 200，但 `reason=no_active_release`，`distributionUrl` 为空
- 结论：与 CASE 6 一致，问题不在 upload / object / provider，而在 release channel 未激活。
- 截图：N/A（CLI HTTP 测试）
- 证据：JSON 中 `steps.check_release`

### CASE 8 — provider 真实对象读取
- 结果：PASS
- 请求：`HEAD https://origin-dev.infinex.cn/{objectKey}`
- 返回：HTTP 200
- 结论：provider 侧对象真实存在，可直接访问。
- 截图：N/A（CLI HTTP 测试）
- 证据：JSON 中 `steps.origin_dev_head`

### CASE 9 — stable public delivery (`dl-dev`)
- 结果：FAIL
- 请求：`HEAD/GET https://dl-dev.infinex.cn/{objectKey}`
- 返回：HTTP 404，body 为 `{"error":"object not found"}`
- 结论：在对象已存在于 provider、release 已创建的情况下，`dl-dev` 仍返回 `object not found`，说明 public-delivery 路由内部查找 `prisma.object.findUnique({ where: { objectKey } })` 未命中，或命中前即被错误分流；该问题位于 **SRS public-delivery / object read model**，不在 COS provider。
- 截图：N/A（CLI HTTP 测试）
- 证据：JSON 中 `steps.dl_dev_head`、`steps.dl_dev_get`

## 结论

### 已验证通过
1. `upload-request -> PUT -> complete -> create release -> authenticated list` 全部成功。
2. `origin-dev` 可直接 200，说明 shared COS dev bucket、凭据、写入链路均正常。
3. 当前 `dl-dev` 404 不是 provider 无对象导致。

### 当前根因收敛
根因已从“大链路不通”收敛为两个独立问题：
1. **release channel 未激活**：导致 `latest/check` 读侧看不到新 release。
2. **public-delivery 读模型缺口**：即使 object 已上传、complete 已成功、provider 可 200，`dl-dev` 仍在 `public-delivery.ts` 返回 `object not found`。

### 推荐下一步
1. 调用 `/v1/release-channels/activate` 激活测试 release，再复测 `latest/check`。
2. 直接排查 SRS `public-delivery.ts` 的 `prisma.object.findUnique({ where: { objectKey } })` 与其运行时数据库是否一致。
3. 若 DB 中确有 object 记录，则继续查：
   - `object` 表写入位置是否与 public-delivery 所连 DB 一致
   - Host-constrained route 是否命中正确实例
   - 是否存在 env / project 分流到另一库或另一实例

## 最终判定
- upload/write/provider：PASS
- release create/list：PASS
- latest/check：FAIL（因 channel 未激活）
- dl-dev stable delivery：FAIL（SRS public-delivery 未找到 object）
