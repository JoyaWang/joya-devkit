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

### SRS 服务

部署地址不变，消费方按现有 `SRS_API_BASE_URL` 调用即可。

## CI

- `ci-sdks.yml`：sdks/** 变动时触发 Flutter 测试
- `ci-srs.yml`：srs/** 变动时触发 Node.js 测试
- `release.yml`：统一发布（SDK tag + 服务部署）
