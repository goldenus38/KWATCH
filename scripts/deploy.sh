#!/bin/bash
# ============================================
# KWATCH 운영서버 배포 스크립트
# 사용법: ./scripts/deploy.sh
# ============================================
set -e

DEPLOY_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="$DEPLOY_DIR/logs/deploy.log"

# 로그 디렉토리 생성
mkdir -p "$DEPLOY_DIR/logs"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=========================================="
log "KWATCH 배포 시작"
log "디렉토리: $DEPLOY_DIR"
log "=========================================="

cd "$DEPLOY_DIR"

# .env 파일 확인
if [ ! -f .env ]; then
  log "경고: .env 파일이 없습니다. .env.example을 복사하여 설정해주세요."
  log "  cp .env.example .env && vi .env"
  exit 1
fi

# Docker 서비스 확인
if ! docker info > /dev/null 2>&1; then
  log "오류: Docker가 실행 중이지 않습니다."
  exit 1
fi

# 이미지 빌드
log "Docker 이미지 빌드 중..."
docker compose build --no-cache 2>&1 | tee -a "$LOG_FILE"

# 기존 컨테이너 중지 및 재시작
log "컨테이너 재시작 중..."
docker compose down 2>&1 | tee -a "$LOG_FILE"
docker compose up -d 2>&1 | tee -a "$LOG_FILE"

# 헬스체크 대기
log "서비스 기동 대기 중 (최대 60초)..."
TIMEOUT=60
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  if docker compose ps --format json 2>/dev/null | grep -q '"Health":"healthy"' || \
     docker exec kwatch-server wget --spider -q http://localhost:3001/api/health 2>/dev/null; then
    log "서버 정상 기동 확인"
    break
  fi
  sleep 5
  ELAPSED=$((ELAPSED + 5))
  log "  대기 중... (${ELAPSED}s)"
done

if [ $ELAPSED -ge $TIMEOUT ]; then
  log "경고: 서비스 기동 확인 시간 초과. 컨테이너 로그를 확인하세요."
  log "  docker compose logs --tail=50"
fi

# 상태 출력
log "=========================================="
log "배포 완료. 컨테이너 상태:"
docker compose ps 2>&1 | tee -a "$LOG_FILE"
log "=========================================="
