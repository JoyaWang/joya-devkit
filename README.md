# joya-devkit

Joya 统一开发工具库：Flutter SDK + Shared Runtime Services（SRS）

## 结构

```
joya-devkit/
├── sdks/          # Flutter SDK（原 joya-flutter-kits）
│   └── packages/
│       ├── joya_auth
│       ├── joya_http
│       ├── joya_result
│       ├── joya_logger
│       ├── joya_device
│       ├── joya_version_kit
│       └── joya_feedback_kit
├── srs/           # 共享运行时服务（原 shared-runtime-services）
│   ├── apps/
│   │   ├── api/
│   │   └── worker/
│   └── packages/
│       ├── auth/
│       ├── object-service/
│       ├── release-service/
│       ├── delivery-policy/
│       ├── project-context/
│       └── shared-kernel/
└── docs/          # 跨栈公共文档
```

## 文档合同

- 根目录 `steering/` 为 joya-devkit 总合同。
- `srs/steering/` 为 SRS 模块级合同。

## 分支约定

- `dev`：日常开发默认分支。
- `main`：release branch，仅供发布与生产部署触发；消费者 git dependency 仍应 pin `main`。

## 开发

```bash
# 一键安装全部依赖
make setup

# 测试
make test

# 代码检查
make lint

# 构建
make build

# 启动服务
make dev-api
make dev-worker
```

## 消费者引用

### Flutter SDK（git path dependency）

```yaml
dependencies:
  joya_auth:
    git:
      url: https://github.com/JoyaWang/joya-devkit.git
      ref: main
      path: sdks/packages/joya_auth
```

> 注意：`ref: main` 指向 release branch，用于稳定消费；日常开发在 `dev` 分支进行。

### SRS 服务

部署地址不变，消费方按现有 `SRS_API_BASE_URL` 调用即可。

## CI

- `deploy-dev.yml`：dev 环境部署（触发分支 `dev`）
- `deploy.yml`：prod 环境部署（触发分支 `main`，即 release branch）
- `dev-maintenance.yml`：仅保留手动信息页；dev 服务器定期 Docker 清理由服务器本机 cron 执行 `/opt/joya-governance/bin/joya-devkit-docker-cleanup.sh`
