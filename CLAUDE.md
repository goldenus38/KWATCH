# KWATCH - 웹사이트 관제 시스템

## 프로젝트 개요

사이버안전센터에서 관리하는 약 500개 웹사이트의 **정상 작동 여부**와 **메인페이지 위변조 여부**를 실시간으로 관제하는 시스템입니다.

### 핵심 목적
- 웹사이트 HTTP 상태 및 응답시간 모니터링
- 메인페이지 스크린샷 캡처 및 위변조(defacement) 탐지
- 관제실 전면 전광판에 표시할 **Dark Theme 실시간 대시보드**
- 이상 발생 시 즉각 알림 (이메일/Slack/Telegram)

### 사용자
- 규모: 10명 이하 (보안관제 요원, 시스템 관리자)
- 인증: 간단한 ID/PW 로그인 (대시보드 전용 URL은 인증 없이 접근 가능하게 설정 가능)

---

## 기술 스택

| 계층 | 기술 | 버전 |
|------|------|------|
| **프론트엔드** | Next.js (App Router) | 14+ |
| **UI** | Tailwind CSS + shadcn/ui | latest |
| **차트/시각화** | Recharts 또는 Apache ECharts | latest |
| **실시간 통신** | Socket.IO | 4.x |
| **백엔드** | Node.js + Express 또는 NestJS | Node 20+ |
| **스크린샷 엔진** | Playwright | latest |
| **이미지 비교** | pixelmatch + pngjs | latest |
| **데이터베이스** | PostgreSQL | 15+ |
| **캐시/큐** | Redis + Bull Queue | latest |
| **ORM** | Prisma 또는 Drizzle ORM | latest |
| **컨테이너** | Docker + Docker Compose | latest |
| **언어** | TypeScript (전체) | 5.x |

---

## 프로젝트 구조

```
kwatch/
├── CLAUDE.md                    # 이 파일
├── docker-compose.yml           # 전체 서비스 오케스트레이션
├── docker-compose.dev.yml       # 개발 환경 오버라이드
├── .env.example                 # 환경변수 템플릿
├── .gitignore
│
├── packages/                    # 모노레포 (선택사항: 단일 repo도 가능)
│   ├── web/                     # Next.js 프론트엔드
│   │   ├── src/
│   │   │   ├── app/             # App Router 페이지
│   │   │   │   ├── (auth)/      # 인증 관련 페이지 그룹
│   │   │   │   │   └── login/
│   │   │   │   ├── (dashboard)/ # 관제 대시보드 (Dark Theme)
│   │   │   │   │   ├── layout.tsx        # 대시보드 전용 레이아웃
│   │   │   │   │   └── page.tsx          # 메인 대시보드
│   │   │   │   ├── (admin)/     # 관리 화면
│   │   │   │   │   ├── websites/         # 웹사이트 관리 CRUD
│   │   │   │   │   ├── categories/       # 카테고리 관리
│   │   │   │   │   ├── alerts/           # 알림 이력
│   │   │   │   │   └── settings/         # 시스템 설정
│   │   │   │   ├── api/         # Next.js API Routes (BFF 역할)
│   │   │   │   └── layout.tsx   # 루트 레이아웃
│   │   │   ├── components/
│   │   │   │   ├── ui/          # shadcn/ui 컴포넌트
│   │   │   │   ├── dashboard/   # 대시보드 전용 컴포넌트
│   │   │   │   │   ├── SummaryBar.tsx        # 상단 요약바
│   │   │   │   │   ├── ScreenshotGrid.tsx    # 스크린샷 그리드
│   │   │   │   │   ├── SiteCard.tsx          # 개별 사이트 카드
│   │   │   │   │   ├── AlertTimeline.tsx     # 하단 알림 타임라인
│   │   │   │   │   ├── StatusIndicator.tsx   # 상태 표시기
│   │   │   │   │   └── DetailPopup.tsx       # 상세 정보 팝업
│   │   │   │   ├── admin/       # 관리 화면 컴포넌트
│   │   │   │   └── common/      # 공통 컴포넌트
│   │   │   ├── hooks/           # 커스텀 훅
│   │   │   │   ├── useWebSocket.ts           # WebSocket 연결 관리
│   │   │   │   ├── useMonitoringData.ts      # 모니터링 데이터 구독
│   │   │   │   └── useAutoRotation.ts        # 자동 페이지 로테이션
│   │   │   ├── lib/             # 유틸리티
│   │   │   │   ├── api.ts                    # API 클라이언트
│   │   │   │   ├── socket.ts                 # Socket.IO 클라이언트
│   │   │   │   └── constants.ts              # 상수 정의
│   │   │   └── types/           # TypeScript 타입 정의
│   │   ├── public/
│   │   ├── tailwind.config.ts
│   │   ├── next.config.js
│   │   └── package.json
│   │
│   └── server/                  # 백엔드 서버
│       ├── src/
│       │   ├── app.ts                        # Express/NestJS 앱 엔트리
│       │   ├── config/                       # 설정 관리
│       │   ├── routes/          # API 라우트
│       │   │   ├── auth.ts
│       │   │   ├── websites.ts
│       │   │   ├── categories.ts
│       │   │   ├── monitoring.ts
│       │   │   ├── screenshots.ts
│       │   │   ├── defacement.ts
│       │   │   └── alerts.ts
│       │   ├── services/        # 비즈니스 로직
│       │   │   ├── MonitoringService.ts       # HTTP 상태 체크
│       │   │   ├── ScreenshotService.ts       # Playwright 스크린샷
│       │   │   ├── DefacementService.ts       # 위변조 탐지 로직
│       │   │   ├── AlertService.ts            # 알림 발송
│       │   │   └── SchedulerService.ts        # 작업 스케줄링
│       │   ├── workers/         # Bull Queue 워커
│       │   │   ├── monitoringWorker.ts        # 상태 체크 워커
│       │   │   ├── screenshotWorker.ts        # 스크린샷 캡처 워커
│       │   │   └── defacementWorker.ts        # 위변조 분석 워커
│       │   ├── websocket/       # WebSocket 서버
│       │   │   └── socketServer.ts            # Socket.IO 이벤트 핸들링
│       │   ├── middleware/      # 미들웨어
│       │   │   ├── auth.ts
│       │   │   ├── errorHandler.ts
│       │   │   └── rateLimiter.ts
│       │   ├── models/          # DB 모델 (Prisma schema 또는 Drizzle)
│       │   ├── utils/           # 유틸리티
│       │   └── types/           # 타입 정의
│       ├── prisma/
│       │   ├── schema.prisma                  # Prisma 스키마
│       │   └── migrations/                    # 마이그레이션 파일
│       ├── screenshots/         # 스크린샷 저장 디렉토리 (볼륨 마운트)
│       │   ├── current/                       # 현재 스크린샷
│       │   ├── baselines/                     # 베이스라인 스크린샷
│       │   └── diffs/                         # 차이 이미지
│       └── package.json
│
└── docs/                        # 프로젝트 문서
    └── 웹사이트_관제시스템_요구사항_정의서.docx
```

