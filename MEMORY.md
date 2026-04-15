# 长期记忆

- shared storage 的 read fallback 不能停留在“返回候选 binding 列表”；真正的执行层必须统一落实为：按候选顺序 `getOrCreate -> headObject -> createDownloadRequest`。
- 当 `public-stable` 走稳定公共 URL 时，下载签名分支不要因为 fallback helper 的引入而退化成 provider 临时签名 URL。
- 如果把多个 route 的读路径统一到一个 helper，测试夹具也要同步满足统一后的 adapter contract，尤其是 `headObject()`。
- 首条业务项目接入 `shared-runtime-services` 时，优先采用“独立分支 + 开关控制 + 先 dev 写侧、后读侧 + 保留 legacy fallback”的接法，先迁真相源，再收旧链路，避免影响现网 App 可用性。
- 项目级 `IDENTITY.md` 必须表达“项目是谁”，不能误写成执行任务的 agent 身份；否则会污染 fresh session 的恢复入口。
- 启用 autonomous mode 时，`steering/SESSION_CONTEXT.md`、`.agent/runtime/execution-state.json`、`slice-packets/*`、`evidence/*` 必须一起收尾并保持状态一致；只改其中一个会造成 long-running 恢复口径漂移。
