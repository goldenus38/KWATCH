import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getDbClient } from '../config/database';
import { getRedisClient } from '../config/redis';
import { config } from '../config';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/response';
import { logger } from '../utils/logger';
import { schedulerService } from '../services/SchedulerService';

const ENV_PATH = path.resolve(__dirname, '../../../../.env');

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
      responseTimeWarningMs: config.monitoring.responseTimeWarningMs,
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

/**
 * PUT /api/settings/monitoring/response-time-threshold
 * 응답 시간 경고 임계값 변경
 * Body: { responseTimeWarningMs: number }
 */
router.put('/monitoring/response-time-threshold', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { responseTimeWarningMs } = req.body;

    if (responseTimeWarningMs === undefined || typeof responseTimeWarningMs !== 'number') {
      sendError(res, 'INVALID_INPUT', '응답 시간 경고 임계값(ms)을 입력해주세요.', 400);
      return;
    }

    if (responseTimeWarningMs < 1000 || responseTimeWarningMs > 60000) {
      sendError(res, 'INVALID_INPUT', '응답 시간 경고 임계값은 1000ms~60000ms 사이여야 합니다.', 400);
      return;
    }

    (config.monitoring as any).responseTimeWarningMs = Math.round(responseTimeWarningMs);

    logger.info(`응답 시간 경고 임계값 변경: ${responseTimeWarningMs}ms`);

    sendSuccess(res, {
      responseTimeWarningMs: config.monitoring.responseTimeWarningMs,
      message: `응답 시간 경고 임계값이 ${responseTimeWarningMs}ms로 변경되었습니다.`,
    });
  } catch (error) {
    logger.error('응답 시간 경고 임계값 변경 오류:', error);
    sendError(res, 'UPDATE_ERROR', '응답 시간 경고 임계값 변경 중 오류가 발생했습니다.', 500);
  }
});

/**
 * POST /api/settings/monitoring/persist
 * 현재 모니터링 설정을 .env 파일에 저장
 */
router.post('/monitoring/persist', authenticate, authorize('admin'), async (req, res) => {
  try {
    let envContent = '';
    try {
      envContent = fs.readFileSync(ENV_PATH, 'utf-8');
    } catch {
      const examplePath = path.resolve(__dirname, '../../../../.env.example');
      try {
        envContent = fs.readFileSync(examplePath, 'utf-8');
      } catch {
        // .env.example도 없으면 빈 문자열로 시작
      }
    }

    const updates: Record<string, string> = {
      RESPONSE_TIME_WARNING_MS: String(config.monitoring.responseTimeWarningMs),
    };

    const lines = envContent.split('\n');
    const existingKeys = new Set<string>();

    const updatedLines = lines.map((line) => {
      const match = line.match(/^([A-Z0-9_]+)=/);
      if (match && updates[match[1]] !== undefined) {
        existingKeys.add(match[1]);
        return `${match[1]}=${updates[match[1]]}`;
      }
      return line;
    });

    for (const [key, value] of Object.entries(updates)) {
      if (!existingKeys.has(key)) {
        updatedLines.push(`${key}=${value}`);
      }
    }

    fs.writeFileSync(ENV_PATH, updatedLines.join('\n'));

    logger.info('.env 파일에 모니터링 설정 저장 완료');

    sendSuccess(res, { message: '.env 파일에 설정이 저장되었습니다.' });
  } catch (error) {
    logger.error('.env 파일 저장 오류:', error);
    sendError(res, 'PERSIST_ERROR', '.env 파일 저장 중 오류가 발생했습니다.', 500);
  }
});

/**
 * GET /api/settings/defacement
 * 위변조 탐지 설정 조회 (읽기 전용)
 */
router.get('/defacement', authenticate, async (req, res) => {
  sendSuccess(res, {
    defacementThreshold: config.monitoring.defacementThreshold,
    hybridWeights: config.monitoring.hybridWeights,
    htmlAnalysisEnabled: config.monitoring.htmlAnalysisEnabled,
  });
});

/**
 * PUT /api/settings/defacement
 * 위변조 탐지 설정 변경 (런타임, 재시작 시 .env로 복원)
 * Body: { defacementThreshold?: number, hybridWeights?: { pixel, structural, critical }, htmlAnalysisEnabled?: boolean }
 */