---

## 데이터베이스 스키마

### ERD 개요

```
users ──< alerts (acknowledged_by)
categories ──< websites
websites ──< monitoring_results
websites ──< screenshots
websites ──< defacement_baselines
websites ──< defacement_checks
websites ──< alerts
screenshots ──< defacement_baselines
screenshots ──< defacement_checks (current_screenshot_id)
defacement_baselines ──< defacement_checks
```

### 테이블 정의

```sql
-- ============================================
-- KWATCH 데이터베이스 스키마
-- ============================================

-- 1. 사용자 테이블
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(50) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    email           VARCHAR(255),
    role            VARCHAR(20) DEFAULT 'viewer' CHECK (role IN ('viewer', 'analyst', 'admin')),
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 카테고리 테이블
CREATE TABLE categories (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) UNIQUE NOT NULL,
    description     TEXT,
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 웹사이트 테이블
CREATE TABLE websites (
    id                      SERIAL PRIMARY KEY,
    url                     VARCHAR(2048) UNIQUE NOT NULL,
    name                    VARCHAR(200) NOT NULL,
    organization_name       VARCHAR(200),
    category_id             INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    description             TEXT,
    check_interval_seconds  INTEGER DEFAULT 300 CHECK (check_interval_seconds > 0),
    timeout_seconds         INTEGER DEFAULT 30 CHECK (timeout_seconds > 0),
    is_active               BOOLEAN DEFAULT true,
    defacement_mode         VARCHAR(20) DEFAULT 'auto',
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_websites_category ON websites(category_id);
CREATE INDEX idx_websites_active ON websites(is_active) WHERE is_active = true;

-- 4. 모니터링 결과 테이블
CREATE TABLE monitoring_results (
    id              BIGSERIAL PRIMARY KEY,
    website_id      INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    status_code     INTEGER,
    response_time_ms INTEGER,
    is_up           BOOLEAN NOT NULL,
    error_message   TEXT,
    checked_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_monitoring_website_time ON monitoring_results(website_id, checked_at DESC);
CREATE INDEX idx_monitoring_checked_at ON monitoring_results(checked_at DESC);

-- 5. 스크린샷 테이블
CREATE TABLE screenshots (
    id              BIGSERIAL PRIMARY KEY,
    website_id      INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    file_path       VARCHAR(500) NOT NULL,
    file_size       INTEGER,
    captured_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_screenshots_website_time ON screenshots(website_id, captured_at DESC);

-- 6. 위변조 베이스라인 테이블
CREATE TABLE defacement_baselines (
    id              SERIAL PRIMARY KEY,
    website_id      INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    screenshot_id   BIGINT NOT NULL REFERENCES screenshots(id) ON DELETE CASCADE,
    hash            VARCHAR(64),
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    is_active       BOOLEAN DEFAULT true
);

CREATE INDEX idx_baselines_website ON defacement_baselines(website_id) WHERE is_active = true;

-- 7. 위변조 체크 결과 테이블
CREATE TABLE defacement_checks (
    id                      BIGSERIAL PRIMARY KEY,
    website_id              INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    baseline_id             INTEGER NOT NULL REFERENCES defacement_baselines(id),
    current_screenshot_id   BIGINT NOT NULL REFERENCES screenshots(id),
    similarity_score        DECIMAL(5,2) CHECK (similarity_score >= 0 AND similarity_score <= 100),
    is_defaced              BOOLEAN NOT NULL DEFAULT false,
    diff_image_path         VARCHAR(500),
    checked_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_defacement_website_time ON defacement_checks(website_id, checked_at DESC);
CREATE INDEX idx_defacement_defaced ON defacement_checks(is_defaced) WHERE is_defaced = true;

-- 8. 알림 테이블
CREATE TABLE alerts (
    id              BIGSERIAL PRIMARY KEY,
    website_id      INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    alert_type      VARCHAR(20) NOT NULL CHECK (alert_type IN ('DOWN', 'SLOW', 'DEFACEMENT', 'SSL_EXPIRY', 'RECOVERED')),
    severity        VARCHAR(10) NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    message         TEXT NOT NULL,
    is_acknowledged BOOLEAN DEFAULT false,
    acknowledged_by INTEGER REFERENCES users(id),
    acknowledged_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_website_time ON alerts(website_id, created_at DESC);
CREATE INDEX idx_alerts_unacked ON alerts(created_at DESC) WHERE is_acknowledged = false;
CREATE INDEX idx_alerts_severity ON alerts(severity, created_at DESC);

-- 9. 알림 채널 설정 테이블
CREATE TABLE alert_channels (
    id              SERIAL PRIMARY KEY,
    channel_type    VARCHAR(20) NOT NULL CHECK (channel_type IN ('EMAIL', 'SLACK', 'TELEGRAM')),
    config          JSONB NOT NULL,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_websites_updated_at
    BEFORE UPDATE ON websites FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## API 설계

### 인증

```
POST   /api/auth/login              # 로그인 (JWT 발급)
POST   /api/auth/logout             # 로그아웃
GET    /api/auth/me                 # 현재 사용자 정보
```

### 웹사이트 관리

```
GET    /api/websites                # 목록 조회 (검색, 필터, 페이지네이션)
POST   /api/websites                # 등록
GET    /api/websites/:id            # 상세 조회
PUT    /api/websites/:id            # 수정
DELETE /api/websites/:id            # 삭제
POST   /api/websites/bulk           # CSV/Excel 대량 등록
```

### 카테고리

```
GET    /api/categories              # 목록 조회
POST   /api/categories              # 등록
PUT    /api/categories/:id          # 수정
DELETE /api/categories/:id          # 삭제
```

### 모니터링

```
GET    /api/monitoring/status       # 전체 상태 요약 (대시보드용)
GET    /api/monitoring/:websiteId   # 특정 사이트 모니터링 이력
GET    /api/monitoring/:websiteId/latest  # 최신 상태
```

### 스크린샷

```
GET    /api/screenshots/:websiteId          # 스크린샷 이력
GET    /api/screenshots/:websiteId/latest   # 최신 스크린샷
GET    /api/screenshots/image/:id           # 스크린샷 이미지 파일 반환
POST   /api/screenshots/:websiteId/capture  # 수동 캡처 트리거
```

### 위변조

```
GET    /api/defacement/:websiteId           # 위변조 체크 이력
GET    /api/defacement/:websiteId/latest    # 최신 체크 결과
POST   /api/defacement/:websiteId/baseline  # 베이스라인 갱신
GET    /api/defacement/diff/:checkId        # 차이 이미지 반환
```

### 알림

```
GET    /api/alerts                          # 알림 목록 (필터: type, severity, acknowledged)
PUT    /api/alerts/:id/acknowledge          # 알림 확인 처리
GET    /api/alerts/channels                 # 알림 채널 설정 조회
PUT    /api/alerts/channels/:id             # 알림 채널 설정 수정
```

### 설정

```
GET    /api/settings/monitoring             # 모니터링 설정 조회
PUT    /api/settings/monitoring/check-interval      # HTTP 체크 주기 일괄 변경
PUT    /api/settings/monitoring/screenshot-interval  # 스크린샷 주기 변경
PUT    /api/settings/monitoring/defacement-interval   # 위변조 체크 주기 변경
GET    /api/settings/defacement             # 위변조 탐지 설정 조회 (읽기 전용, 환경변수 기반)
```

### WebSocket 이벤트

```
# 서버 → 클라이언트 (대시보드 실시간 업데이트)
status:update          # 개별 사이트 상태 변경
status:bulk            # 전체 상태 벌크 업데이트
alert:new              # 신규 알림 발생
defacement:detected    # 위변조 감지
screenshot:updated     # 스크린샷 갱신 완료

