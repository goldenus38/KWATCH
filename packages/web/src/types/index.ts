// ============================================
// KWATCH 프론트엔드 타입 정의
// ============================================

// 상태 열거형
export type WebsiteStatus = 'normal' | 'warning' | 'critical' | 'checking' | 'unknown';
export type AlertType = 'DOWN' | 'SLOW' | 'DEFACEMENT' | 'SSL_EXPIRY' | 'RECOVERED';
export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';
export type Role = 'viewer' | 'analyst' | 'admin';

// ============================================
// API 응답 타입
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================
// 사용자
// ============================================

export interface User {
  id: number;
  username: string;
  email: string | null;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

// ============================================
// 카테고리
// ============================================

export interface Category {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
  websiteCount?: number;
}

// ============================================
// 웹사이트
// ============================================

export interface Website {
  id: number;
  url: string;
  name: string;
  organizationName: string | null;
  categoryId: number | null;
  category?: Category;
  description: string | null;
  checkIntervalSeconds: number;
  timeoutSeconds: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// 모니터링
// ============================================

export interface MonitoringResult {
  id: string;
  websiteId: number;
  statusCode: number | null;
  responseTimeMs: number | null;
  isUp: boolean;
  errorMessage: string | null;
  checkedAt: string;
}

export interface MonitoringStatus {
  websiteId: number;
  websiteName: string;
  url: string;
  statusCode: number | null;
  responseTimeMs: number | null;
  isUp: boolean;
  errorMessage: string | null;
  checkedAt: string;
  screenshotUrl: string | null;
  defacementStatus: {
    isDefaced: boolean;
    similarityScore: number | null;
    htmlSimilarityScore: number | null;
    detectionMethod: 'pixel_only' | 'hybrid';
  } | null;
}

export interface DashboardSummary {
  total: number;
  up: number;
  down: number;
  warning: number;
  defaced: number;
  unknown: number;
  lastScanAt: string | null;
}

// ============================================
// 스크린샷
// ============================================

export interface Screenshot {
  id: string;
  websiteId: number;
  filePath: string;
  fileSize: number | null;
  capturedAt: string;
  thumbnailUrl: string;
  fullUrl: string;
}

// ============================================
// 위변조
// ============================================

export interface DetectionDetails {
  pixelScore: number;
  structuralScore: number;
  criticalElementsScore: number;
  hybridScore: number;
  newDomains: string[];
  removedDomains: string[];
  structuralMatch: boolean;
  weights: { pixel: number; structural: number; critical: number };
}

export interface DefacementCheck {
  id: string;
  websiteId: number;
  baselineId: number;
  currentScreenshotId: string;
  similarityScore: number | null;
  isDefaced: boolean;
  diffImagePath: string | null;
  checkedAt: string;
  structuralScore: number | null;
  criticalElementsScore: number | null;
  htmlSimilarityScore: number | null;
  detectionDetails: DetectionDetails | null;
}

export interface DefacementBaseline {
  id: number;
  websiteId: number;
  screenshotId: string;
  hash: string | null;
  isActive: boolean;
  createdAt: string;
}

// ============================================
// 알림
// ============================================

export interface Alert {
  id: string;
  websiteId: number;
  websiteName?: string;
  alertType: AlertType;
  severity: Severity;
  message: string;
  isAcknowledged: boolean;
  acknowledgedBy: number | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface AlertChannel {
  id: number;
  channelType: 'EMAIL' | 'SLACK' | 'TELEGRAM';
  config: Record<string, unknown>;
  isActive: boolean;
}

// ============================================
// 위변조 탐지 설정
// ============================================

export interface DefacementConfig {
  defacementThreshold: number;
  hybridWeights: { pixel: number; structural: number; critical: number };
  htmlAnalysisEnabled: boolean;
}

// 대시보드 상태 필터 타입
export type SummaryFilterType = 'up' | 'down' | 'warning' | 'defaced' | null;

// ============================================
// 대시보드 관련
// ============================================

export interface SiteCardData {
  websiteId: number;
  name: string;
  url: string;
  status: WebsiteStatus;
  responseTimeMs: number | null;
  screenshotUrl: string | null;
  isDefaced: boolean;
  lastCheckedAt: string | null;
}

export interface DashboardFilter {
  categoryId?: number;
  status?: WebsiteStatus;
  search?: string;
}

export interface DashboardConfig {
  autoRotateInterval: number;
  itemsPerPage: number;
  kioskMode: boolean;
}

// ============================================
// WebSocket 이벤트 페이로드
// ============================================

export interface WsStatusUpdate {
  websiteId: number;
  status: MonitoringStatus;
}

export interface WsAlertNew {
  alert: Alert;
}

export interface WsDefacementDetected {
  websiteId: number;
  websiteName: string;
  similarityScore: number;
  diffImageUrl: string;
}

export interface WsScreenshotUpdated {
  websiteId: number;
  screenshotUrl: string;
}
