# Laicai dev `dl-dev` 收口验收报告

- 时间：2026-04-24 12:48
- 执行人：Alice
- 环境：dev
- 项目：laicai
- 入口：`https://dl-dev.infinex.cn`
- 前序失败报告：`test-reports/2026-04-24_11-02_laicai-dev-self-upload-chain.md`
- 证据文件：`test-reports/2026-04-24_12-48_laicai-dev-dl-dev-recovery.json`
- 源站修复位：dev shared server `/etc/nginx/sites-available/dl-dev.infinex.cn`

## 测试对象
- objectKey：`laicai/dev/android/release/chaintest-node-full-20260424/apk/2026/04/71008997-61d5-4726-8f3d-221f1b1e43b0-laicai-chain-test-20260424.apk`
- public distributionUrl：`https://dl-dev.infinex.cn/laicai/dev/android/release/chaintest-node-full-20260424/apk/2026/04/71008997-61d5-4726-8f3d-221f1b1e43b0-laicai-chain-test-20260424.apk`
- provider url：`https://origin-dev.infinex.cn/laicai/dev/android/release/chaintest-node-full-20260424/apk/2026/04/71008997-61d5-4726-8f3d-221f1b1e43b0-laicai-chain-test-20260424.apk`

## 用例结果

### CASE 1 — public `dl-dev` HEAD
- 结果：PASS
- 请求：`curl -I https://dl-dev.infinex.cn/{objectKey}`
- 返回：`HTTP/1.1 302 Found`
- 结论：公网 `dl-dev` 已恢复为稳定 302 跳转，`Location` 指向 `origin-dev.infinex.cn` 同一 objectKey。
- 截图：N/A（CLI HTTP 测试）
- 证据：JSON 中 `steps.public_dl_dev_head`

### CASE 2 — provider `origin-dev` HEAD
- 结果：PASS
- 请求：`curl -I https://origin-dev.infinex.cn/{objectKey}`
- 返回：`HTTP/1.1 200 OK`
- 结论：provider 真实对象仍可直接读取，说明最终 302 落点有效，链路末端无回归。
- 截图：N/A（CLI HTTP 测试）
- 证据：JSON 中 `steps.origin_dev_head`

### CASE 3 — 源站本机 Host 命中
- 结果：PASS
- 请求：`vault SSH -> curl -I -H 'Host: dl-dev.infinex.cn' http://127.0.0.1/{objectKey}`
- 返回：`HTTP/1.1 302 Found`
- 结论：shared dev server 上 Nginx `dl-dev.infinex.cn` vhost 已生效，源站入口可把请求正确转发给 SRS public-delivery。
- 截图：N/A（CLI + 远端 shell 测试）
- 证据：JSON 中 `steps.source_server_host_head`

## 根因收口
1. **最初 404**：不是 COS provider 无对象，而是 `dl-dev` 入口没有稳定命中正确的 shared delivery 入口。
2. **后续 502**：CDN 切到 `119.29.221.161` 后，源站 TLS 证书与 `dl-dev.infinex.cn` 不匹配。
3. **后续 400**：改 HTTP 回源后，CDN 到源站这一跳的端口 / Host 仍未对齐。
4. **最终修复**：
   - dev shared server 新增 `/etc/nginx/sites-available/dl-dev.infinex.cn` 80 反代入口；
   - CDN 回源收口到 `119.29.221.161:80`，回源 Host 为 `dl-dev.infinex.cn`；
   - 公网链路恢复为 `dl-dev -> CDN -> Nginx -> SRS public-delivery -> origin-dev`。

## 最终判定
- `dl-dev` public delivery：PASS
- `origin-dev` provider object：PASS
- shared dev server source ingress：PASS

## 结论
此前 `test-reports/2026-04-24_11-02_laicai-dev-self-upload-chain.md` 中的 `dl-dev stable delivery: FAIL` 已被本报告覆盖。当前同一 objectKey 的公网 `dl-dev` 请求已稳定返回 `302 -> origin-dev`，`object not found` / `502` / `400` 均不再复现。