# 클라이언트 → 서버
dashboard:subscribe    # 대시보드 구독 시작
dashboard:unsubscribe  # 대시보드 구독 해제
filter:change          # 필터 변경 (카테고리 등)
```

---

## 핵심 비즈니스 로직

### 모니터링 플로우

```
1. SchedulerService가 Bull Queue에 체크 작업 등록 (check_interval_seconds 기반)
2. monitoringWorker가 HTTP HEAD/GET 요청 수행
   - 상태 코드, 응답 시간 기록
   - timeout 초과 시 DOWN 판정
3. screenshotWorker가 Playwright로 메인페이지 스크린샷 캡처
   - 뷰포트: 1920x1080 (데스크탑 기준)
   - 스크린샷 저장 경로: screenshots/current/{websiteId}_{timestamp}.png
4. defacementWorker가 베이스라인 대비 현재 스크린샷 비교
   - pixelmatch로 픽셀 단위 비교
   - similarity_score 산출 (0~100%)
   - 임계값(기본 85%) 이하 시 위변조 경보
5. 이상 감지 시 AlertService가 알림 발송 + WebSocket으로 대시보드 실시간 반영
```

### 위변조 탐지 알고리즘

```typescript
// 1. 스크린샷 캡처 (Playwright)
const screenshot = await page.screenshot({ fullPage: false }); // 뷰포트만

// 2. 이미지 크기 정규화 (같은 사이즈로 리사이즈)
// sharp 라이브러리로 베이스라인과 동일 크기로 조정

// 3. pixelmatch로 비교
const numDiffPixels = pixelmatch(baselineImg, currentImg, diffImg, width, height, {
  threshold: 0.1,          // 색상 차이 민감도
  includeAA: false,        // 안티앨리어싱 무시
  alpha: 0.1,              // 투명도 차이 민감도
});

// 4. 유사도 계산
const totalPixels = width * height;
const similarityScore = ((totalPixels - numDiffPixels) / totalPixels) * 100;

