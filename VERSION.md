# KWATCH 버전 이력

## v1.4.0 (2026-02-14) — 대시보드 UX 개선 + HTTP 모니터링 강화 + 사이트별 가중치

### 신규 기능

- **DetailPopup 열림 시 자동전환 일시정지**
  - `useAutoRotation` 훅에 `paused` prop 추가
  - 팝업 열린 동안 페이지 자동 로테이션 정지, 닫으면 자동 재개

- **HTTP 리다이렉트 수동 추적**
  - `redirect: 'follow'` → `redirect: 'manual'`로 전환
  - 최대 10회 리다이렉트를 직접 따라가며 `finalUrl` 정확 기록
  - 초과 시 "리다이렉트 횟수 초과 (10회)" 에러 반환

- **DetailPopup HTTP 상태 새로고침**
  - "HTTP 상태" 라벨 옆 새로고침 아이콘 + 경과시간(초) 표시
  - POST refresh → 3초 폴링으로 `checkedAt` 변경 감지 (최대 30초)
  - 상태 갱신 시 응답추이 차트 데이터도 동시 갱신

- **URL 수정 시 즉시 베이스라인/스크린샷 갱신**
  - 웹사이트 PUT에서 URL 변경 감지 → 기존 베이스라인 전체 비활성화
  - 즉시 모니터링+스크린샷 큐잉 (새 스크린샷 캡처 후 자동 베이스라인 생성)

- **사이트별 가중치 커스텀 설정**
  - Prisma: `useCustomWeights`, `customWeightPixel/Structural/Critical` 필드
  - 웹사이트 등록/수정 API에서 커스텀 가중치 지원, 합계 1.0 검증
  - DefacementService에서 사이트별 가중치 우선 적용

### 개선사항

- **브라우저 유사 헤더**: `KWATCH/1.0` UA → Chrome UA + Accept/Accept-Language/Accept-Encoding 추가 (WAF/방화벽 호환성 향상)
- **DNS/네트워크 일시 오류 재시도**: ENOTFOUND/ECONNRESET/UND_ERR_CONNECT_TIMEOUT 감지 시 2초 대기 후 1회 재시도
- **한국어 에러 메시지**: "DNS 해석 실패 (hostname)", "연결 시간 초과 (address)", "요청 시간 초과 (N초)"

### 버그 수정

- **monitoringWorker finalUrl 미저장**: `prisma.monitoringResult.create()`에 `finalUrl: result.finalUrl` 누락 수정

### 변경된 파일

| 파일 | 변경 내용 |
|------|----------|
| `server/prisma/schema.prisma` | `useCustomWeights`, `customWeightPixel/Structural/Critical` 필드 추가 |
| `server/src/services/MonitoringService.ts` | 수동 리다이렉트 추적, 브라우저 UA, DNS 재시도, 한국어 에러 메시지 |
| `server/src/services/DefacementService.ts` | 사이트별 커스텀 가중치 적용 |
| `server/src/routes/websites.ts` | URL 변경 시 베이스라인 비활성화 + 즉시 큐잉, 커스텀 가중치 API |
| `server/src/routes/defacement.ts` | recheck 엔드포인트 웹사이트 URL 조회 추가 |
| `server/src/workers/monitoringWorker.ts` | `finalUrl` DB 저장 추가 |
| `server/src/types/index.ts` | 커스텀 가중치 타입 추가 |
| `server/src/__tests__/services/MonitoringService.test.ts` | 에러 메시지 한국어화 반영 |
| `web/src/hooks/useAutoRotation.ts` | `paused` prop 추가 |
| `web/src/app/(dashboard)/page.tsx` | `paused: selectedStatus !== null` 전달 |
| `web/src/components/dashboard/DetailPopup.tsx` | HTTP 상태 새로고침 아이콘 + 차트 갱신 |
| `web/src/app/(admin)/websites/page.tsx` | 커스텀 가중치 폼 UI |
| `web/src/types/index.ts` | 커스텀 가중치 타입 추가 |

---

## v1.3.0 (2026-02-13) — SNS pixel_only + 스크린샷 품질 관리 + 대시보드 UX 개선

### 신규 기능

- **사이트별 위변조 탐지 모드 (`defacementMode`)**
  - `auto` (기본): 하이브리드 탐지 | `pixel_only`: 픽셀 비교만 수행
  - SNS 사이트(Facebook, Instagram, YouTube, X/Twitter, TikTok, 네이버블로그) URL 자동 감지 → `pixel_only` 적용
  - 웹사이트 관리 UI에 "위변조 탐지 모드" 드롭다운 추가
  - POST/PUT/Bulk API에서 `defacementMode` 지원

