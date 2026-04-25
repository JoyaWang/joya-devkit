# joya-devkit 项目进度

## 职责
- 本文件是 joya-devkit 根级长期进度账本。
- `srs/progress.md` 为 SRS 模块级进度账本。
- 本文件不是默认会话恢复入口；恢复当前工作切片时，先读 `steering/SESSION_CONTEXT.md`。

## 项目定位
`joya-devkit` 是 Joya 统一开发工具库：Flutter SDK + Shared Runtime Services（SRS）。
- 根目录 `steering/` 为 joya-devkit 总合同。
- `srs/steering/` 为 SRS 模块级合同。

## 日期日志

### 2026-04-25（prod 部署链路 checkout 修复）
- [x] 真实 prod deploy 失败暴露 `.github/workflows/deploy.yml` 在调用 `scripts/gen-env-runtime.sh` 前未 checkout repo，GitHub-hosted runner 因缺少工作区脚本报 `bash: scripts/gen-env-runtime.sh: No such file or directory`。
- [x] 按 TDD 补 `srs/tests/infra-deployment.test.mts` workflow contract：`deploy.yml` 与 `deploy-dev.yml` 必须在调用 `scripts/gen-env-runtime.sh` 前执行 `actions/checkout@v4`。
- [x] `.github/workflows/deploy.yml` 与 `.github/workflows/deploy-dev.yml` 已补 checkout；定向 Vitest contract 通过。

### 2026-04-24（Batch 2 脚本与 CI 编排）
- [x] `scripts/gen-env-runtime.sh` 增强为本地 + CI 双模式：CI 可用 `VAULT_TOKEN` 与 `OUTPUT_PATH=env.runtime` 生成上传 artifact，本地继续回退 `~/.joya/vault/.env`。
- [x] 新增 `scripts/docker-cleanup.sh`，统一 Docker image / builder cache cleanup；`--full` 额外清理 container / network。
- [x] 新增 `srs/scripts/deploy-remote-ssh.sh`，承接远端 dev/prod SRS 部署编排，保持 `dev -> dev`、`prod -> main` 分支语义。
- [x] `.github/workflows/deploy-dev.yml` / `deploy.yml` 删除 inline Python Vault reader，改为调用 `scripts/gen-env-runtime.sh`。
- [x] `.github/workflows/deploy-dev.yml` / `deploy.yml` 删除大段 inline SSH deploy，改为调用 `srs/scripts/deploy-remote-ssh.sh`。
- [x] `.github/workflows/dev-maintenance.yml` 删除 inline Docker cleanup；后续已取消 GitHub-hosted runner 定时 SSH，改由服务器本机 cron 调用 `/opt/joya-governance/bin/joya-devkit-docker-cleanup.sh`。
- [x] 静态验证已通过：`bash -n`、YAML parse、dry-run、`git diff --check`。
- 非范围：未触发真实 deploy / build / test；未改变 prod `main` release branch 语义。

### 2026-04-24（Batch 1 安全与合同优化）
- [x] root 文档合同结构补齐：root steering 已指向 joya-ai-sys doc-template 与 srs/steering 模块合同。
- [x] 修正旧口径：`shared-runtime-services` 文字统一为 `joya-devkit` / SRS module 描述；默认分支改为 `dev`；`main` 明确为 release branch。
- [x] `.github/workflows/deploy-dev.yml`：触发分支改 `dev`；增加 `permissions: contents: read`；增加 `environment: dev`；增加 `concurrency`（`cancel-in-progress: false`）；远端 deploy BRANCH 改 `dev`。
- [x] `.github/workflows/deploy.yml`：增加 `permissions: contents: read`；增加 `environment: prod`；增加 `concurrency`；注释明确 `main` 为 release branch。
- [x] `.github/workflows/dev-maintenance.yml`：增加 `permissions: contents: read`；增加 `environment: dev`；增加 `concurrency`。
- [x] `scripts/gen-env-runtime.sh`：Vault 任一路径 fetch 失败改为 fail-fast（`sys.exit(1)`）。
- [x] `srs/scripts/deploy-remote.sh`：禁止自动 `git add -A` / `git commit`；repo 改 `JoyaWang/joya-devkit`；默认分支 `dev`；clean tree 检查后才允许 push 或 `gh workflow run deploy-dev.yml --ref dev`。
- [x] `srs/scripts/deploy.sh`：默认 branch 改 `dev`；远端路径改 `/home/ubuntu/apps/joya-devkit`；log 文件改 `/var/log/joya-devkit-deploy.log`。
- [x] `README.md` 更新：说明 `dev` 为默认开发分支，`main` 为 release branch；CI workflow 名称与实际对齐。
