#!/bin/bash
# ============================================
# 운영서버 Git 기반 배포 초기 설정 스크립트
#
# 이 스크립트를 운영서버에서 한 번 실행하면:
# 1. bare git repo 생성 (/opt/kwatch.git)
# 2. post-receive hook 설정 (git push 시 자동 배포)
# 3. 작업 디렉토리 clone (/opt/kwatch)
#
# 사용법 (운영서버에서):
#   sudo bash scripts/setup-git-deploy.sh
#
# 설정 후 개발PC에서:
#   git remote add production ssh://user@서버IP/opt/kwatch.git
#   git push production master
# ============================================
set -e

BARE_REPO="/opt/kwatch.git"
WORK_DIR="/opt/kwatch"
DEPLOY_USER="${DEPLOY_USER:-$(whoami)}"

echo "============================================"
echo "KWATCH Git 배포 환경 설정"
echo "Bare repo: $BARE_REPO"
echo "Work dir:  $WORK_DIR"
echo "User:      $DEPLOY_USER"
echo "============================================"

# 1. Bare repository 생성
if [ -d "$BARE_REPO" ]; then
  echo "기존 bare repo가 있습니다: $BARE_REPO"
else
  echo "Bare repository 생성 중..."
  mkdir -p "$BARE_REPO"
  git init --bare "$BARE_REPO"
  echo "Bare repository 생성 완료"
fi

# 2. 작업 디렉토리 생성
if [ -d "$WORK_DIR" ]; then
  echo "기존 작업 디렉토리가 있습니다: $WORK_DIR"
else
  echo "작업 디렉토리 clone 중..."
  git clone "$BARE_REPO" "$WORK_DIR"
  echo "작업 디렉토리 생성 완료"
fi

# 3. post-receive hook 설정
HOOK_FILE="$BARE_REPO/hooks/post-receive"
echo "post-receive hook 설정 중..."

cat > "$HOOK_FILE" << 'HOOK_EOF'
#!/bin/bash
# ============================================
# KWATCH post-receive hook
# git push 시 자동으로 배포를 실행합니다
# ============================================
set -e

WORK_DIR="/opt/kwatch"
LOG_FILE="/opt/kwatch/logs/deploy.log"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 푸시된 브랜치 확인 (master만 배포)
while read oldrev newrev refname; do
  BRANCH=$(echo "$refname" | sed 's|refs/heads/||')
  if [ "$BRANCH" != "master" ]; then
    log "브랜치 '$BRANCH' 푸시됨 - master가 아니므로 배포 생략"
    continue
  fi

  log "=========================================="
  log "master 브랜치 푸시 감지 - 자동 배포 시작"
  log "Commit: $(echo $newrev | head -c 8)"
  log "=========================================="

  # 작업 디렉토리 업데이트
  cd "$WORK_DIR"

  # unset GIT_DIR to avoid issues with git commands in work tree
  unset GIT_DIR

  git fetch origin
  git reset --hard "origin/master"

  # 배포 스크립트 실행
  if [ -f scripts/deploy.sh ]; then
    bash scripts/deploy.sh
  else
    log "오류: scripts/deploy.sh를 찾을 수 없습니다."
    exit 1
  fi

  log "자동 배포 완료"
done
HOOK_EOF

chmod +x "$HOOK_FILE"
echo "post-receive hook 설정 완료"

# 4. 디렉토리 소유권 설정
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$BARE_REPO" 2>/dev/null || true
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$WORK_DIR" 2>/dev/null || true

# 5. 로그 디렉토리 생성
mkdir -p "$WORK_DIR/logs"

echo ""
echo "============================================"
echo "설정 완료!"
echo ""
echo "다음 단계:"
echo ""
echo "1. 운영서버에서 .env 파일 설정:"
echo "   cp $WORK_DIR/.env.example $WORK_DIR/.env"
echo "   vi $WORK_DIR/.env"
echo ""
echo "2. 개발PC에서 remote 추가:"
echo "   git remote add production ssh://\$USER@서버IP${BARE_REPO}"
echo ""
echo "3. 배포 (개발PC에서):"
echo "   git push production master"
echo ""
echo "4. 수동 배포 (운영서버에서):"
echo "   cd $WORK_DIR && bash scripts/deploy.sh"
echo "============================================"
