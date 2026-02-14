#!/bin/bash
# ============================================
# KWATCH 로컬 개발 환경 실행 스크립트
# DB/Redis는 Docker, server/web은 로컬 실행 (Hot Reload)
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}[KWATCH] 로컬 개발 환경을 시작합니다...${NC}"
echo ""

# 0단계: Docker server/web 컨테이너 충돌 방지
echo -e "${YELLOW}[0/4] Docker 컨테이너 정리...${NC}"
for CONTAINER in kwatch-web kwatch-server; do
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER}$"; then
    echo -e "${RED}  ${CONTAINER} 컨테이너 중지 (로컬 개발과 포트 충돌 방지)${NC}"
    docker stop "$CONTAINER" > /dev/null 2>&1 || true
    docker rm "$CONTAINER" > /dev/null 2>&1 || true
  fi
done
echo -e "${GREEN}  Docker 정리 완료${NC}"
echo ""

# 1단계: DB + Redis Docker 시작
echo -e "${YELLOW}[1/4] Docker (DB + Redis) 시작...${NC}"
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
echo -e "${GREEN}  DB + Redis 준비 완료${NC}"
echo ""

# DB 헬스체크 대기
echo -e "${YELLOW}[2/4] DB 헬스체크 대기...${NC}"
until docker exec kwatch-db pg_isready -U kwatch > /dev/null 2>&1; do
  sleep 1
done
echo -e "${GREEN}  DB 연결 확인${NC}"
echo ""

# Prisma 클라이언트 생성 (최초 또는 스키마 변경 시)
echo -e "${YELLOW}[3/4] Prisma 클라이언트 확인...${NC}"
cd packages/server
npx prisma generate > /dev/null 2>&1
npx prisma db push --accept-data-loss > /dev/null 2>&1
echo -e "${GREEN}  Prisma 준비 완료${NC}"
cd "$SCRIPT_DIR"
echo ""

# 기존 로컬 프로세스 정리 (포트 충돌 방지)
echo -e "${YELLOW}[4/4] 포트 충돌 확인...${NC}"
for PORT in 3001 3000; do
  PID=$(lsof -ti:$PORT 2>/dev/null || true)
  if [ -n "$PID" ]; then
    echo -e "${RED}  포트 $PORT 사용 중 (PID: $PID) — 종료${NC}"
    kill $PID 2>/dev/null || true
    sleep 1
  fi
done
echo -e "${GREEN}  포트 준비 완료${NC}"
echo ""

# 종료 시 정리
cleanup() {
  echo ""
  echo -e "${YELLOW}[KWATCH] 개발 서버를 종료합니다...${NC}"
  if [ -n "$SERVER_PID" ]; then
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
  fi
  if [ -n "$WEB_PID" ]; then
    kill $WEB_PID 2>/dev/null || true
    wait $WEB_PID 2>/dev/null || true
  fi
  echo -e "${GREEN}  서버 종료 완료${NC}"
  echo -e "${CYAN}  Docker(DB/Redis)는 계속 실행 중입니다. 중지하려면:${NC}"
  echo -e "${CYAN}  docker compose -f docker-compose.yml -f docker-compose.dev.yml down${NC}"
}
trap cleanup EXIT INT TERM

# 서버 실행 (백그라운드)
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN} Server: http://localhost:3001  (tsx watch)${NC}"
echo -e "${GREEN} Web:    http://localhost:3000  (next dev HMR)${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""

echo -e "${CYAN}[Server] 서버 시작 중...${NC}"
cd "$SCRIPT_DIR/packages/server"
npm run dev &
SERVER_PID=$!

# 서버 시작 대기
sleep 4

# 웹 실행 (포그라운드)
echo ""
echo -e "${CYAN}[Web] Next.js 개발 서버 시작 중...${NC}"
cd "$SCRIPT_DIR/packages/web"
npm run dev
