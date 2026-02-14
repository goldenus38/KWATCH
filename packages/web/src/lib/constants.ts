// ============================================
// KWATCH 상수 정의
// ============================================

// API URL
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

// 대시보드 설정
export const DEFAULT_ITEMS_PER_PAGE = 35; // 7x5 그리드
export const DEFAULT_AUTO_ROTATE_INTERVAL = 15000; // 15초
export const GRID_COLUMNS = 7;
export const GRID_ROWS = 5;

// 스크린샷
export const THUMBNAIL_WIDTH = 200;
export const THUMBNAIL_HEIGHT = 112;
export const SCREENSHOT_WIDTH = 1920;
export const SCREENSHOT_HEIGHT = 1080;

// 상태 임계값
export const DEFACEMENT_THRESHOLD = 85; // 유사도 85% 미만 위변조

// 상태별 색상 매핑
export const STATUS_COLORS = {
  normal: {
    bg: 'bg-kwatch-status-normal',
    text: 'text-kwatch-status-normal',
    border: 'border-transparent',
    dot: '#00C853',
  },
  warning: {
    bg: 'bg-kwatch-status-warning',
    text: 'text-kwatch-status-warning',
    border: 'border-kwatch-status-warning',
    dot: '#FFB300',
  },
  critical: {
    bg: 'bg-kwatch-status-critical',
    text: 'text-kwatch-status-critical',
    border: 'border-kwatch-status-critical',
    dot: '#FF1744',
  },
  checking: {
    bg: 'bg-kwatch-status-checking',
    text: 'text-kwatch-status-checking',
    border: 'border-kwatch-status-checking',
    dot: '#42A5F5',
  },
  unknown: {
    bg: 'bg-kwatch-status-unknown',
    text: 'text-kwatch-status-unknown',
    border: 'border-kwatch-status-unknown',
    dot: '#78909C',
  },
} as const;

// 알림 타입 한글 매핑
export const ALERT_TYPE_LABELS: Record<string, string> = {
  DOWN: '접속 불가',
  SLOW: '응답 지연',
  DEFACEMENT: '위변조 감지',
  SSL_EXPIRY: 'SSL 만료',
  RECOVERED: '복구 완료',
};

// 심각도 한글 매핑
export const SEVERITY_LABELS: Record<string, string> = {
  INFO: '정보',
  WARNING: '경고',
  CRITICAL: '심각',
};

// 알림 타입별 아이콘
export const ALERT_TYPE_ICONS: Record<string, string> = {
  DOWN: '✕',
  SLOW: '△',
  DEFACEMENT: '◎',
  SSL_EXPIRY: '⚠',
  RECOVERED: '○',
};
