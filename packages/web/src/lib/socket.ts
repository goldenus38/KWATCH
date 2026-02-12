import { io, Socket } from 'socket.io-client';
import { WS_URL } from './constants';
import type {
  WsStatusUpdate,
  WsAlertNew,
  WsDefacementDetected,
  WsScreenshotUpdated,
} from '@/types';

let socket: Socket | null = null;

/**
 * Socket.IO 클라이언트 연결
 * SSR 환경에서는 호출하지 마세요 (typeof window === 'undefined')
 */
export const connectSocket = (): Socket => {
  // 이미 연결되어 있거나 연결 중이면 기존 소켓 반환
  if (socket && (socket.connected || socket.active)) {
    return socket;
  }

  socket = io(`${WS_URL}/dashboard`, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });

  socket.on('connect', () => {
    console.log('[WS] Dashboard connected');
    socket?.emit('dashboard:subscribe');
  });

  socket.on('disconnect', (reason) => {
    console.log('[WS] Disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('[WS] Connection error:', error.message);
  });

  return socket;
};

/**
 * Socket.IO 연결 해제
 */
export const disconnectSocket = (): void => {
  if (socket) {
    socket.emit('dashboard:unsubscribe');
    socket.disconnect();
    socket = null;
  }
};

/**
 * 현재 소켓 인스턴스 가져오기
 */
export const getSocket = (): Socket | null => socket;

/**
 * 이벤트 리스너 등록 헬퍼
 */
export const onStatusUpdate = (
  callback: (data: WsStatusUpdate) => void,
): void => {
  socket?.on('status:update', callback);
};

export const onStatusBulk = (
  callback: (data: WsStatusUpdate[]) => void,
): void => {
  socket?.on('status:bulk', callback);
};

export const onAlertNew = (
  callback: (data: WsAlertNew) => void,
): void => {
  socket?.on('alert:new', callback);
};

export const onDefacementDetected = (
  callback: (data: WsDefacementDetected) => void,
): void => {
  socket?.on('defacement:detected', callback);
};

export const onScreenshotUpdated = (
  callback: (data: WsScreenshotUpdated) => void,
): void => {
  socket?.on('screenshot:updated', callback);
};

/**
 * 필터 변경 이벤트 전송
 */
export const emitFilterChange = (filter: Record<string, unknown>): void => {
  socket?.emit('filter:change', filter);
};