// 5. 임계값 비교 (사이트별 설정 가능, 기본 85%)
const isDefaced = similarityScore < defacementThreshold;
```

### 오탐 방지 전략

- **동적 콘텐츠 영역 제외**: 광고 배너, 시간 표시, 뉴스 롤링 등 자주 변하는 영역을 마스킹
- **베이스라인 갱신**: 관리자가 정상적인 변경(디자인 개편 등)을 확인 후 수동 갱신
- **임계값 조정**: 사이트별로 민감도 다르게 설정 가능
- **연속 감지**: 1회 변경 감지 시 즉시 경보가 아닌, 2~3회 연속 감지 시 경보 (설정 가능)

---

## 대시보드 디자인 명세

### 레이아웃 구조 (관제실 전광판용)

```
┌──────────────────────────────────────────────────────────────────┐
│  KWATCH 관제 대시보드          ○ 정상 487  △ 경고 8  ✕ 장애 3  │  ← 상단 요약바
│                                ◎ 위변조 2   마지막 스캔: 14:32  │
├──────────────────────────────────────────────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐      │
│ │ 스샷 │ │ 스샷 │ │ 스샷 │ │ 스샷 │ │ 스샷 │ │ 스샷 │ │ 스샷 │  │
│ │     │ │     │ │     │ │     │ │     │ │     │ │     │      │  ← 중앙 스크린샷 그리드
│ │ ●정상│ │ ●정상│ │ ▲경고│ │ ●정상│ │ ✕장애│ │ ●정상│ │ ●정상│  │     (카드 형태)
│ │120ms│ │ 85ms│ │890ms│ │ 45ms│ │ ERR │ │200ms│ │ 67ms│      │
│ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘      │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐      │
│ │ ... │ │ ... │ │ ... │ │ ... │ │ ... │ │ ... │ │ ... │      │
│ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘      │
│                        페이지 1/15 ● ○ ○ ○ ○                   │  ← 페이지네이션
├──────────────────────────────────────────────────────────────────┤
│ 14:32 ✕ example.go.kr 접속불가 | 14:30 ◎ test.or.kr 위변조감지 │  ← 하단 알림 타임라인
│ 14:28 ○ sample.go.kr 복구완료 | 14:25 △ demo.go.kr 응답지연    │     (스크롤링)
└──────────────────────────────────────────────────────────────────┘
```

### 색상 체계 (Dark Theme)

```css
/* 배경 */
--bg-primary: #0F172A;      /* 메인 배경 (진한 남색) */
--bg-secondary: #1E293B;    /* 카드/컴포넌트 배경 */
--bg-tertiary: #334155;     /* 호버/활성 상태 */

/* 텍스트 */
--text-primary: #F1F5F9;    /* 주요 텍스트 */
--text-secondary: #94A3B8;  /* 보조 텍스트 */
--text-muted: #64748B;      /* 비활성 텍스트 */

/* 상태 색상 */
--status-normal: #00C853;   /* 정상 (녹색) */
--status-warning: #FFB300;  /* 경고 (노란색) */
--status-critical: #FF1744; /* 장애/위변조 (빨간색) */
--status-checking: #42A5F5; /* 점검 중 (파란색) */
--status-unknown: #78909C;  /* 알 수 없음 (회색) */

/* 강조 */
--accent: #3B82F6;          /* 주요 액센트 */
--accent-hover: #2563EB;    /* 액센트 호버 */
```

### 카드 컴포넌트 상세

각 사이트 카드는 다음 정보를 포함:
- 스크린샷 썸네일 (16:9 비율, lazy loading)
- 웹사이트명 (말줄임 처리)
- 상태 표시등 (녹/노/빨 dot)
- 응답 시간 (ms)
- 카드 테두리 색상으로 상태 표현 (정상: 투명, 경고: 노란 border, 장애: 빨간 border + glow 효과)
- 클릭 시 상세 팝업 (확대 스크린샷, 상태 이력 그래프, 위변조 탐지 분석, 베이스라인/diff 비교)

### 전광판 특화 기능

- **키오스크 모드**: F11 전체화면 + 마우스 커서 숨김
- **자동 로테이션**: 설정 가능한 간격(기본 15초)으로 페이지 자동 전환
- **이상 우선 표시**: 장애/위변조 사이트를 그리드 최상단에 고정
- **원거리 가독성**: 최소 폰트 16px, 상태 표시등 크기 충분히 확보
- **24시간 무중단**: 브라우저 메모리 누수 방지 (주기적 자동 새로고침 or WebSocket 재연결)

---

## 환경변수 (.env)

```env
# Database
DATABASE_URL=postgresql://kwatch:password@localhost:5432/kwatch

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=24h

# Server
PORT=3001
NODE_ENV=development

# Screenshot
SCREENSHOT_DIR=./screenshots
SCREENSHOT_VIEWPORT_WIDTH=1920
SCREENSHOT_VIEWPORT_HEIGHT=1080
SCREENSHOT_TIMEOUT=15000

# Monitoring
DEFAULT_CHECK_INTERVAL=300
DEFAULT_TIMEOUT=30
DEFACEMENT_THRESHOLD=85
DEFACEMENT_WEIGHT_PIXEL=0.3
DEFACEMENT_WEIGHT_STRUCTURAL=0.3
DEFACEMENT_WEIGHT_CRITICAL=0.4
HTML_ANALYSIS_ENABLED=true

# Alert Channels (JSON)
ALERT_EMAIL_SMTP_HOST=
ALERT_EMAIL_SMTP_PORT=
ALERT_EMAIL_FROM=
ALERT_SLACK_WEBHOOK_URL=
ALERT_TELEGRAM_BOT_TOKEN=
ALERT_TELEGRAM_CHAT_ID=

# Dashboard
DASHBOARD_TOKEN=         # 대시보드 전용 접근 토큰 (비어있으면 인증 없이 접근)
DASHBOARD_AUTO_ROTATE_INTERVAL=15000  # 자동 로테이션 간격 (ms)
DASHBOARD_ITEMS_PER_PAGE=35  # 페이지당 사이트 수 (7x5 그리드)
```

---

## Docker Compose 구성

```yaml
version: '3.8'

services:
  # PostgreSQL 데이터베이스
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: kwatch
      POSTGRES_USER: kwatch
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  # Redis (캐시 + 작업 큐)
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data

  # 백엔드 서버 (API + WebSocket + Worker)
  server:
    build:
      context: ./packages/server
      dockerfile: Dockerfile
    depends_on:
      - db
      - redis
    environment:
      DATABASE_URL: postgresql://kwatch:${DB_PASSWORD}@db:5432/kwatch
      REDIS_URL: redis://redis:6379
    volumes:
      - screenshots:/app/screenshots
    ports:
      - "3001:3001"

  # Next.js 프론트엔드
  web:
    build:
      context: ./packages/web
      dockerfile: Dockerfile
    depends_on:
      - server
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://server:3001
      NEXT_PUBLIC_WS_URL: ws://server:3001

volumes:
  pgdata:
  redisdata:
  screenshots:
