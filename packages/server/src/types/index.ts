import { Request } from 'express';
import { AlertType, Severity, ChannelType, Role } from '@prisma/client';

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
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ============================================
// 인증 관련 타입
// ============================================

export interface JwtPayload {
  userId: number;
  username: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: number;
    username: string;
    email: string | null;
    role: Role;
  };
}

// ============================================
// 웹사이트 관련 타입
// ============================================

export interface WebsiteCreateInput {
  url: string;
  name: string;
  organizationName?: string;
  categoryId?: number;
  description?: string;
  checkIntervalSeconds?: number;
  timeoutSeconds?: number;
  ignoreSelectors?: string[];
  defacementMode?: string;
}

export interface WebsiteUpdateInput {
  url?: string;
  name?: string;
  organizationName?: string;
  categoryId?: number;
  description?: string;
  checkIntervalSeconds?: number;
  timeoutSeconds?: number;
  isActive?: boolean;
  ignoreSelectors?: string[];
  defacementMode?: string;
}

export interface WebsiteFilter {
  categoryId?: number;
  isActive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

// ============================================
// 모니터링 관련 타입
// ============================================

export interface MonitoringStatus {
  websiteId: number;
  websiteName: string;
  organizationName: string | null;
  url: string;
  finalUrl: string | null;
  statusCode: number | null;
  responseTimeMs: number | null;
  isUp: boolean;
  errorMessage: string | null;
  checkedAt: Date;
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
  lastScanAt: Date | null;
}

export interface MonitoringJobData {
  websiteId: number;
  url: string;
  timeoutSeconds: number;
}

// ============================================
// 스크린샷 관련 타입
// ============================================

export interface ScreenshotJobData {
  websiteId: number;
  url: string;
}

export interface ScreenshotResult {
  filePath: string;
  fileSize: number;
  htmlContent?: string;
}

// ============================================
// 위변조 관련 타입
// ============================================

export interface DefacementJobData {
  websiteId: number;
  screenshotId: number;
  baselineId: number;
  htmlContent?: string;
}

export interface DefacementResult {
  similarityScore: number;
  isDefaced: boolean;
  diffImagePath: string | null;
}

export interface HtmlAnalysisResult {
  structuralScore: number;
  criticalElementsScore: number;
  structuralHash: string;
  currentDomains: string[];
  newDomains: string[];
  removedDomains: string[];
  structuralMatch: boolean;
}

export interface HybridDefacementResult extends DefacementResult {
  structuralScore: number;
  criticalElementsScore: number;
  hybridScore: number;
  detectionDetails: DetectionDetails;
  detectionMethod: 'pixel_only' | 'hybrid';
}

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

// ============================================
// 알림 관련 타입
// ============================================

export interface AlertCreateInput {
  websiteId: number;
  alertType: AlertType;
  severity: Severity;
  message: string;
}

export interface AlertFilter {
  alertType?: AlertType;
  severity?: Severity;
  isAcknowledged?: boolean;
  websiteId?: number;
  page?: number;
  limit?: number;
}

export interface AlertChannelConfig {
  email?: {
    smtpHost: string;
    smtpPort: number;
    from: string;
    to: string[];
  };
  slack?: {
    webhookUrl: string;
    channel?: string;
  };
  telegram?: {
    botToken: string;
    chatId: string;
  };
}

// ============================================
// WebSocket 이벤트 타입
// ============================================

export interface WsStatusUpdate {
  websiteId: number;
  status: MonitoringStatus;
}

export interface WsAlertNew {
  alert: {
    id: bigint;
    websiteId: number;
    websiteName: string;
    alertType: AlertType;
    severity: Severity;
    message: string;
    createdAt: Date;
  };
}

export interface WsDefacementDetected {
  websiteId: number;
  websiteName: string;
  similarityScore: number;
  diffImageUrl: string | null;
}

// ============================================
// 카테고리 관련 타입
// ============================================

export interface CategoryCreateInput {
  name: string;
  description?: string;
  sortOrder?: number;
}

export interface CategoryUpdateInput {
  name?: string;
  description?: string;
  sortOrder?: number;
}

// Re-export Prisma enums
export { AlertType, Severity, ChannelType, Role };