router.put('/defacement', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { defacementThreshold, hybridWeights, htmlAnalysisEnabled } = req.body;

    // 임계값 검증 및 적용
    if (defacementThreshold !== undefined) {
      if (typeof defacementThreshold !== 'number' || defacementThreshold < 0 || defacementThreshold > 100) {
        sendError(res, 'INVALID_INPUT', '임계값은 0~100 사이의 숫자여야 합니다.', 400);
        return;
      }
      (config.monitoring as any).defacementThreshold = Math.round(defacementThreshold);
    }

    // 가중치 검증 및 적용
    if (hybridWeights !== undefined) {
      const { pixel, structural, critical } = hybridWeights;
      if (typeof pixel !== 'number' || typeof structural !== 'number' || typeof critical !== 'number') {
        sendError(res, 'INVALID_INPUT', '가중치는 모두 숫자여야 합니다.', 400);
        return;
      }
      if (pixel < 0 || pixel > 1 || structural < 0 || structural > 1 || critical < 0 || critical > 1) {
        sendError(res, 'INVALID_INPUT', '각 가중치는 0~1 범위여야 합니다.', 400);
        return;
      }
      const sum = pixel + structural + critical;
      if (sum < 0.95 || sum > 1.05) {
        sendError(res, 'INVALID_INPUT', '가중치 합계는 1.0이어야 합니다 (허용 오차: ±0.05).', 400);
        return;
      }
      (config.monitoring as any).hybridWeights = { pixel, structural, critical };
    }

    // HTML 분석 활성화 여부
    if (htmlAnalysisEnabled !== undefined) {
      if (typeof htmlAnalysisEnabled !== 'boolean') {
        sendError(res, 'INVALID_INPUT', 'HTML 분석 활성화 여부는 boolean이어야 합니다.', 400);
        return;
      }
      (config.monitoring as any).htmlAnalysisEnabled = htmlAnalysisEnabled;
    }

    logger.info('위변조 탐지 설정 변경:', {
      defacementThreshold: config.monitoring.defacementThreshold,
      hybridWeights: config.monitoring.hybridWeights,
      htmlAnalysisEnabled: config.monitoring.htmlAnalysisEnabled,
    });

    sendSuccess(res, {
      defacementThreshold: config.monitoring.defacementThreshold,
      hybridWeights: config.monitoring.hybridWeights,
      htmlAnalysisEnabled: config.monitoring.htmlAnalysisEnabled,
      message: '위변조 탐지 설정이 변경되었습니다.',
    });
  } catch (error) {
    logger.error('위변조 탐지 설정 변경 오류:', error);
    sendError(res, 'UPDATE_ERROR', '위변조 탐지 설정 변경 중 오류가 발생했습니다.', 500);
  }
});

/**
 * POST /api/settings/defacement/persist
 * 현재 위변조 탐지 설정을 .env 파일에 저장
 */
router.post('/defacement/persist', authenticate, authorize('admin'), async (req, res) => {
  try {
    let envContent = '';
    try {
      envContent = fs.readFileSync(ENV_PATH, 'utf-8');
    } catch {
      // .env 파일이 없으면 .env.example을 기반으로 생성
      const examplePath = path.resolve(__dirname, '../../../../.env.example');
      try {
        envContent = fs.readFileSync(examplePath, 'utf-8');
      } catch {
        // .env.example도 없으면 빈 문자열로 시작
      }
    }

    const updates: Record<string, string> = {
      DEFACEMENT_THRESHOLD: String(config.monitoring.defacementThreshold),
      DEFACEMENT_WEIGHT_PIXEL: String(config.monitoring.hybridWeights.pixel),
      DEFACEMENT_WEIGHT_STRUCTURAL: String(config.monitoring.hybridWeights.structural),
      DEFACEMENT_WEIGHT_CRITICAL: String(config.monitoring.hybridWeights.critical),
      HTML_ANALYSIS_ENABLED: String(config.monitoring.htmlAnalysisEnabled),
    };

    const lines = envContent.split('\n');
    const existingKeys = new Set<string>();

    // 기존 키 값 업데이트
    const updatedLines = lines.map((line) => {
      const match = line.match(/^([A-Z0-9_]+)=/);
      if (match && updates[match[1]] !== undefined) {
        existingKeys.add(match[1]);
        return `${match[1]}=${updates[match[1]]}`;
      }
      return line;
    });

    // 없는 키 추가
    for (const [key, value] of Object.entries(updates)) {
      if (!existingKeys.has(key)) {
        updatedLines.push(`${key}=${value}`);
      }
    }

    fs.writeFileSync(ENV_PATH, updatedLines.join('\n'));

    logger.info('.env 파일에 위변조 탐지 설정 저장 완료');

    sendSuccess(res, { message: '.env 파일에 설정이 저장되었습니다.' });
  } catch (error) {
    logger.error('.env 파일 저장 오류:', error);
    sendError(res, 'PERSIST_ERROR', '.env 파일 저장 중 오류가 발생했습니다.', 500);
  }
});

/**
 * POST /api/settings/defacement/baseline-bulk
 * 모든 활성 사이트의 베이스라인을 최신 스크린샷으로 일괄 교체
 */
