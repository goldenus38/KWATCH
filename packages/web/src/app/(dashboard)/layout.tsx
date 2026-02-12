'use client';

import { useEffect, useState } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isConnected } = useWebSocket();
  const [kioskMode, setKioskMode] = useState(false);

  // F11 키 입력으로 키오스크 모드 토글
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        setKioskMode((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div
      className={`w-full h-screen bg-kwatch-bg-primary text-kwatch-text-primary flex flex-col ${kioskMode ? 'kiosk-mode' : ''}`}
    >
      {/* WebSocket 연결 상태 표시 (개발용) */}
      {!kioskMode && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 text-xs">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-kwatch-status-normal' : 'bg-kwatch-status-critical'
            }`}
          />
          <span className="text-kwatch-text-muted">
            {isConnected ? '연결됨' : '연결 끊김'}
          </span>
        </div>
      )}

      {/* 대시보드 콘텐츠 */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>

      {/* 키오스크 모드 표시 (개발용) */}
      {!kioskMode && (
        <div className="px-4 py-2 bg-kwatch-bg-secondary border-t border-kwatch-bg-tertiary text-xs text-kwatch-text-muted">
          팁: F11을 눌러 키오스크 모드를 토글할 수 있습니다.
        </div>
      )}
    </div>
  );
}
