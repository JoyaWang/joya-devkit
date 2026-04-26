#!/bin/bash
# SRS 本地触发远程部署
# 用法:
#   ./scripts/deploy-remote.sh          # 在 clean tree 下推送或触发部署
#   ./scripts/deploy-remote.sh --force  # 强制触发, 不管有没有改动
#
# 约束：不再自动 git add / git commit。只允许在 clean tree 下 push 或 gh workflow run。

set -euo pipefail

BRANCH="dev"
REPO="JoyaWang/joya-devkit"

# 确保在 dev 分支
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
  echo "❌ 当前分支: $CURRENT_BRANCH, 请先切到 $BRANCH"
  exit 1
fi

# 检查是否有未提交改动
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ 存在未提交改动，请先手动提交或暂存后再部署"
  echo "   改动列表："
  git status --short
  exit 1
fi

# 检查是否有未推送的 commit
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/$BRANCH 2>/dev/null || echo "")

if [ "$LOCAL" = "$REMOTE" ] && [ "${1:-}" != "--force" ]; then
  echo "⏩ 代码已最新，用 --force 强制触发部署"
  echo "🔄 触发远程部署（无新 commit）..."
  gh workflow run deploy-dev.yml --ref $BRANCH
else
  echo "🚀 推送代码并触发部署..."
  git push origin $BRANCH
fi

# 等待 run 出现
echo "⏳ 等待 GitHub Actions 启动..."
sleep 5
RUN_ID=$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null)

if [ -n "$RUN_ID" ]; then
  echo "📋 Run ID: $RUN_ID"
  echo "🔗 https://github.com/$REPO/actions/runs/$RUN_ID"
  echo ""
  echo "⏳ 等待部署完成..."
  gh run watch $RUN_ID --exit-status 2>/dev/null && echo "✅ 部署成功" || echo "❌ 部署失败，查看日志: gh run view $RUN_ID --log-failed"
else
  echo "⚠️  未找到 run，请手动查看: https://github.com/$REPO/actions"
fi