```

---

## 개발 가이드라인

### 코딩 컨벤션

- **언어**: TypeScript strict mode 사용
- **네이밍**: camelCase (변수/함수), PascalCase (컴포넌트/클래스/타입), UPPER_SNAKE_CASE (상수)
- **파일명**: 컴포넌트는 PascalCase.tsx, 유틸/훅은 camelCase.ts
- **들여쓰기**: 2 spaces
- **따옴표**: 작은따옴표 (single quotes)
- **세미콜론**: 사용
- **import 순서**: 외부 라이브러리 → 내부 모듈 → 타입 → 스타일

### 에러 처리

- API 응답은 통일된 형식 사용:
  ```json
  { "success": true, "data": { ... } }
  { "success": false, "error": { "code": "NOT_FOUND", "message": "..." } }
  ```
- 모니터링 워커의 에러는 절대 프로세스를 중단시키면 안 됨 (try-catch 필수)
- 개별 사이트의 체크 실패가 전체 모니터링에 영향을 주지 않도록 격리

### 성능 요구사항

- 500개 사이트 전체 스캔: 5분 이내 (병렬 처리, 동시 10~20개)
- 대시보드 초기 로딩: 3초 이내
- WebSocket 상태 업데이트: 이벤트 발생 후 1초 이내 반영
- 스크린샷 이미지: 썸네일은 200x112 (16:9), 원본은 1920x1080

### 데이터 보관 정책

- 모니터링 결과: 90일 보관 후 자동 삭제 (cron job)
- 스크린샷: 최근 7일분만 보관 (베이스라인은 영구 보관)
- 알림 이력: 180일 보관
- 위변조 체크 결과: 90일 보관

---

## 개발 순서 (추천)

### Phase 1: 프로젝트 세팅 (1주)
1. 모노레포 구조 생성 (또는 단일 repo)
2. Docker Compose 환경 구축 (PostgreSQL + Redis)
3. Prisma/Drizzle ORM 설정 및 마이그레이션
4. 기본 Express/NestJS 서버 세팅
5. Next.js 프로젝트 세팅 (Tailwind + shadcn/ui)

### Phase 2: 웹사이트 관리 + 인증 (2주)
1. JWT 기반 로그인/로그아웃
2. 웹사이트 CRUD API + 프론트엔드
3. 카테고리 관리
4. CSV/Excel 대량 등록 기능

### Phase 3: 모니터링 엔진 (3주)
1. HTTP 상태 체크 워커 구현
2. Playwright 스크린샷 캡처 워커
3. pixelmatch 기반 위변조 탐지 로직
4. Bull Queue 스케줄링 시스템
5. 베이스라인 관리 API

### Phase 4: 관제 대시보드 (2주)
1. Dark Theme 대시보드 레이아웃
2. 스크린샷 그리드 컴포넌트
3. Socket.IO 실시간 연동
4. 상세 정보 팝업
5. 키오스크 모드 + 자동 로테이션

### Phase 5: 알림 + 통합 테스트 + 배포 (2주)
1. 이메일/Slack/Telegram 알림 연동
2. 통합 테스트
3. Docker 이미지 빌드 및 배포
4. 운영 환경 설정

---

## 현재 구현 상태 (2026-02-13)

### 완료된 Phase

| Phase | 상태 | 내용 |
|-------|------|------|
| Phase 1 | **완료** | 프로젝트 세팅, Docker Compose, Prisma ORM, Express 서버, Next.js |
| Phase 2 | **완료** | JWT 인증, 웹사이트/카테고리 CRUD, CSV 대량 등록 |
| Phase 3 | **완료** | HTTP 모니터링 워커, Playwright 스크린샷 워커, pixelmatch 위변조 탐지, BullMQ 스케줄링 |
| Phase 4 | **완료** | Dark Theme 대시보드, 스크린샷 그리드, Socket.IO 실시간, 키오스크 모드 |
| Phase 5 | **완료** | 알림(Email/Slack/Telegram), Vitest 통합 테스트(28개), Docker 배포 |
| Phase 6 | **완료** | 하이브리드 위변조 탐지 (HTML 구조 + 도메인 감사 + 픽셀 비교 3계층), 팝업 자동 제거 |
| Phase 7 | **완료** | 위변조 탐지 분석 UI 강화 (하이브리드 데이터 대시보드 노출, 설정 페이지) |
| Phase 8 | **완료** | SNS pixel_only 모드, 스크린샷 품질 관리, 대시보드 UX 개선 |

### 주요 구현 세부사항

- **SSL 인증서 검증 우회**: `NODE_TLS_REJECT_UNAUTHORIZED=0` (docker-compose.yml) + Playwright `ignoreHTTPSErrors: true` — 관제 시스템은 SSL 유효성 검증이 목적이 아니므로 중간 인증서 누락/도메인 불일치 등 모두 무시
- **에러 메시지 개선**: MonitoringService에서 `error.cause`의 실제 원인 추출 ("fetch failed" 대신 "unable to verify the first certificate" 등 표시)
- **대시보드 정렬 안정화**: ScreenshotGrid 정렬에 `websiteId` 보조 키 추가하여 동일 우선순위 사이트 순서 고정
- **모니터링**: HEAD 요청 우선, 4xx 응답 시 GET으로 자동 fallback (한국 공공기관 서버 호환)
- **스크린샷**: Docker 환경에서 시스템 Chromium 사용 (`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 환경변수)
- **팝업 자동 제거**: 스크린샷 캡처 전 한국 공공기관 사이트 팝업을 자동 dismiss
  - JS dialog (`alert`/`confirm`/`prompt`) 자동 dismiss
  - `window.open` 팝업 차단
  - 레이어 팝업 자동 닫기 ("오늘 하루 안 보기" 등 20+ 한국어 패턴)
  - `position: fixed` + 높은 z-index 오버레이 DOM 제거
  - body 스크롤 잠금 해제
