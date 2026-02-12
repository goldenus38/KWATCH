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
  url: string;
  statusCode: number | null;
  responseTimeMs: number | null;
  isUp: boolean;
  errorMessage: string | null;
  checkedAt: Date;
  screenshotUrl: string | null;
  defacementStatus: {
    isDefaced: boolean;
    similarityScore: number | null;
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
}

// ============================================
// 위변조 관련 타입
// ============================================

export interface DefacementJobData {
  websiteId: number;
  screenshotId: bigint;
  baselineId: number;
}

export interface DefacementResult {
  similarityScore: number;
  isDefaced: boolean;
  diffImagePath: string | null;
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
  diffImageUrl: string;
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
