import { Router } from 'express';
import { apiLimiter } from '../middleware/rateLimiter';
import { getDbClient } from '../config/database';
import { getRedisClient } from '../config/redis';
import authRouter from './auth';
import websitesRouter from './websites';
import categoriesRouter from './categories';
import monitoringRouter from './monitoring';
import screenshotsRouter from './screenshots';
import defacementRouter from './defacement';
import alertsRouter from './alerts';
import settingsRouter from './settings';
import usersRouter from './users';

const router = Router();

/**
 * 정적 리소스(이미지)는 rate limit 제외
 */
router.use('/screenshots', screenshotsRouter);

/**
 * 나머지 API 라우트에 레이트 리미터 적용
 */
router.use(apiLimiter);

/**
 * API 라우트 마운트
 */
router.use('/auth', authRouter);
router.use('/websites', websitesRouter);
router.use('/categories', categoriesRouter);
router.use('/monitoring', monitoringRouter);
router.use('/defacement', defacementRouter);
router.use('/alerts', alertsRouter);
router.use('/settings', settingsRouter);
router.use('/users', usersRouter);

/**
 * 헬스 체크 엔드포인트
 */
router.get('/health', async (req, res) => {
  try {
    const prisma = getDbClient();
    const redis = getRedisClient();

    // 데이터베이스 연결 테스트
    await prisma.$queryRaw`SELECT 1`;

    // Redis 연결 테스트
    await redis.ping();

    res.json({
      status: 'ok',
      database: 'connected',
      redis: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(503).json({
      status: 'error',
      message: 'Health check failed',
      error: message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
