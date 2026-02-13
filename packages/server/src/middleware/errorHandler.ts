import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { sendError } from '../utils/response';
import { config } from '../config';

/**
 * 전역 에러 핸들링 미들웨어
 */
export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  logger.error('Unhandled error:', err);

  // Prisma 에러 처리
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaError = err as any;
    switch (prismaError.code) {
      case 'P2002':
        sendError(res, 'DUPLICATE', '이미 존재하는 데이터입니다.', 409);
        return;
      case 'P2003':
        sendError(res, 'FOREIGN_KEY_ERROR', '외래 키 제약 조건 위반입니다.', 400);
        return;
      case 'P2014':
        sendError(res, 'REQUIRED_RELATION_ERROR', '필수 관계를 제거할 수 없습니다.', 400);
        return;
      case 'P2025':
        sendError(res, 'NOT_FOUND', '요청한 데이터를 찾을 수 없습니다.', 404);
        return;
      default:
        sendError(res, 'DB_ERROR', '데이터베이스 오류가 발생했습니다.', 500);
        return;
    }
  }

  // Zod 유효성 검증 에러
  if (err.name === 'ZodError') {
    sendError(res, 'VALIDATION_ERROR', '입력 데이터가 유효하지 않습니다.', 400);
    return;
  }

  // JWT 에러
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    sendError(res, 'AUTH_ERROR', '인증 오류가 발생했습니다.', 401);
    return;
  }

  // 기본 에러
  sendError(
    res,
    'INTERNAL_ERROR',
    config.isDev
      ? err.message
      : '서버 내부 오류가 발생했습니다.',
    500,
  );
};

/**
 * 404 Not Found 핸들러
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
): void => {
  sendError(res, 'NOT_FOUND', `${req.method} ${req.path} 경로를 찾을 수 없습니다.`, 404);
};
