import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { sendSuccess, sendError, createPaginationMeta } from '../utils/response';
import { AuthenticatedRequest } from '../types';
import { screenshotService } from '../services/ScreenshotService';
import { schedulerService } from '../services/SchedulerService';
import { getDbClient } from '../config/database';

const router = Router();
const prisma = getDbClient();

/**
 * GET /api/screenshots/:websiteId
 * 특정 웹사이트의 스크린샷 이력 조회 (페이지네이션)
 */
router.get('/:websiteId', async (req, res) => {
  try {
    const { websiteId } = req.params;
    const { page = 1, limit = 20 } = req.query as any;

    const siteId = parseInt(websiteId);
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;

    if (isNaN(siteId)) {
      sendError(res, 'INVALID_ID', '유효하지 않은 웹사이트 ID입니다.', 400);
      return;
    }

    const offset = (pageNum - 1) * limitNum;
    const [screenshots, totalCount] = await Promise.all([
      prisma.screenshot.findMany({
        where: { websiteId: siteId },
        orderBy: { capturedAt: 'desc' },
        take: limitNum,
        skip: offset,
      }),
      prisma.screenshot.count({ where: { websiteId: siteId } }),
    ]);

    const meta = createPaginationMeta(totalCount, pageNum, limitNum);
    sendSuccess(res, screenshots, 200, meta);
  } catch (error) {
    sendError(res, 'HISTORY_ERROR', '스크린샷 이력 조회 중 오류가 발생했습니다.', 500);
  }
});

/**
 * GET /api/screenshots/:websiteId/latest
 * 특정 웹사이트의 최신 스크린샷 조회
 */
router.get('/:websiteId/latest', async (req, res) => {
  try {
    const { websiteId } = req.params;
    const siteId = parseInt(websiteId);

    if (isNaN(siteId)) {
      sendError(res, 'INVALID_ID', '유효하지 않은 웹사이트 ID입니다.', 400);
      return;
    }

    const latestScreenshot = await screenshotService.getLatestScreenshot(siteId);

    if (!latestScreenshot) {
      sendError(res, 'NOT_FOUND', '스크린샷을 찾을 수 없습니다.', 404);
      return;
    }

    sendSuccess(res, latestScreenshot);
  } catch (error) {
    sendError(res, 'GET_LATEST_ERROR', '최신 스크린샷 조회 중 오류가 발생했습니다.', 500);
  }
});

/**
 * GET /api/screenshots/image/:id
 * 스크린샷 이미지 파일 반환
 */
router.get('/image/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const screenshotId = parseInt(id);

    if (isNaN(screenshotId)) {
      sendError(res, 'INVALID_ID', '유효하지 않은 스크린샷 ID입니다.', 400);
      return;
    }

    const buffer = await screenshotService.getScreenshotBuffer(BigInt(screenshotId));

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  } catch (error) {
    sendError(res, 'FILE_ERROR', '스크린샷 파일 조회 중 오류가 발생했습니다.', 500);
  }
});

/**
 * POST /api/screenshots/:websiteId/capture
 * 특정 웹사이트의 스크린샷 수동 캡처 트리거
 */
router.post('/:websiteId/capture', authenticate, async (req, res) => {
  try {
    const { websiteId } = req.params;
    const authReq = req as AuthenticatedRequest;
    const siteId = parseInt(websiteId);

    if (isNaN(siteId)) {
      sendError(res, 'INVALID_ID', '유효하지 않은 웹사이트 ID입니다.', 400);
      return;
    }

    const website = await prisma.website.findUnique({
      where: { id: siteId },
    });

    if (!website) {
      sendError(res, 'NOT_FOUND', '웹사이트를 찾을 수 없습니다.', 404);
      return;
    }

    await schedulerService.enqueueScreenshot(
      { id: website.id, url: website.url },
      true,
    );

    sendSuccess(res, {
      websiteId: siteId,
      status: 'queued',
      createdAt: new Date(),
      createdBy: authReq.user?.userId,
    }, 202);
  } catch (error) {
    sendError(res, 'CAPTURE_ERROR', '스크린샷 캡처 요청 중 오류가 발생했습니다.', 500);
  }
});

export default router;
