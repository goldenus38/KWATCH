import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { sendSuccess, sendError, createPaginationMeta } from '../utils/response';
import { AuthenticatedRequest } from '../types';
import { defacementService } from '../services/DefacementService';
import { getDbClient } from '../config/database';

const router = Router();
const prisma = getDbClient();

/**
 * GET /api/defacement/:websiteId
 * 특정 웹사이트의 위변조 체크 이력 조회 (페이지네이션)
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
    const [checks, totalCount] = await Promise.all([
      defacementService.getHistory(siteId, limitNum, offset),
      prisma.defacementCheck.count({ where: { websiteId: siteId } }),
    ]);

    const meta = createPaginationMeta(totalCount, pageNum, limitNum);
    sendSuccess(res, checks, 200, meta);
  } catch (error) {
    sendError(res, 'HISTORY_ERROR', '위변조 체크 이력 조회 중 오류가 발생했습니다.', 500);
  }
});

/**
 * GET /api/defacement/:websiteId/latest
 * 특정 웹사이트의 최신 위변조 체크 결과 조회
 */
router.get('/:websiteId/latest', async (req, res) => {
  try {
    const { websiteId } = req.params;
    const siteId = parseInt(websiteId);

    if (isNaN(siteId)) {
      sendError(res, 'INVALID_ID', '유효하지 않은 웹사이트 ID입니다.', 400);
      return;
    }

    const latestCheck = await defacementService.getLatestCheck(siteId);

    if (!latestCheck) {
      sendError(res, 'NOT_FOUND', '위변조 체크 결과를 찾을 수 없습니다.', 404);
      return;
    }

    sendSuccess(res, latestCheck);
  } catch (error) {
    sendError(res, 'GET_LATEST_ERROR', '최신 위변조 체크 결과 조회 중 오류가 발생했습니다.', 500);
  }
});

/**
 * POST /api/defacement/:websiteId/baseline
 * 특정 웹사이트의 위변조 베이스라인 갱신
 */
router.post('/:websiteId/baseline', authenticate, async (req, res) => {
  try {
    const { websiteId } = req.params;
    const { screenshotId } = req.body;
    const authReq = req as AuthenticatedRequest;

    const siteId = parseInt(websiteId);
    const scrId = parseInt(screenshotId);

    if (isNaN(siteId)) {
      sendError(res, 'INVALID_ID', '유효하지 않은 웹사이트 ID입니다.', 400);
      return;
    }

    if (isNaN(scrId)) {
      sendError(res, 'INVALID_INPUT', '스크린샷 ID는 필수입니다.', 400);
      return;
    }

    const userId = authReq.user?.userId;
    if (!userId) {
      sendError(res, 'UNAUTHORIZED', '인증이 필요합니다.', 401);
      return;
    }

    await defacementService.updateBaseline(siteId, BigInt(scrId), userId);

    const newBaseline = await prisma.defacementBaseline.findFirst({
      where: { websiteId: siteId, isActive: true },
      include: { screenshot: true },
    });

    sendSuccess(res, newBaseline, 201);
  } catch (error) {
    sendError(res, 'BASELINE_ERROR', '베이스라인 갱신 중 오류가 발생했습니다.', 500);
  }
});

/**
 * POST /api/defacement/:websiteId/recheck
 * 특정 웹사이트의 위변조 재분석을 즉시 트리거
 */
router.post('/:websiteId/recheck', authenticate, async (req, res) => {
  try {
    const { websiteId } = req.params;
    const siteId = parseInt(websiteId);

    if (isNaN(siteId)) {
      sendError(res, 'INVALID_ID', '유효하지 않은 웹사이트 ID입니다.', 400);
      return;
    }

    // 웹사이트 URL 조회
    const website = await prisma.website.findUnique({
      where: { id: siteId },
      select: { url: true },
    });

    if (!website) {
      sendError(res, 'NOT_FOUND', '웹사이트를 찾을 수 없습니다.', 404);
      return;
    }

    // 최신 스크린샷 조회
    const latestScreenshot = await prisma.screenshot.findFirst({
      where: { websiteId: siteId },
      orderBy: { capturedAt: 'desc' },
    });

    if (!latestScreenshot) {
      sendError(res, 'NO_SCREENSHOT', '스크린샷이 없습니다. 먼저 스크린샷을 캡처해주세요.', 400);
      return;
    }

    // 활성 베이스라인 조회
    const activeBaseline = await prisma.defacementBaseline.findFirst({
      where: { websiteId: siteId, isActive: true },
    });

    if (!activeBaseline) {
      sendError(res, 'NO_BASELINE', '베이스라인이 없습니다. 먼저 베이스라인을 설정해주세요.', 400);
      return;
    }

    // HTML 페이지 fetch (하이브리드 탐지용)
    let htmlContent: string | undefined;
    try {
      const response = await fetch(website.url, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'KWATCH/1.0' },
      });
      if (response.ok) {
        htmlContent = await response.text();
      }
    } catch {
      // HTML fetch 실패 시 pixel_only로 fallback (무시)
    }

    // 위변조 재분석 큐에 등록
    const { schedulerService } = await import('../services/SchedulerService');
    await schedulerService.enqueueDefacementCheck(
      siteId,
      latestScreenshot.id,
      activeBaseline.id,
      htmlContent,
    );

    sendSuccess(res, {
      status: 'queued',
      message: '위변조 재분석이 큐에 등록되었습니다.',
    }, 202);
  } catch (error) {
    sendError(res, 'RECHECK_ERROR', '위변조 재분석 요청 중 오류가 발생했습니다.', 500);
  }
});

/**
 * GET /api/defacement/diff/:checkId
 * 위변조 체크 결과의 차이 이미지 반환
 */
router.get('/diff/:checkId', async (req, res) => {
  try {
    const { checkId } = req.params;
    const cId = parseInt(checkId);

    if (isNaN(cId)) {
      sendError(res, 'INVALID_ID', '유효하지 않은 체크 ID입니다.', 400);
      return;
    }

    const buffer = await defacementService.getDiffImageBuffer(BigInt(cId));

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(buffer);
  } catch (error) {
    sendError(res, 'FILE_ERROR', '차이 이미지 조회 중 오류가 발생했습니다.', 500);
  }
});

export default router;