- **하이브리드 위변조 탐지** (3계층 모델):
  - Layer 1: **외부 도메인 감사** — `<script>`, `<iframe>`, `<link>` 등의 src에서 새 외부 도메인 탐지
  - Layer 2: **HTML 구조 핑거프린트** — 태그 트리 SHA-256 해시로 페이지 구조 변경 감지
  - Layer 3: **픽셀 비교** — 기존 pixelmatch 기반 시각적 변화 감지
  - 하이브리드 점수: `pixel×0.3 + structural×0.3 + critical×0.4`
  - 베이스라인에 HTML 데이터 없으면 pixel_only 모드로 자동 fallback
  - `HTML_ANALYSIS_ENABLED=false`로 킬스위치 가능
- **심각도별 차등 알림**:
  - 새 외부 도메인 주입 → CRITICAL, 1회 즉시 알림
  - 페이지 구조 변경 → CRITICAL, 2회 연속 시 알림
  - 픽셀만 변경 → WARNING, 3회 연속 시 알림
- **사이트별 동적 영역 제외**: `ignoreSelectors` (CSS 셀렉터 배열)로 사이트별 동적 영역 설정 가능
- **사이트별 위변조 탐지 모드**: `defacementMode` 필드로 사이트별 탐지 모드 설정
  - `auto` (기본): 기존 하이브리드 탐지 동작 (베이스라인에 HTML 데이터 있으면 hybrid, 없으면 pixel_only)
  - `pixel_only`: HTML 구조/도메인 분석 스킵, 픽셀 비교만 수행
  - SNS 사이트(Facebook, Instagram, YouTube, X/Twitter)는 CDN 도메인 변동/SPA 구조로 인한 오탐 방지를 위해 `pixel_only` 적용
- **성능 최적화** (1000개 사이트 대응):
  - 워커 concurrency 환경변수화 (`MONITORING_CONCURRENCY`, `SCREENSHOT_CONCURRENCY`, `DEFACEMENT_CONCURRENCY`)
  - Staggered scheduling: 서버 시작 시 모든 작업의 첫 실행을 `STAGGER_WINDOW_SECONDS`(기본 60초) 내 균등 분산 (thundering herd 방지, 전체 사이클 5분 이내 달성)
  - 미사용 `checkAllWebsites()` 메서드 제거 (BullMQ 워커 파이프라인과 중복)
  - Docker 서비스별 메모리 제한 설정 (server: 4G, db: 1G, redis: 512M)
- **스케줄러 연동**: 웹사이트 등록/수정/삭제 시 자동으로 모니터링 스케줄 생성/갱신/제거
- **Rate Limiter**: 스크린샷 이미지 엔드포인트는 rate limit 제외, API는 15분/1000회
- **CORP 헤더**: 스크린샷 이미지에 `Cross-Origin-Resource-Policy: cross-origin` 설정 (cross-origin img 로드 허용)
- **인증 미들웨어**: Role 비교 시 case-insensitive (Prisma enum은 대문자, 코드는 소문자)
- **최종 리다이렉트 URL 기록**: `finalUrl` 필드로 `response.url` 저장 (DB `monitoring_results.final_url` 컬럼), DetailPopup에서 요청 URL과 다를 때 최종 URL 표시
- **대시보드 기관명 표시**: SiteCard/DetailPopup에서 `organizationName`이 있으면 "기관명 사이트명" 형식으로 표시, MonitoringStatus API 응답에 `organizationName` 필드 추가
- **관리 페이지 컬럼 순서 변경**: 카테고리→기관명→사이트명→URL 순서로 가독성 개선
- **테스트**: Vitest + Supertest, Prisma/Redis/WebSocket/Logger 전체 mock (총 73개, HtmlAnalysisService 29개 포함)
- **위변조 탐지 분석 UI** (Phase 7):
  - DetailPopup: "베이스라인 비교" → "위변조 탐지 분석"으로 교체
    - 탐지 방식 뱃지 (하이브리드/픽셀 전용), 종합 유사도 점수 헤더
    - 하이브리드 모드: 3개 ScoreBar (픽셀 비교 30%, HTML 구조 분석 30%, 외부 도메인 감사 40%)
    - pixel_only 모드: 1개 ScoreBar (픽셀 유사도)
    - 새 외부 도메인 감지 시 빨간 경고 박스 + 도메인 목록
    - 제거된 외부 도메인 시 노란 경고 박스 + 도메인 목록
    - 베이스라인/diff 이미지 비교 그리드 유지
  - Settings 페이지: "위변조 탐지 설정" 읽기 전용 섹션 추가
    - 4칸 요약 카드 (임계값, HTML 분석 상태, 탐지 모드, 가중치 합계)
    - 하이브리드 점수 가중치 시각화 바
  - MonitoringStatus API 응답에 `htmlSimilarityScore`, `detectionMethod` 필드 추가
  - `GET /api/settings/defacement` 엔드포인트 추가 (임계값, 가중치, HTML 분석 활성화 상태)
- **사이트별 위변조 탐지 모드 (Phase 8)**:
  - `defacementMode` 필드 추가 (Prisma schema + API + 프론트엔드)
  - 값: `auto` (기본, 하이브리드) | `pixel_only` (HTML 분석 스킵)
  - SNS 사이트 URL 자동 감지: `shouldForcePixelOnly()` — facebook, instagram, youtube, x.com, twitter, blog.naver.com, tiktok
  - 웹사이트 등록(POST)/수정(PUT)/일괄등록(POST bulk) 모두 지원
  - DefacementService에서 `forcePixelOnly` 조건 반영, 중복 DB 쿼리 제거
  - 관리 UI: 웹사이트 관리 폼에 "위변조 탐지 모드" 드롭다운 추가
