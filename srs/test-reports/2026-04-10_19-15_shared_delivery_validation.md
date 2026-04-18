# 集成测试报告

## 环境信息
- 设备: 公网下载域名探针（curl）
- 应用版本: shared-runtime-services 当前工作区
- 测试时间: 2026-04-10 19:15:00
- 执行者: Alice（爱丽丝）
- 验收者: Alice（爱丽丝）

## 结果总览
| # | 测试文件 / 场景 | 结果 | 耗时 | Bug 数 |
|---|----------------|------|------|--------|
| 1 | shared public delivery dev 前缀探针 | ✅ | <1m | 0 |
| 2 | shared public delivery prd 前缀探针 | ✅ | <1m | 0 |
| 3 | legacy dev release 路径保留验证 | ✅ | <1m | 0 |
| 4 | legacy prd release 路径保留验证 | ✅ | <1m | 0 |

## 逐项详情

### Test 1: shared public delivery dev 前缀探针
- **结果**: ✅ 通过
- **开始**: 2026-04-10 19:15:00
- **结束**: 2026-04-10 19:15:30
- **验证方式**: `curl -I https://dl-dev.infinex.cn/infov/dev/desktop/release/dl_verify_dev/package/2026/04/d815d7b2-adb8-4aae-b8b9-a3575fe03eae-probe.txt`
- **关键证据**:

| 步骤 | 截图 | 验证结论 |
|------|------|----------|
| HEAD 探针 | 无截图（CLI 验证） | ✅ 返回 `HTTP/1.1 302 Found`，`Server: nginx/1.24.0 (Ubuntu)`，并带 `Cache-Control: no-store` 与 provider 签名 `location`，说明 dev shared prefix 已进入 SRS 公共分发入口 |

### Test 2: shared public delivery prd 前缀探针
- **结果**: ✅ 通过
- **开始**: 2026-04-10 19:15:30
- **结束**: 2026-04-10 19:16:00
- **验证方式**: `curl -I https://dl.infinex.cn/infov/prd/desktop/release/dl_verify_prd/package/2026/04/7c123ebe-b173-4cb4-b90a-d4e33da812ee-probe.txt`
- **关键证据**:

| 步骤 | 截图 | 验证结论 |
|------|------|----------|
| HEAD 探针 | 无截图（CLI 验证） | ✅ 返回 `HTTP/1.1 302 Found`，`Server: nginx/1.24.0 (Ubuntu)`，并跳转到 provider 签名 URL，说明 prd shared prefix 已进入 SRS 公共分发入口 |

### Test 3: legacy dev release 路径保留验证
- **结果**: ✅ 通过
- **开始**: 2026-04-10 19:16:00
- **结束**: 2026-04-10 19:16:20
- **验证方式**: `curl -I https://dl-dev.infinex.cn/releases/android/dev/test.apk`
- **关键证据**:

| 步骤 | 截图 | 验证结论 |
|------|------|----------|
| HEAD 探针 | 无截图（CLI 验证） | ✅ 返回 `HTTP/1.1 404 Not Found`，`Server: tencent-cos`，说明 legacy `/releases/android/dev/...` 仍走旧 COS 默认源站，没有被本轮 shared prefix 切流破坏 |

### Test 4: legacy prd release 路径保留验证
- **结果**: ✅ 通过
- **开始**: 2026-04-10 19:16:20
- **结束**: 2026-04-10 19:16:40
- **验证方式**: `curl -I https://dl.infinex.cn/releases/android/prd/test.apk`
- **关键证据**:

| 步骤 | 截图 | 验证结论 |
|------|------|----------|
| HEAD 探针 | 无截图（CLI 验证） | ✅ 返回 `HTTP/1.1 404 Not Found`，`Server: tencent-cos`，说明 legacy `/releases/android/prd/...` 仍走旧 COS 默认源站，shared delivery 切流保持非破坏式 |

## Bug 记录

无。当前轮次未发现 shared prefix 入口回归；已确认的注意事项为架构层 watchout，而不是本轮未修复 defect：腾讯 CDN `Origin=["srs.infinex.cn"]` 公网行为不稳定，当前生产稳定方案仍为 `Origin=["124.222.37.77"]`。

## 总结论
✅ PASS — shared objectKey 前缀已通过 `dl-dev.infinex.cn` / `dl.infinex.cn` 在生产形成最小公共分发闭环，且 legacy `/releases/android/...` 仍保留旧 COS 默认回源，满足非破坏式切流要求。

验收签名: Alice（爱丽丝） 2026-04-10
