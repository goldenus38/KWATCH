import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError, createPaginationMeta } from '../utils/response';
import { AuthenticatedRequest, AlertFilter } from '../types';
import { alertService } from '../services/AlertService';
import { getDbClient } from '../config/database';

const router = Router();
const prisma = getDbClient();

/**
 * GET /api/alerts
 * 알림 목록 조회 (필터: type, severity, acknowledged)
 */
router.get('/', async (req, res) => {
  try {
    const { alertType, severity, isAcknowledged, websiteId, page = 1, limit = 50 } = req.query as any;

    const filter: AlertFilter = {
      alertType: alertType as any,
      severity: severity as any,
      isAcknowledged: isAcknowledged === 'true' ? true : isAcknowledged === 'false' ? false : undefined,
      websiteId: websiteId ? parseInt(websiteId) : undefined,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
    };

    const { alerts, total } = await alertService.getAlerts(filter);

    const meta = createPaginationMeta(total, filter.page || 1, filter.limit || 50);
    sendSuccess(res, alerts, 200, meta);
  } catch (error) {
    sendError(res, 'LIST_ERROR', '알림 목록 조회 중 오류가 발생했습니다.', 500);
  }
});

/**
 * PUT /api/alerts/:id/acknowledge
 * 알림을 확인 상태로 변경
 */
router.put('/:id/acknowledge', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;

    const alertId = parseInt(id);

    if (isNaN(alertId)) {
      sendError(res, 'INVALID_ID', '유효하지 않은 알림 ID입니다.', 400);
      return;
    }

    const userId = authReq.user?.userId;
    if (!userId) {
      sendError(res, 'UNAUTHORIZED', '인증이 필요합니다.', 401);
      return;
    }

    await alertService.acknowledgeAlert(BigInt(alertId), userId);

    const updatedAlert = await prisma.alert.findUnique({
      where: { id: BigInt(alertId) },
      include: {
        website: { select: { id: true, name: true } },
        acknowledger: { select: { id: true, username: true } },
      },
    });

    sendSuccess(res, updatedAlert);
  } catch (error) {
    sendError(res, 'UPDATE_ERROR', '알림 확인 처리 중 오류가 발생했습니다.', 500);
  }
});

/**
 * GET /api/alerts/channels
 * 알림 채널 설정 조회
 */
router.get('/channels', authenticate, authorize('admin'), async (req, res) => {
  try {
    const channels = await prisma.alertChannel.findMany({
      orderBy: { createdAt: 'asc' },
    });

    sendSuccess(res, channels);
  } catch (error) {
    sendError(res, 'CHANNELS_ERROR', '알림 채널 설정 조회 중 오류가 발생했습니다.', 500);
  }
});

/**
 * PUT /api/alerts/channels/:id
 * 알림 채널 설정 수정 (admin only)
 */
router.put('/channels/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { config: channelConfig, isActive } = req.body;

    const channelId = parseInt(id);

    if (isNaN(channelId)) {
      sendError(res, 'INVALID_ID', '유효하지 않은 채널 ID입니다.', 400);
      return;
    }

    const existingChannel = await prisma.alertChannel.findUnique({
      where: { id: channelId },
    });

    if (!existingChannel) {
      sendError(res, 'NOT_FOUND', '알림 채널을 찾을 수 없습니다.', 404);
      return;
    }

    const updateData: any = {};
    if (channelConfig !== undefined) {
      updateData.config = channelConfig;
    }
    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }

    const updatedChannel = await prisma.alertChannel.update({
      where: { id: channelId },
      data: updateData,
    });

    sendSuccess(res, updatedChannel);
  } catch (error) {
    sendError(res, 'UPDATE_ERROR', '알림 채널 설정 수정 중 오류가 발생했습니다.', 500);
  }
});

export default router;
