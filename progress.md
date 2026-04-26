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

### 2026-04-26（SRS CNB 部署迁移启动）
- [x] 用户决定不再等待 GitHub Actions → TCR 慢速 push，已取消三条 5 分钟跟踪定时任务：`c0fcbad6`、`6f7614a4`、`0296f13f`。
- [x] CNB CLI 已通过 `npm install -g @cnbcool/cnb-cli` 安装，`cnb --help` 可用；本机用 Vault 注入 `CNB_TOKEN` 后能访问 `https://api.cnb.cool`。
- [x] 新增 CNB workflow 初版：`.cnb.yml`、`.cnb/web_trigger.yml`，dev push 与手动 dev/prod 均指向 CNB 构建 + TCR push + 服务器 pull 部署链路。
- [x] 新增 `scripts/cnb/common.sh`、`build-push-srs.sh`、`deploy-srs.sh`、`deploy-dev.sh`，复用现有 `scripts/gen-env-runtime.sh` 与 `srs/scripts/deploy-remote-ssh.sh`。
- [x] CNB YAML / shell 静态校验通过；补齐 `deploy-srs.sh` dev/prod Vault token 选择，并兼容 `/servers` 中 `SHARED_SERVER_*` / password 或 SSH key 凭据。
- [x] 已用 CNB CLI/API 创建私有组织/仓库：`joyawang/joya-devkit`，并将本地 `dev` 分支推送到 CNB remote。
- [!] 首次 API trigger 返回 `CI configuration file is empty`，原因是 `.cnb.yml` 与 `scripts/cnb/*` 仍是本地未提交变更，尚未进入已推送的 dev commit；需确认提交 CNB 相关改动后再推送并重触发。

### 2026-04-25（SRS prod 部署远端 Git retry 修复）
- [x] SRS prod deploy run `24928438596` 连续失败定位为远端服务器执行 `git fetch origin main` 时 GitHub TLS 瞬断：`GnuTLS recv error (-110)`，非应用代码失败。
- [x] `.github/workflows/deploy.yml` 与 `.github/workflows/deploy-dev.yml` 的 SSH git 更新步骤改为 `retry_remote_git_update`，最多 5 次重试后才失败。
- [x] `srs/scripts/deploy-remote-ssh.sh` 的 `pull_latest_code` 改为调用 `retry_git_update`，避免 workflow 已更新成功后脚本内部第二次裸 `git fetch` 仍因瞬断失败。
- [x] 补 `tests/infra-deployment.test.mts` 合同测试覆盖 workflow 与 remote script 的 retry 要求；定向 Vitest 与 shell syntax 验证通过。

### 2026-04-25（SRS Object API legacy prd token mapping 修复）
- [x] Laicai prod feedback synthetic 验证暴露 `POST /v1/objects/upload-requests` 返回 401；`/v1/feedback/client-settings` 免 auth 成功不能证明 Object API token 可用。
- [x] 定位到 SRS `SERVICE_TOKENS` 历史映射可能仍使用 `project:prd`，而 Object binding seed 已使用 `project:prod`，导致 Object route 解析 runtimeEnv 后找不到 prod binding。
- [x] 按 TDD 为 `EnvTokenValidator` 增加 legacy `prd -> prod` 归一化：`tests/auth-runtime-env.test.mts` RED 后修复，定向 Vitest 与 SRS typecheck 通过。

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
