import { Router } from 'express';
import { sendSuccess, sendError, createPaginationMeta } from '../utils/response';
import { monitoringService } from '../services/MonitoringService';

const router = Router();

/**
 * GET /api/monitoring/status
 * 전체 모니터링 상태 요약 (대시보드용)
 */
router.get('/status', async (req, res) => {
  try {
    const summary = await monitoringService.getDashboardSummary();
    sendSuccess(res, summary);
  } catch (error) {
    sendError(res, 'STATUS_ERROR', '모니터링 상태 조회 중 오류가 발생했습니다.', 500);
  }
});

/**
 * GET /api/monitoring/statuses
 * 전체 활성 사이트 상태 목록 (대시보드 그리드용)
 */
router.get('/statuses', async (req, res) => {
  try {
    const statuses = await monitoringService.getAllStatuses();
    sendSuccess(res, statuses);
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

export default router;