- **스크린샷 품질 관리 (Phase 8)**:
  - 최소 파일 크기 검증: 30KB 미만 → 불량 스크린샷으로 판단, 저장하지 않음
  - 베이스라인 대비 크기 비율 검증: 25% 미만 → 위변조 체크 스킵 (SPA 미렌더링/로그인 월 감지)
  - 재시도 전략: extra-wait (3초 추가 대기) → networkidle-reload (페이지 리로드)
  - 모든 재시도 실패 시 스크린샷 미저장 (에러 throw)
  - 영어 팝업 패턴 추가: "Not now", "Accept Cookies", "Dismiss", "Skip" 등
  - SNS 모달 셀렉터 추가: `[role="dialog"]`, `[role="presentation"]`, 쿠키 배너, YouTube 동의
  - dismissPopups null safety: `if (!el.parentNode) continue;` + per-element try-catch
- **대시보드 UX 개선 (Phase 8)**:
  - DetailPopup 헤더에 설정 아이콘(톱니바퀴) — 클릭 시 `/websites?search=사이트명`으로 이동, 자동 검색
  - DetailPopup 헤더에 새로고침 아이콘 — 클릭 시 즉시 모니터링+스크린샷 큐 등록
  - 새로고침 폴링 방식: 스크린샷 URL 변경 감지까지 3초 간격 폴링 (최대 60초)
  - 새로고침 진행 상태 표시: "상태 체크 중... (5초)" → "스크린샷 캡처 대기 중... (15초)" → "데이터 갱신 중..."
  - DetailPopup 열 때마다 `GET /api/monitoring/:websiteId/latest`로 최신 URL/상태 fetch (관리 페이지에서 URL 변경 시 즉시 반영)
  - 이미지 캐시 버스팅: 새로고침 후 `?t={timestamp}` 추가
  - `POST /api/monitoring/:websiteId/refresh` 엔드포인트 추가 (모니터링+스크린샷 즉시 큐잉)
  - `SchedulerService.enqueueMonitoringCheck()` 메서드 추가
  - 웹사이트 관리 페이지: `useSearchParams`로 URL의 `search` 파라미터 자동 검색
- **대시보드 실시간 복원 (Phase 8)**:
  - 모듈 레벨 캐시 (`cachedSummary`, `cachedStatuses`, `cachedAlerts`) 도입
  - 설정→대시보드 이동 시 캐시된 데이터로 즉시 표시 (로딩 스켈레톤 없음)
  - WebSocket 재연결 시 자동 데이터 refetch (서버 재시작 대응)
  - WebSocket 이벤트에서도 캐시 동기화

### 하이브리드 위변조 탐지 환경변수

```env
# 하이브리드 점수 가중치 (합계 1.0)
DEFACEMENT_WEIGHT_PIXEL=0.3
DEFACEMENT_WEIGHT_STRUCTURAL=0.3
DEFACEMENT_WEIGHT_CRITICAL=0.4

# HTML 분석 킬스위치 (false로 설정 시 pixel_only 모드)
HTML_ANALYSIS_ENABLED=true
```

### 성능 설정 (워커 Concurrency)

```env
# Stagger 윈도우 (서버 시작 시 첫 실행 분산 시간, 초)
STAGGER_WINDOW_SECONDS=60    # 기본 60초 (5분 내 전체 사이클 달성)

# 워커 동시 처리 수 (사이트 수에 따라 조정)
MONITORING_CONCURRENCY=20    # HTTP 체크 동시 처리 (기본 20)
SCREENSHOT_CONCURRENCY=15    # 스크린샷 캡처 동시 처리 (기본 15, 메모리 집약적)
DEFACEMENT_CONCURRENCY=8     # 위변조 분석 동시 처리 (기본 8, CPU 집약적)
```

**권장 설정값 (사이트 수 기준):**

| 환경변수 | 500개 | 1000개 | 근거 |
|---------|-------|--------|------|
| `MONITORING_CONCURRENCY` | 20 | 20 | 1000÷20×1s=50s < 60s interval |
| `SCREENSHOT_CONCURRENCY` | 15 | 15 | 메모리 ~1.5-2GB (15 Playwright 페이지) |
| `DEFACEMENT_CONCURRENCY` | 8 | 8 | CPU-bound, 8이면 충분 |

**Thundering Herd 방지:**
- `scheduleAllWebsites()`에서 각 웹사이트의 첫 실행을 `STAGGER_WINDOW_SECONDS`(기본 60초) 내에 균등 분산
- 서버 시작 시 모든 작업이 동시에 큐잉되지 않음
- 개별 웹사이트 등록/수정 시에는 즉시 실행 (delay=0)

**스크린샷 전체 사이클 5분 이내 최적화:**
- Stagger 윈도우를 `checkIntervalSeconds`(300초)에서 60초 고정으로 축소 → 240초 절약
- Playwright `waitForTimeout(3000)` → `1000`으로 축소
- 팝업 제거 후 `waitForTimeout(500)` 제거 (동기 DOM 조작이므로 불필요)
- `waitUntil: 'networkidle'` → `'load'` 변경 (이미지/CSS/JS 리소스 로드까지 대기하되 네트워크 유휴 대기 없음, SPA 사이트 렌더링 보장)
- DOWN 사이트 스크린샷 스킵 (모니터링에서 DOWN 판정된 사이트는 스크린샷 큐에 추가하지 않음)
- 스크린샷 타임아웃 30s → 15s 축소 (load 이벤트 방식에서 정상 사이트는 5s 내 로드)
- 스크린샷 재시도 3회 → 1회 (다음 모니터링 사이클에서 자연 재시도)
- 스크린샷 concurrency 10 → 15 증가 (~1.5GB 메모리, server 4GB 제한 내)
- 예상 소요시간: 503사이트 기준 ~2분 ((400×3 + 50×15) / 15 ≈ 130s)

### 코드 리뷰 (2026-02-13)

v1.0 전체 코드 리뷰 수행 후 9건 수정 완료:

**CRITICAL (4건 수정):**
- 로그인 페이지 하드코딩 자격증명(`admin/admin1234`) 제거
- 관리자 페이지(`/admin`) 인증 가드 추가 (token+user 검증, 미인증 시 `/login` 리다이렉트)
- Settings 페이지 미구현 버튼(대시보드 저장, 사용자 수정/삭제/추가) `disabled` 처리
- WebSocket `console.log` 제거 (`connect_error`의 `console.error`만 유지)

