import { Router } from 'express';
import { sendSuccess, sendError, createPaginationMeta } from '../utils/response';
import { monitoringService } from '../services/MonitoringService';
import { schedulerService } from '../services/SchedulerService';
import { authenticate } from '../middleware/auth';
import { getDbClient } from '../config/database';
import { config } from '../config';

const router = Router();

/**
 * GET /api/monitoring/status
 * 전체 모니터링 상태 요약 (대시보드용)
 */
router.get('/status', async (req, res) => {
  try {
    const summary = await monitoringService.getDashboardSummary();
    sendSuccess(res, {
      ...summary,
      responseTimeWarningMs: config.monitoring.responseTimeWarningMs,
    });
  } catch (error) {
    sendError(res, 'STATUS_ERROR', '모니터링 상태 조회 중 오류가 발생했습니다.', 500);
  }
});

/**
 * GET /api/monitoring/statuses
 * 전체 활성 사이트 상태 목록 + 요약 (대시보드용, 1회 DB 쿼리)
 */
router.get('/statuses', async (req, res) => {
  try {
    const { statuses, summary } = await monitoringService.getAllStatusesWithSummary();
    sendSuccess(res, {
      statuses,
      summary: {
        ...summary,
        responseTimeWarningMs: config.monitoring.responseTimeWarningMs,
      },
    });
  } catch (error) {
    sendError(res, 'STATUSES_ERROR', '전체 상태 목록 조회 중 오류가 발생했습니다.', 500);
  }
});

/**
 * GET /api/monitoring/:websiteId
 * 특정 웹사이트의 모니터링 이력 조회 (페이지네이션)
 */
router.get('/:websiteId', async (req, res) => {
  try {
    const { websiteId } = req.params;
    const { page = 1, limit = 50 } = req.query as any;

    const siteId = parseInt(websiteId);
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;

    if (isNaN(siteId)) {
      sendError(res, 'INVALID_ID', '유효하지 않은 웹사이트 ID입니다.', 400);
      return;
    }

    const offset = (pageNum - 1) * limitNum;
    const [results, totalCount] = await Promise.all([
      monitoringService.getHistory(siteId, limitNum, offset),
      monitoringService['prisma'].monitoringResult.count({ where: { websiteId: siteId } }),
    ]);

    const meta = createPaginationMeta(totalCount, pageNum, limitNum);
    sendSuccess(res, results, 200, meta);
  } catch (error) {
    sendError(res, 'HISTORY_ERROR', '모니터링 이력 조회 중 오류가 발생했습니다.', 500);
  }
});

/**
 * GET /api/monitoring/:websiteId/latest
 * 특정 웹사이트의 최신 모니터링 결과 조회
 */
router.get('/:websiteId/latest', async (req, res) => {
  try {
    const { websiteId } = req.params;
    const siteId = parseInt(websiteId);

    if (isNaN(siteId)) {
      sendError(res, 'INVALID_ID', '유효하지 않은 웹사이트 ID입니다.', 400);
      return;
    }

    const latestStatus = await monitoringService.getStatus(siteId);

    if (!latestStatus) {
      sendError(res, 'NOT_FOUND', '웹사이트를 찾을 수 없습니다.', 404);
      return;
    }

    sendSuccess(res, latestStatus);
  } catch (error) {
    sendError(res, 'GET_LATEST_ERROR', '최신 모니터링 결과 조회 중 오류가 발생했습니다.', 500);
  }
});

/**
 * POST /api/monitoring/:websiteId/refresh
 * 특정 웹사이트의 상태체크 + 스크린샷 + 위변조 검사를 즉시 트리거
 */
router.post('/:websiteId/refresh', authenticate, async (req, res) => {
  try {
    const { websiteId } = req.params;
    const siteId = parseInt(websiteId);

    if (isNaN(siteId)) {
      sendError(res, 'INVALID_ID', '유효하지 않은 웹사이트 ID입니다.', 400);
      return;
    }

    const prisma = getDbClient();
    const website = await prisma.website.findUnique({
      where: { id: siteId },
    });

    if (!website) {
      sendError(res, 'NOT_FOUND', '웹사이트를 찾을 수 없습니다.', 404);
      return;
    }

    // 모니터링 큐에 즉시 작업 추가
    await schedulerService.enqueueMonitoringCheck(website);

    // 스크린샷 큐에 즉시 작업 추가
    await schedulerService.enqueueScreenshot(
      { id: website.id, url: website.url },
      true,
    );

    sendSuccess(res, {
      websiteId: siteId,
      status: 'queued',
      message: '상태체크 및 스크린샷 캡처가 큐에 등록되었습니다.',
    }, 202);
  } catch (error) {
    sendError(res, 'REFRESH_ERROR', '수동 새로고침 요청 중 오류가 발생했습니다.', 500);
  }
});

export default router;