router.post('/defacement/baseline-bulk', authenticate, authorize('admin'), async (req, res) => {
  try {
    const prisma = getDbClient();
    const authReq = req as any;
    const userId = authReq.user?.userId;

    if (!userId) {
      sendError(res, 'UNAUTHORIZED', '인증이 필요합니다.', 401);
      return;
    }

    // 모든 활성 웹사이트 조회
    const websites = await prisma.website.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    const { defacementService } = await import('../services/DefacementService');

    for (const website of websites) {
      try {
        // 각 사이트의 최신 스크린샷 조회
        const latestScreenshot = await prisma.screenshot.findFirst({
          where: { websiteId: website.id },
          orderBy: { capturedAt: 'desc' },
        });

        if (!latestScreenshot) {
          skipped++;
          continue;
        }

        await defacementService.updateBaseline(website.id, latestScreenshot.id, userId);
        updated++;
      } catch (err) {
        logger.error(`Baseline bulk update failed for website ${website.id}:`, err);
        failed++;
      }
    }

    logger.info(`Baseline bulk update completed: ${updated} updated, ${skipped} skipped, ${failed} failed`);

    sendSuccess(res, {
      total: websites.length,
      updated,
      skipped,
      failed,
      message: `베이스라인 일괄 교체 완료: ${updated}개 갱신, ${skipped}개 스킵(스크린샷 없음), ${failed}개 실패`,
    });
  } catch (error) {
    logger.error('베이스라인 일괄 교체 오류:', error);
    sendError(res, 'BULK_BASELINE_ERROR', '베이스라인 일괄 교체 중 오류가 발생했습니다.', 500);
  }
});

/**
 * GET /api/settings/defacement/baseline-schedule
 * 베이스라인 자동 갱신 주기 조회
 */
router.get('/defacement/baseline-schedule', authenticate, async (req, res) => {
  sendSuccess(res, {
    intervalDays: config.monitoring.baselineRefreshIntervalDays,
  });
});

/**
 * PUT /api/settings/defacement/baseline-schedule
 * 베이스라인 자동 갱신 주기 설정
 * Body: { intervalDays: number } (0 = 비활성)
 */
router.put('/defacement/baseline-schedule', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { intervalDays } = req.body;

    if (intervalDays === undefined || typeof intervalDays !== 'number') {
      sendError(res, 'INVALID_INPUT', '갱신 주기(일)를 입력해주세요.', 400);
      return;
    }

    if (intervalDays < 0 || intervalDays > 365) {
      sendError(res, 'INVALID_INPUT', '갱신 주기는 0~365일 사이여야 합니다.', 400);
      return;
    }

    (config.monitoring as any).baselineRefreshIntervalDays = Math.round(intervalDays);

    // SchedulerService에 스케줄 등록/제거
    await schedulerService.scheduleBaselineRefresh(Math.round(intervalDays));

    logger.info(`베이스라인 자동 갱신 주기 변경: ${intervalDays}일`);

    sendSuccess(res, {
      intervalDays: config.monitoring.baselineRefreshIntervalDays,
      message: intervalDays === 0
        ? '베이스라인 자동 갱신이 비활성화되었습니다.'
        : `베이스라인 자동 갱신 주기가 ${intervalDays}일로 설정되었습니다.`,
    });
  } catch (error) {
    logger.error('베이스라인 갱신 주기 변경 오류:', error);
    sendError(res, 'UPDATE_ERROR', '베이스라인 갱신 주기 변경 중 오류가 발생했습니다.', 500);
  }
});

/**
 * GET /api/settings/server/status
 * 서버 상태 정보 조회 (가동시간, 메모리, DB/Redis, 큐)
 */
router.get('/server/status', authenticate, authorize('admin'), async (req, res) => {
  try {
    const memUsage = process.memoryUsage();

    // DB 연결 상태
    let database: 'connected' | 'disconnected' = 'disconnected';
    try {
      const prisma = getDbClient();
      await prisma.$queryRaw`SELECT 1`;
      database = 'connected';
    } catch {
      // disconnected
    }

    // Redis 연결 상태
    let redis: 'connected' | 'disconnected' = 'disconnected';
    try {
      const redisClient = getRedisClient();
      await redisClient.ping();
      redis = 'connected';
    } catch {
      // disconnected
    }

    // 큐 상태
    let queues = null;
    try {
      queues = await schedulerService.getQueuesStatus();
    } catch {
      // queues unavailable
    }

    sendSuccess(res, {
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
      env: config.nodeEnv,
      memory: {
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        systemTotal: os.totalmem(),
        systemFree: os.freemem(),
      },
      database,
      redis,
      queues,
    });
  } catch (error) {
    logger.error('서버 상태 조회 오류:', error);
    sendError(res, 'STATUS_ERROR', '서버 상태 조회 중 오류가 발생했습니다.', 500);
  }
});

/**
 * POST /api/settings/server/restart
 * 서버 재시작 (Docker restart policy 또는 nodemon이 프로세스를 다시 시작)
 */
router.post('/server/restart', authenticate, authorize('admin'), async (req, res) => {
  logger.info('관리자 요청으로 서버 재시작');
  sendSuccess(res, { message: '서버를 재시작합니다.' });
  setTimeout(() => process.exit(0), 1000);
});

export default router;
