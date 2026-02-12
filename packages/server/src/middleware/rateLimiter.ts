import rateLimit from 'express-rate-limit';

/**
 * 일반 API 레이트 리미터
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100,                  // 최대 100회
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * 로그인 API 레이트 리미터 (더 엄격)
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 10,                   // 최대 10회
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});
