'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import type { Socket } from 'socket.io-client';

interface UseWebSocketOptions {
  autoConnect?: boolean;
}

interface UseWebSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
}

/**
 * WebSocket 연결 관리 훅
 * - 이벤트 리스너 중복 등록 방지
 * - SSR 환경 안전 처리
 * - 언마운트 시 정리
 */
export function useWebSocket(
  options: UseWebSocketOptions = { autoConnect: true },
): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    // SSR 환경 방어
    if (typeof window === 'undefined') return;

    const socket = connectSocket();
    socketRef.current = socket;

    // 기존 리스너 제거 후 등록 (중복 방지)
    const handleConnect = () => {
      if (mountedRef.current) {
        setIsConnected(true);
      }
    };

    const handleDisconnect = () => {
      if (mountedRef.current) {
        setIsConnected(false);
      }
    };

    socket.off('connect', handleConnect);
    socket.off('disconnect', handleDisconnect);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    // 이미 연결된 상태 반영
    if (socket.connected) {
      setIsConnected(true);
    }
  }, []);

  const disconnect = useCallback(() => {
    disconnectSocket();
    socketRef.current = null;
    if (mountedRef.current) {
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (options.autoConnect) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      // 컴포넌트 언마운트 시 소켓 정리
      // 참고: 다른 컴포넌트에서 소켓을 사용 중일 수 있으므로
      // disconnect는 호출하지 않고, 리스너만 정리합니다.
      if (socketRef.current) {
        socketRef.current.off('connect');
        socketRef.current.off('disconnect');
      }
    };
  }, [options.autoConnect, connect]);

  return {
    socket: socketRef.current,
    isConnected,
    connect,
    disconnect,
  };
}