- **스크린샷 품질 관리**
  - 최소 크기 검증: 30KB 미만 → 불량 판정, 저장하지 않음
  - 베이스라인 대비 25% 미만 → 위변조 체크 스킵
  - 재시도 전략: extra-wait(3초) → networkidle-reload
  - 영어 팝업/SNS 로그인 월/쿠키 배너 자동 제거
  - dismissPopups null safety 강화

- **대시보드 수동 새로고침**
  - DetailPopup 헤더에 새로고침 아이콘 추가
  - `POST /api/monitoring/:websiteId/refresh` — 모니터링+스크린샷 즉시 큐잉
  - 폴링 방식으로 스크린샷 갱신 감지 (3초 간격, 최대 60초)
  - 실시간 진행 상태 표시 ("상태 체크 중..." → "스크린샷 캡처 대기 중..." → "데이터 갱신 중...")

- **대시보드 → 사이트 관리 연동**
  - DetailPopup 헤더에 설정 아이콘(톱니바퀴) 추가
  - 클릭 시 `/websites?search=사이트명`으로 이동, 자동 검색

### 개선사항

- **대시보드 실시간 복원**: 서버 재시작 시 WebSocket 재연결 후 자동 데이터 refetch
- **페이지 이동 지연 제거**: 모듈 레벨 캐시로 설정→대시보드 복귀 시 즉시 표시
- **DetailPopup 데이터 최신화**: 팝업 열 때마다 최신 모니터링 상태 API fetch (URL 변경 등 즉시 반영)
- **이미지 캐시 버스팅**: 새로고침 후 `?t={timestamp}`로 브라우저 캐시 무효화

### 변경된 파일

| 파일 | 변경 내용 |
|------|----------|
| `prisma/schema.prisma` | `defacementMode` 필드 추가 |
| `server/src/types/index.ts` | `WebsiteCreateInput`, `WebsiteUpdateInput`에 `defacementMode` 추가 |
| `server/src/services/DefacementService.ts` | `forcePixelOnly` 조건, website 쿼리 통합 |
| `server/src/services/ScreenshotService.ts` | 품질 검증, 재시도 전략, SNS 팝업 제거, null safety |
| `server/src/services/SchedulerService.ts` | `enqueueMonitoringCheck()` 추가 |
| `server/src/routes/websites.ts` | `shouldForcePixelOnly()`, POST/PUT/Bulk `defacementMode` 지원 |
| `server/src/routes/monitoring.ts` | `POST /:websiteId/refresh` 엔드포인트 추가 |
| `server/src/workers/screenshotWorker.ts` | 절대 크기 검증 제거 (ScreenshotService로 이관), 베이스라인 비율 검증 유지 |
| `web/src/types/index.ts` | `Website.defacementMode` 추가 |
| `web/src/app/(admin)/websites/page.tsx` | `defacementMode` 폼 필드, `useSearchParams` 검색 연동 |
| `web/src/components/dashboard/DetailPopup.tsx` | 설정/새로고침 아이콘, 폴링, 진행 상태, localStatus, cacheBuster |
| `web/src/hooks/useMonitoringData.ts` | 모듈 레벨 캐시, WebSocket 재연결 refetch |

---

## v1.2.0 (2026-02-13) — 위변조 탐지 점진적 구조 비교 + 성능 최적화 + 관리 UI 강화

- 하이브리드 위변조 탐지 3계층 모델 (픽셀+구조+도메인 감사)
- 위변조 탐지 분석 UI (ScoreBar, 도메인 경고, 설정 페이지)
- 스크린샷 사이클 성능 최적화 (56분 → ~2분)
- 팝업 자동 제거 (한국 공공기관 사이트)

## v1.1.0 (2026-02-13) — finalUrl 추적 + 기관명 표시

- 최종 리다이렉트 URL 기록 (`finalUrl`)
- 대시보드 기관명 표시
- 관리 페이지 컬럼 순서 변경

## v1.0.0 (2026-02-13) — 초기 릴리스

- 웹사이트 모니터링 (HTTP 상태, 응답 시간)
- Playwright 스크린샷 캡처
- pixelmatch 위변조 탐지
- Dark Theme 관제 대시보드
- Socket.IO 실시간 업데이트
- 알림 (Email/Slack/Telegram)
- JWT 인증, 웹사이트/카테고리 CRUD
- Docker Compose 배포
