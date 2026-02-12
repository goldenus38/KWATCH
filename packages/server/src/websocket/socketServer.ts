import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { MonitoringStatus, WsAlertNew, WsDefacementDetected } from '../types';

let io: SocketIOServer | null = null;

/**
 * Socket.IO 서버를 초기화합니다
 * @param httpServer HTTP 서버 인스턴스
 * @returns Socket.IO 서버 인스턴스
 */
export function initSocketServer(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // 대시보드 네임스페이스
  const dashboardNamespace = io.of('/dashboard');

  dashboardNamespace.on('connection', (socket: Socket) => {
    logger.info(`[SocketIO] Dashboard client connected: ${socket.id}`);

    // 클라이언트가 대시보드 구독 시작
    socket.on('dashboard:subscribe', () => {
      socket.join('dashboard-room');
      logger.debug(`[SocketIO] Client ${socket.id} subscribed to dashboard room`);
    });

    // 클라이언트가 대시보드 구독 해제
    socket.on('dashboard:unsubscribe', () => {
      socket.leave('dashboard-room');
      logger.debug(`[SocketIO] Client ${socket.id} unsubscribed from dashboard room`);
    });

    // 필터 변경 이벤트
    socket.on('filter:change', (filters: any) => {
      logger.debug(`[SocketIO] Client ${socket.id} changed filters:`, filters);
      // TODO: 필터 변경에 따른 추가 로직 구현 (필요시)
    });

    // 클라이언트 연결 해제
    socket.on('disconnect', () => {
      logger.info(`[SocketIO] Dashboard client disconnected: ${socket.id}`);
    });

    // 에러 처리
    socket.on('error', (error: Error) => {
      logger.error(`[SocketIO] Socket error for client ${socket.id}:`, error);
    });
  });

  logger.info('[SocketIO] Socket.IO server initialized');
  return io;
}

/**
 * 개별 웹사이트의 상태 업데이트를 브로드캐스트합니다
 * @param websiteId 웹사이트 ID
 * @param status 모니터링 상태 정보
 */
export function emitStatusUpdate(websiteId: number, status: MonitoringStatus): void {
  if (!io) {
    logger.warn('[SocketIO] Socket.IO not initialized, status update skipped');
    return;
  }

  try {
    io.of('/dashboard').to('dashboard-room').emit('status:update', {
      websiteId,
      status,
      timestamp: new Date(),
    });

    logger.debug(`[SocketIO] Status update emitted for website ${websiteId}`);
  } catch (error) {
    logger.error('[SocketIO] Failed to emit status update:', error);
  }
}

/**
 * 여러 웹사이트의 상태를 벌크로 브로드캐스트합니다
 * @param statuses 모니터링 상태 배열
 */
export function emitStatusBulk(statuses: MonitoringStatus[]): void {
  if (!io) {
    logger.warn('[SocketIO] Socket.IO not initialized, bulk status update skipped');
    return;
  }

  try {
    io.of('/dashboard').to('dashboard-room').emit('status:bulk', {
      statuses,
      timestamp: new Date(),
    });

    logger.debug(`[SocketIO] Bulk status update emitted for ${statuses.length} websites`);
  } catch (error) {
    logger.error('[SocketIO] Failed to emit bulk status update:', error);
  }
}

/**
 * 새로운 알림을 브로드캐스트합니다
 * @param alert 알림 정보
 */
export function emitAlertNew(alert: WsAlertNew['alert']): void {
  if (!io) {
    logger.warn('[SocketIO] Socket.IO not initialized, alert notification skipped');
    return;
  }

  try {
    io.of('/dashboard').to('dashboard-room').emit('alert:new', {
      alert,
      timestamp: new Date(),
    });

    logger.debug(
      `[SocketIO] Alert emitted for website ${alert.websiteId}: ${alert.alertType}`,
    );
  } catch (error) {
    logger.error('[SocketIO] Failed to emit alert:', error);
  }
}

/**
 * 위변조 감지를 브로드캐스트합니다
 * @param detection 위변조 감지 정보
 */
export function emitDefacementDetected(detection: WsDefacementDetected | any): void {
  if (!io) {
    logger.warn('[SocketIO] Socket.IO not initialized, defacement notification skipped');
    return;
  }

  try {
    io.of('/dashboard').to('dashboard-room').emit('defacement:detected', {
      websiteId: detection.websiteId,
      websiteName: detection.websiteName,
      similarityScore: detection.similarityScore,
      diffImageUrl: detection.diffImageUrl,
      timestamp: new Date(),
    });

    logger.debug(
      `[SocketIO] Defacement detected emitted for website ${detection.websiteId}`,
    );
  } catch (error) {
    logger.error('[SocketIO] Failed to emit defacement detection:', error);
  }
}

/**
 * 스크린샷 업데이트를 브로드캐스트합니다
 * @param websiteId 웹사이트 ID
 * @param screenshotUrl 스크린샷 URL
 */
export function emitScreenshotUpdate(websiteId: number, screenshotUrl: string): void {
  if (!io) {
    logger.warn('[SocketIO] Socket.IO not initialized, screenshot update skipped');
    return;
  }

  try {
    io.of('/dashboard').to('dashboard-room').emit('screenshot:updated', {
      websiteId,
      screenshotUrl,
      timestamp: new Date(),
    });

    logger.debug(`[SocketIO] Screenshot update emitted for website ${websiteId}`);
  } catch (error) {
    logger.error('[SocketIO] Failed to emit screenshot update:', error);
  }
}

/**
 * Socket.IO 서버를 종료합니다
 */
export async function closeSocketServer(): Promise<void> {
  if (io) {
    await io.close();
    io = null;
    logger.info('[SocketIO] Socket.IO server closed');
  }
}

/**
 * Socket.IO 서버 인스턴스를 반환합니다
 */
export function getSocketServer(): SocketIOServer | null {
  return io;
}
