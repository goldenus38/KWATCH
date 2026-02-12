import { Response } from 'express';
import { ApiResponse } from '../types';

/**
 * 통일된 API 성공 응답
 */
export const sendSuccess = <T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  meta?: ApiResponse['meta'],
): void => {
  const response: ApiResponse<T> = {
    success: true,
    data,
    ...(meta && { meta }),
  };
  res.status(statusCode).json(response);
};

/**
 * 통일된 API 에러 응답
 */
export const sendError = (
  res: Response,
  code: string,
  message: string,
  statusCode: number = 400,
): void => {
  const response: ApiResponse = {
    success: false,
    error: { code, message },
  };
  res.status(statusCode).json(response);
};

/**
 * 페이지네이션 메타 정보 생성
 */
export const createPaginationMeta = (
  total: number,
  page: number,
  limit: number,
): ApiResponse['meta'] => {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};
