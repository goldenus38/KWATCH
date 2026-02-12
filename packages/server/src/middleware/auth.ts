import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthenticatedRequest, JwtPayload } from '../types';
import { sendError } from '../utils/response';

/**
 * JWT 인증 미들웨어
 */
export const authenticate = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendError(res, 'UNAUTHORIZED', '인증 토큰이 필요합니다.', 401);
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
    req.user = decoded;
    next();
  } catch (error) {
    sendError(res, 'INVALID_TOKEN', '유효하지 않은 토큰입니다.', 401);
  }
};

/**
 * 역할 기반 접근 제어 미들웨어
 */
export const authorize = (...roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'UNAUTHORIZED', '인증이 필요합니다.', 401);
      return;
    }

    if (!roles.includes(req.user.role)) {
      sendError(res, 'FORBIDDEN', '접근 권한이 없습니다.', 403);
      return;
    }

    next();
  };
};

/**
 * 대시보드 토큰 인증 (선택사항)
 * DASHBOARD_TOKEN이 설정된 경우에만 인증 필요
 */
export const dashboardAuth = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void => {
  // 대시보드 토큰이 설정되지 않은 경우 인증 없이 접근 허용
  if (!config.dashboard.token) {
    next();
    return;
  }

  const token = req.query.token as string || req.headers['x-dashboard-token'] as string;

  if (token === config.dashboard.token) {
    next();
    return;
  }

  // 일반 JWT 토큰으로 대체 인증 시도
  authenticate(req, res, next);
};