**HIGH (2건 수정):**
- SiteCard 이미지 `onError` 핸들러 추가 (깨진 이미지 대신 "No Image" fallback)
- MonitoringService 테스트 mock 데이터 수정 (연속 실패 5회/위변조 3회 임계값 반영)

**MEDIUM (3건 수정):**
- Tailwind 폰트 설정을 `Noto Sans KR`로 통일 (layout.tsx와 일치)
- `useMonitoringData` 의존성 배열 `[filter]` → `[]` (무한 루프 방지)
- SiteCard에 `React.memo` 적용 (불필요한 리렌더 방지)

### 코드 리뷰 2차 (2026-02-13)

1차 리뷰 이후 추가 8건 수정:

**타입 안전성 (3건):**
- `websites.ts`: `const where: any` → `Prisma.WebsiteWhereInput` 타입 적용
- `socketServer.ts`: `emitDefacementDetected` 파라미터에서 `| any` 제거
- `types/index.ts`: `WsDefacementDetected.diffImageUrl` 타입을 `string | null`로 수정

**버그 수정 (1건):**
- `websites.ts` PUT: `checkIntervalSeconds &&` / `timeoutSeconds &&` → `!== undefined` (값이 0일 때 falsy로 무시되는 버그)

**보안 (1건):**
- `socketServer.ts`: WebSocket CORS `origin: '*'` → 개발환경만 와일드카드, 운영환경은 localhost 제한

**설정 일관성 (1건):**
- `errorHandler.ts`: `process.env.NODE_ENV === 'production'` → `config.isDev` 사용으로 통일

**접근성/UX (2건):**
- `StatusIndicator.tsx`: `title`/`aria-label`을 한국어로 변경 (정상/경고/장애/점검 중/알 수 없음)
- `DetailPopup.tsx`: 베이스라인/차이분석 이미지 `alt`에 웹사이트명 포함, `Promise.allSettled` rejected 시 `console.error` 추가

**React 최적화 (1건):**
- `ScreenshotGrid.tsx`: 빈 슬롯 key에 페이지 컨텍스트 포함 (`empty-${currentPage}-${i}`)

### 코드 리뷰 3차 (v1.1.0, 2026-02-13)

v1.1.0 기능 추가(finalUrl, organizationName 대시보드 노출) 코드 리뷰:

**결과: 이상 없음** — 타입 안전성, 테스트, 기능 정합성, 보안 모두 통과

**테스트 보완 (1건):**
- `MonitoringService.test.ts`: mock 데이터에 `organizationName`, `finalUrl` 추가 + `getAllStatuses` 테스트에 새 필드 assertion 추가

### 알려진 이슈

- Prisma migration 미생성: 현재 `prisma db push`로 스키마 동기화 중. 운영 전 `prisma migrate dev --name init` 필요

### 개발 환경 (macOS)

- **Docker 런타임**: Colima (Docker Desktop 대체)
  ```bash
  colima start               # Docker 데몬 시작
  colima stop                # Docker 데몬 중지
  colima status              # 상태 확인
  docker compose up -d       # 컨테이너 실행
  docker compose down        # 컨테이너 중지
  docker compose build       # 이미지 리빌드
  ```

### 운영 환경 (Rocky Linux 8.10)

- Docker Engine + Docker Compose V2 직접 설치 (Docker Desktop 불필요)
- `docker compose up -d`로 4개 컨테이너(db, redis, server, web) 실행
- server 컨테이너의 `docker-entrypoint.sh`가 Prisma migrate/push 자동 실행

### Git 기반 운영서버 배포

개발PC에서 `git push`만으로 운영서버에 자동 배포할 수 있습니다.

**초기 설정 (운영서버에서 1회):**
```bash
# 운영서버에서 setup 스크립트 실행
sudo bash scripts/setup-git-deploy.sh

# .env 파일 설정
cp /opt/kwatch/.env.example /opt/kwatch/.env
vi /opt/kwatch/.env  # DB_PASSWORD, JWT_SECRET 등 실제 값 입력
```

**개발PC에서 remote 추가:**
```bash
git remote add production ssh://사용자@서버IP/opt/kwatch.git
```

**배포 (개발PC에서):**
```bash
git push production master   # master 브랜치 push 시 자동 빌드+배포
```

**수동 배포 (운영서버에서):**
```bash
cd /opt/kwatch
git pull origin master
bash scripts/deploy.sh
```

**동작 원리:**
1. `git push production master` → bare repo의 `post-receive` hook 실행
2. hook이 작업 디렉토리(`/opt/kwatch`)를 최신으로 업데이트
3. `scripts/deploy.sh` 실행: Docker 이미지 빌드 → 컨테이너 재시작 → 헬스체크
4. `docker-entrypoint.sh`가 Prisma migration 자동 적용

### 테스트 실행

```bash
cd packages/server
npx vitest run          # 전체 테스트 (57개)
npx vitest run --coverage  # 커버리지 포함
npx tsc --noEmit        # 타입 체크
```

### 관리자 계정 생성 (초기 배포 시)

```bash
# 컨테이너 내부에서 bcrypt 해시 생성
HASH=$(docker exec kwatch-server node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('비밀번호', 10).then(h => console.log(h))")

# DB에 직접 삽입
docker exec kwatch-db psql -U kwatch -d kwatch -c \
  "INSERT INTO users (username, password_hash, email, role) VALUES ('admin', '$HASH', 'admin@example.com', 'admin');"
```

---

## 참고 사항

- 이 프로젝트의 요구사항 정의서는 `docs/웹사이트_관제시스템_요구사항_정의서.docx`에 있습니다.
- 위변조 탐지 관련 참고 오픈소스: Uptime Kuma, changedetection.io, In0ri
- 대시보드 디자인 참고: SOC/NOC 대시보드 모범 사례 (Exception-Based Display, Single Pane of Glass)
- 한국어 UI를 기본으로 하되, 코드 내 주석과 변수명은 영어를 사용합니다.
