#!/bin/bash
# SRS 手动部署脚本
# 用法: ./scripts/deploy.sh [branch]
# 默认分支: dev

set -euo pipefail

PROJECT_DIR="/home/ubuntu/apps/joya-devkit"
BRANCH="${1:-dev}"
LOG_FILE="/var/log/joya-devkit-deploy.log"

echo "=== Manual deploy started at $(date '+%Y-%m-%d %H:%M:%S') ===" | tee -a $LOG_FILE

cd $PROJECT_DIR

# Pull
git fetch origin $BRANCH
git reset --hard origin/$BRANCH
echo "[OK] Code pulled ($BRANCH)" | tee -a $LOG_FILE

# Build api + worker (postgres/redis use prebuilt images, no rebuild needed)
docker compose -f infra/docker-compose.yml build api worker 2>&1 | tee -a $LOG_FILE
echo "[OK] Build complete" | tee -a $LOG_FILE

# Restart only api + worker
docker compose -f infra/docker-compose.yml up -d --no-deps api worker 2>&1 | tee -a $LOG_FILE
echo "[OK] Services restarted" | tee -a $LOG_FILE

# Migrate
docker compose -f infra/docker-compose.yml exec -T api npx prisma migrate deploy 2>&1 | tee -a $LOG_FILE
echo "[OK] Migrations applied" | tee -a $LOG_FILE

# Health check
sleep 5
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3010/health || echo "000")
if [ "$HTTP_STATUS" -ge 200 ] && [ "$HTTP_STATUS" -lt 300 ]; then
  echo "[OK] Health check passed (HTTP $HTTP_STATUS)" | tee -a $LOG_FILE
else
  echo "[FAIL] Health check returned HTTP $HTTP_STATUS" | tee -a $LOG_FILE
  docker compose -f infra/docker-compose.yml logs api --tail 20 2>&1 | tee -a $LOG_FILE
  exit 1
fi

echo "=== Deploy finished at $(date '+%Y-%m-%d %H:%M:%S') ===" | tee -a $LOG_FILE
