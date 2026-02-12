'use client';

import { useState, useEffect } from 'react';
import { useMonitoringData } from '@/hooks/useMonitoringData';
import { useAutoRotation } from '@/hooks/useAutoRotation';
import { connectSocket } from '@/lib/socket';
import { DEFAULT_ITEMS_PER_PAGE, DEFAULT_AUTO_ROTATE_INTERVAL } from '@/lib/constants';
import { SummaryBar } from '@/components/dashboard/SummaryBar';
import { ScreenshotGrid } from '@/components/dashboard/ScreenshotGrid';
import { AlertTimeline } from '@/components/dashboard/AlertTimeline';
import { DetailPopup } from '@/components/dashboard/DetailPopup';
import type { MonitoringStatus } from '@/types';

export default function DashboardPage() {
  // 상태 데이터 구독
  const {
    summary,
    statuses,
    recentAlerts,
    isLoading,
    error,
    refetch,
  } = useMonitoringData();

  // 웹소켓 연결 상태
  const [isConnected, setIsConnected] = useState(false);

  // 상세 팝업 상태
  const [selectedStatus, setSelectedStatus] = useState<MonitoringStatus | null>(null);

  // 키오스크 모드 상태
  const [isKioskMode, setIsKioskMode] = useState(false);

  // 페이지 계산
  const itemsPerPage = DEFAULT_ITEMS_PER_PAGE;
  const totalPages = Math.max(1, Math.ceil(statuses.length / itemsPerPage));

  // 자동 페이지 로테이션
  const {
    currentPage,
    setCurrentPage,
    isRotating,
    toggleRotation,
  } = useAutoRotation({
    totalPages,
    interval: DEFAULT_AUTO_ROTATE_INTERVAL,
    enabled: true,
  });

  // WebSocket 연결 초기화
  useEffect(() => {
    const socket = connectSocket();

    const handleConnect = () => {
      setIsConnected(true);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    // 연결된 상태 초기화
    if (socket.connected) {
      setIsConnected(true);
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  // 키오스크 모드 토글 (F11 키)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        setIsKioskMode(!isKioskMode);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isKioskMode]);

  // 사이트 클릭 핸들러
  const handleSiteClick = (websiteId: number) => {
    const site = statuses.find((s) => s.websiteId === websiteId);
    if (site) {
      setSelectedStatus(site);
    }
  };

  // 상세 팝업 닫기 핸들러
  const handleClosePopup = () => {
    setSelectedStatus(null);
  };

  // 페이지 변경 핸들러 (0-indexed)
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden bg-kwatch-bg-primary ${
      isKioskMode ? 'cursor-none' : ''
    }`}>
      {/* 상단 요약바 */}
      <div className="flex-shrink-0 border-b border-kwatch-bg-tertiary">
        <SummaryBar
          summary={summary}
          isConnected={isConnected}
          isLoading={isLoading}
          isRotating={isRotating}
          onToggleRotation={toggleRotation}
        />
      </div>

      {/* 중앙 스크린샷 그리드 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {isLoading ? (
          /* 로딩 스켈레톤 */
          <div className="flex-1 p-6">
            <div
              className="gap-4"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                height: 'fit-content',
              }}
            >
              {Array.from({ length: itemsPerPage }, (_, i) => (
                <div key={i} className="rounded-lg bg-kwatch-bg-secondary overflow-hidden">
                  <div className="aspect-video bg-kwatch-bg-tertiary animate-pulse" />
                  <div className="p-3 space-y-2">
                    <div className="h-4 bg-kwatch-bg-tertiary rounded animate-pulse w-3/4" />
                    <div className="h-3 bg-kwatch-bg-tertiary rounded animate-pulse w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          /* 에러 상태 */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="text-5xl">⚠️</div>
              <div className="text-dashboard-lg text-kwatch-text-primary">
                데이터를 불러올 수 없습니다
              </div>
              <div className="text-dashboard-base text-kwatch-text-secondary">
                {error}
              </div>
              <button
                onClick={refetch}
                className="px-6 py-2 bg-kwatch-accent hover:bg-kwatch-accent-hover text-white rounded-lg transition-colors text-dashboard-base"
              >
                다시 시도
              </button>
            </div>
          </div>
        ) : (
          <ScreenshotGrid
            statuses={statuses}
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            onPageChange={handlePageChange}
            onSiteClick={handleSiteClick}
          />
        )}
      </div>

      {/* 하단 알림 타임라인 */}
      <div className="flex-shrink-0 border-t border-kwatch-bg-tertiary h-[120px]">
        <AlertTimeline alerts={recentAlerts} />
      </div>

      {/* 상세 정보 팝업 */}
      {selectedStatus && (
        <DetailPopup
          websiteId={selectedStatus.websiteId}
          websiteName={selectedStatus.websiteName}
          siteStatus={selectedStatus}
          onClose={handleClosePopup}
        />
      )}
    </div>
  );
}
