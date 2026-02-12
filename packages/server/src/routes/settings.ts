import { Router } from 'express';
import { getDbClient } from '../config/database';
import { getRedisClient } from '../config/redis';
import { config } from '../config';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/response';
import { logger } from '../utils/logger';
import { schedulerService } from '../services/SchedulerService';

const router = Router();

/**
 * GET /api/settings/monitoring
 * 현재 모니터링 설정 조회
 */
router.get('/monitoring', authenticate, async (req, res) => {
  try {
    const prisma = getDbClient();

    // 전체 웹사이트의 체크 주기 통계
    const stats = await prisma.website.aggregate({
      where: { isActive: true },
      _avg: { checkIntervalSeconds: true },
      _min: { checkIntervalSeconds: true },
      _max: { checkIntervalSeconds: true },
      _count: true,
    });

    // 가장 많이 사용하는 체크 주기 (mode)
    const modeResult = await prisma.website.groupBy({
      by: ['checkIntervalSeconds'],
      where: { isActive: true },
      _count: true,
      orderBy: { _count: { checkIntervalSeconds: 'desc' } },
      take: 1,
    });

    sendSuccess(res, {
      totalWebsites: stats._count,
      checkInterval: {
        avg: Math.round(stats._avg.checkIntervalSeconds || 60),
        min: stats._min.checkIntervalSeconds || 60,
        max: stats._max.checkIntervalSeconds || 60,
        mode: modeResult[0]?.checkIntervalSeconds || 60,
      },
      screenshotInterval: config.monitoring.screenshotInterval,
      defacementInterval: config.monitoring.defacementInterval,
    });
  } catch (error) {
    logger.error('모니터링 설정 조회 오류:', error);
    sendError(res, 'SETTINGS_ERROR', '설정 조회 중 오류가 발생했습니다.', 500);
  }
});

/**
 * PUT /api/settings/monitoring/check-interval
 * 전체 웹사이트의 HTTP 상태체크 주기 일괄 변경
 * Body: { checkIntervalSeconds: number }
 */
router.put('/monitoring/check-interval', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { checkIntervalSeconds } = req.body;

    if (!checkIntervalSeconds || typeof checkIntervalSeconds !== 'number') {
      sendError(res, 'INVALID_INPUT', '체크 주기(초)를 입력해주세요.', 400);
      return;
    }

    if (checkIntervalSeconds < 10 || checkIntervalSeconds > 86400) {
      sendError(res, 'INVALID_INPUT', '체크 주기는 10초~86400초(24시간) 사이여야 합니다.', 400);
      return;
    }

    const prisma = getDbClient();

    // 모든 활성 웹사이트의 체크 주기 일괄 업데이트
    const result = await prisma.website.updateMany({
      where: { isActive: true },
      data: { checkIntervalSeconds },
    });

    logger.info(`체크 주기 일괄 변경: ${checkIntervalSeconds}초 (${result.count}개 사이트)`);

    // 스케줄러 재시작 (변경된 주기 반영)
    schedulerService.scheduleAllWebsites().catch((err) => {
      logger.error('체크 주기 변경 후 스케줄러 재시작 실패:', err);
    });

    sendSuccess(res, {
      checkIntervalSeconds,
      updatedCount: result.count,
      message: `${result.count}개 웹사이트의 체크 주기가 ${checkIntervalSeconds}초로 변경되었습니다.`,
    });
  } catch (error) {
    logger.error('체크 주기 변경 오류:', error);
    sendError(res, 'UPDATE_ERROR', '체크 주기 변경 중 오류가 발생했습니다.', 500);
  }
});

/**
 * PUT /api/settings/monitoring/screenshot-interval
 * 스크린샷/위변조 체크 주기 변경
 * Body: { screenshotIntervalSeconds: number }
 */
router.put('/monitoring/screenshot-interval', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { screenshotIntervalSeconds } = req.body;

    if (!screenshotIntervalSeconds || typeof screenshotIntervalSeconds !== 'number') {
      sendError(res, 'INVALID_INPUT', '스크린샷 주기(초)를 입력해주세요.', 400);
      return;
    }

    if (screenshotIntervalSeconds < 60 || screenshotIntervalSeconds > 86400) {
      sendError(res, 'INVALID_INPUT', '스크린샷 주기는 60초~86400초(24시간) 사이여야 합니다.', 400);
      return;
    }

    // config 값은 런타임에서만 변경 (재시작 시 환경변수 기반으로 복원)
    (config.monitoring as any).screenshotInterval = screenshotIntervalSeconds;

    // 기존 rate limit 키 삭제 (새 주기 즉시 반영)
    const redis = getRedisClient();
    const keys = await redis.keys('screenshot:ratelimit:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    logger.info(`스크린샷 주기 변경: ${screenshotIntervalSeconds}초`);

    sendSuccess(res, {
      screenshotIntervalSeconds,
      message: `스크린샷/위변조 체크 주기가 ${screenshotIntervalSeconds}초로 변경되었습니다.`,
    });
  } catch (error) {
    logger.error('스크린샷 주기 변경 오류:', error);
    sendError(res, 'UPDATE_ERROR', '스크린샷 주기 변경 중 오류가 발생했습니다.', 500);
  }
});

/**
 * PUT /api/settings/monitoring/defacement-interval
 * 위변조 체크 주기 변경
 * Body: { defacementIntervalSeconds: number }
 */
router.put('/monitoring/defacement-interval', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { defacementIntervalSeconds } = req.body;

    if (!defacementIntervalSeconds || typeof defacementIntervalSeconds !== 'number') {
      sendError(res, 'INVALID_INPUT', '위변조 체크 주기(초)를 입력해주세요.', 400);
      return;
    }

    if (defacementIntervalSeconds < 60 || defacementIntervalSeconds > 86400) {
      sendError(res, 'INVALID_INPUT', '위변조 체크 주기는 60초~86400초(24시간) 사이여야 합니다.', 400);
      return;
    }

    // config 값은 런타임에서만 변경 (재시작 시 환경변수 기반으로 복원)
    (config.monitoring as any).defacementInterval = defacementIntervalSeconds;

    // 기존 rate limit 키 삭제 (새 주기 즉시 반영)
    const redis = getRedisClient();
    const keys = await redis.keys('defacement:ratelimit:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    logger.info(`위변조 체크 주기 변경: ${defacementIntervalSeconds}초`);

    sendSuccess(res, {
      defacementIntervalSeconds,
      message: `위변조 체크 주기가 ${defacementIntervalSeconds}초로 변경되었습니다.`,
    });
  } catch (error) {
    logger.error('위변조 체크 주기 변경 오류:', error);
    sendError(res, 'UPDATE_ERROR', '위변조 체크 주기 변경 중 오류가 발생했습니다.', 500);
  }
});

export default router;
