# KWATCH Phase 1-2 코드 리뷰 결과 보고서

## 개요

Phase 1(프로젝트 구조 세팅)과 Phase 2(인증 + 웹사이트/카테고리 CRUD) 코드를 전체 리뷰하고, 발견된 이슈를 수정 완료했습니다.

---

## 리뷰 결과 요약

| 등급 | 백엔드 | 프론트엔드 | 합계 | 수정 완료 |
|------|--------|-----------|------|----------|
| CRITICAL | 6건 | 4건 | 10건 | 10건 |
| WARNING | 8건 | 6건 | 14건 | 14건 |
| INFO | 8건 | 10건 | 18건 | - (향후 개선) |

---

## CRITICAL 이슈 (모두 수정 완료)

### 백엔드

1. **모듈 레벨 Prisma 인스턴스화**
   - `auth.ts`, `categories.ts`에서 `getDbClient()`를 모듈 스코프에서 호출
   - DB 연결 전 참조 시 크래시 위험
   - **수정**: 모든 라우트 핸들러 내부에서 `getDbClient()` 호출로 변경

2. **약한 JWT 시크릿 기본값**
   - `config/index.ts`에서 `dev-secret-key`가 프로덕션에서도 사용될 위험
   - **수정**: 프로덕션 환경에서 기본 시크릿 사용 시 서버 시작 차단

3. **입력 유효성 검사 누락**
   - `checkIntervalSeconds`, `timeoutSeconds` 범위 검증 없음
   - **수정**: 10~86400초, 5~120초 범위 제한 추가

4. **GET 엔드포인트 인증 누락**
   - `GET /api/websites`, `GET /api/categories`에 `authenticate` 미들웨어 미적용
   - **수정**: 모든 GET 라우트에 `authenticate` 추가

5. **CORS 전체 허용**
   - `app.use(cors())` 모든 오리진 허용
   - **수정**: 개발 시 localhost만, 프로덕션 시 `ALLOWED_ORIGINS` 환경변수 기반

6. **Prisma 에러 핸들링 불완전**
   - P2002, P2025만 처리
   - **수정**: P2003(FK 제약), P2014(필수 관계) 추가

### 프론트엔드

1. **대시보드 페이지 Hook/Props 불일치**
   - `useAutoRotation` 파라미터명, `ScreenshotGrid` props, `SummaryBar` props 미스매치
   - **수정**: 대시보드 페이지 전체 재작성

2. **API 클라이언트 에러 처리 부재**
   - `response.ok` 체크 없이 `.json()` 호출
   - **수정**: 응답 상태 확인 후 에러 포맷 반환

3. **WebSocket 이벤트 정리 누락**
   - `useMonitoringData`에서 리스너 해제 없음
   - **수정**: `socket.off()` 패턴으로 정리 코드 추가

4. **0-indexed 페이지네이션 버그**
   - `currentPage`가 0-indexed인데 `(currentPage - 1) * itemsPerPage`로 계산
   - **수정**: `currentPage * itemsPerPage`로 수정

---

## WARNING 이슈 (모두 수정 완료)

### 백엔드

1. **Redis 싱글톤 경쟁 조건** → 초기화 플래그 + disconnect 안전 처리
2. **로그인 정보 유출** → 로그에 사용자명 대신 userId 기록, 비활성 사용자도 동일 에러 메시지
3. **로그인 입력값 미정제** → trim 처리 + 길이 제한 (username 50자, password 128자)
4. **morgan 로그 포맷** → 개발 시 `dev`, 프로덕션 시 `combined` + Winston 연동
5. **JSON 페이로드 크기** → `10mb` → `1mb`로 합리적 제한
6. **카테고리 sortOrder 범위** → 0~9999 범위 검증 추가
7. **카테고리명 길이 제한** → 100자 이내 검증 추가
8. **health check 강화** → DB + Redis 연결 상태 확인

### 프론트엔드

1. **API 요청 타임아웃** → `AbortController` 기반 30초 타임아웃 추가
2. **401 토큰 만료 자동 처리** → 401 시 토큰 삭제 + 로그인 페이지 리다이렉트
3. **네트워크 에러 처리** → 타임아웃/네트워크 에러 별도 포맷 반환
4. **useAutoRotation 무한 루프 위험** → `useRef` 패턴으로 콜백 안정성 확보
5. **useWebSocket 메모리 누수** → 리스너 중복 등록 방지 + mountedRef 패턴
6. **SSR 안전성** → socket.ts와 useWebSocket에 `typeof window` 체크 추가

---

## INFO 이슈 (향후 개선 권장)

### 백엔드
- Request ID 헤더 (추적성)
- API 응답 시간 로깅
- Prisma 쿼리 로깅 (개발 모드)
- Rate limiter Redis 백엔드 연동
- Bulk import CSV/Excel 파싱 기능
- 비밀번호 복잡도 검증
- API 버전 프리픽스 (`/api/v1`)
- 입력 데이터 HTML sanitization

### 프론트엔드
- React Error Boundary 추가
- 로딩 스켈레톤 UI
- 페이지 전환 애니메이션
- 대시보드 자동 새로고침 (24시간 무중단용)
- 다크/라이트 테마 토글
- 반응형 그리드 레이아웃
- 키보드 네비게이션
- 접근성 (aria 속성)
- 오프라인 상태 표시
- 스크린샷 이미지 lazy loading 최적화

---

## 수정된 파일 목록

### 백엔드 (7개 파일)
- `packages/server/src/config/redis.ts`
- `packages/server/src/config/index.ts`
- `packages/server/src/routes/auth.ts`
- `packages/server/src/routes/categories.ts`
- `packages/server/src/routes/websites.ts`
- `packages/server/src/app.ts`
- `packages/server/src/middleware/errorHandler.ts`

### 프론트엔드 (6개 파일)
- `packages/web/src/app/(dashboard)/page.tsx`
- `packages/web/src/lib/api.ts`
- `packages/web/src/lib/socket.ts`
- `packages/web/src/hooks/useAutoRotation.ts`
- `packages/web/src/hooks/useWebSocket.ts`
- `packages/web/src/hooks/useMonitoringData.ts`

---

## 다음 단계

Phase 3(모니터링 엔진) 구현을 시작할 준비가 되었습니다:
1. HTTP 상태 체크 워커 구현
2. Playwright 스크린샷 캡처 워커
3. pixelmatch 기반 위변조 탐지 로직
4. Bull Queue 스케줄링 시스템
5. 베이스라인 관리 API
