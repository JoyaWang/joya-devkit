# SRS public auth / VersionCheck 401 修复验证

- 时间：2026-04-28 20:06
- 范围：SRS `/v1/releases/check`、`/v1/releases/latest`、feedback public intake 全局鉴权绕过策略
- 背景：InfoV prod iOS local-run 中 `InfoVVersionCheckService._requestVersionInfo` 请求 `/v1/releases/check` 返回 `401 missing token`。

## 根因

SRS 全局 `preHandler` 只按本地硬编码路径判断是否跳过 service-token 鉴权：

1. 未读取 Fastify route-level `config.skipAuth`，导致 route 已声明 public 但仍被全局鉴权拦截。
2. public allowlist 缺少 `/v1/releases/check`、`/v1/releases/latest` 和 feedback submit public intake 路由。
3. 旧逻辑用 raw `request.url` exact match；带 query string 的 public route 会匹配失败。

因此业务 App 不携带 `Authorization` 调用 `/v1/releases/check?env=prod&platform=ios...` 时，被 `authPreHandler` 当作受保护接口处理并返回 `401 missing token`。

## 修复

- 新增 `apps/api/src/public-auth.ts`
  - `normalizeAuthPath()`：去 query string，兼容反代 `/api/` 前缀。
  - `hasRouteSkipAuth()`：以 route-level `config.skipAuth` 作为 primary public contract。
  - `shouldSkipAuth()`：保留 defensive allowlist，补齐 release check/latest 与 feedback submit public intake。
- 修改 `apps/api/src/index.ts`
  - 全局 `preHandler` 改为 `hasRouteSkipAuth(request) || shouldSkipAuth(request.url, request.method)` 后再决定是否执行 `authPreHandler`。
- 补 `tests/public-auth.test.mts`
  - 覆盖 query normalization、`/api/` 前缀、release public endpoint、feedback public intake、protected route 保持鉴权。
- 修正 `tests/releases-channel-control.test.mts`
  - test route capture 支持 Fastify `(path, opts, handler)` 签名。
  - release check/latest 测试请求补 `x-project-key` header，符合真实 public route contract。

## 验证命令与结果

```bash
pnpm --dir "/Users/joya/JoyaProjects/joya-devkit/srs" exec vitest run tests/public-auth.test.mts tests/releases-channel-control.test.mts tests/feedback-minimal-closure.test.mts
```

结果：

```text
Test Files  3 passed (3)
Tests  46 passed (46)
```

```bash
pnpm --dir "/Users/joya/JoyaProjects/joya-devkit/srs" --filter @srs/api run typecheck
```

结果：通过。

```bash
pnpm --dir "/Users/joya/JoyaProjects/joya-devkit/srs" --filter @srs/api run build
```

结果：通过。

## 已知非本修复范围

使用 `pnpm --dir ... test -- tests/...` 曾触发全量 suite，并暴露 16 个既有 baseline 失败，集中在 infra workflow、COS adapter 旧断言、public-delivery route 等，不属于本次 public auth / VersionCheck 401 修复范围。本次以 Vitest 精确文件选择命令作为有效回归证据。

## 结论

本地代码层已修复 `/v1/releases/check` public auth contract 漂移。线上 `https://srs.infinex.cn/v1/releases/check` 需部署最新 SRS API 后再做 curl 与 InfoV prod iOS local-run 复验。