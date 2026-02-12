'use client';

import { useState, useEffect } from 'react';
import { useMonitoringData } from '@/hooks/useMonitoringData';
import { useAutoRotation } from '@/hooks/useAutoRotation';
import { connectSocket } from '@/lib/socket';
import { DEFAULT_ITEMS_PER_PAGE, DEFAULT_AUTO_ROTATE_INTERVAL } from '@/lib/constants';
import SummaryBar from '@/components/dashboard/SummaryBar';
import ScreenshotGrid from '@/components/dashboard/ScreenshotGrid';
import AlertTimeline from '@/components/dashboard/AlertTimeline';
import { DetailPopup } from '@/components/dashboard/DetailPopup';

export default function DashboardPage() {
  // 상태 데이터 구독
  const {
    summary,
    statuses,
    recentAlerts,
    isLoading,
  } = useMonitoringData();

  // 웹소켓 연결 상태
  const [isConnected, setIsConnected] = useState(false);

  // 상세 팝업 상태
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<number | null>(null);
  const [selectedWebsiteName, setSelectedWebsiteName] = useState<string>('');

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

  // 현재 페이지에 해당하는 사이트 필터링 (currentPage는 0-indexed)
  const startIndex = currentPage * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentSites = statuses.slice(startIndex, endIndex);

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
    setSelectedWebsiteId(websiteId);
    setSelectedWebsiteName(site?.websiteName || '');
  };

  // 상세 팝업 닫기 핸들러
  const handleClosePopup = () => {
    setSelectedWebsiteId(null);
    setSelectedWebsiteName('');
  };

  // 페이지 변경 핸들러
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden bg-kwatch-bg-primary ${
      isKioskMode ? 'cursor-none' : ''
    }`}>
      {/* 상단 요약바 */}
      <div className="flex-shrink-0 border-b border-kwatch-bg-tertiary">
        <SummaryBar summary={summary} isConnected={isConnected} />
      </div>

      {/* 중앙 스크린샷 그리드 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <ScreenshotGrid
          statuses={currentSites}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          onPageChange={handlePageChange}
          onSiteClick={handleSiteClick}
        />
      </div>

      {/* 하단 알림 타임라인 */}
      <div className="flex-shrink-0 border-t border-kwatch-bg-tertiary h-[120px]">
        <AlertTimeline alerts={recentAlerts} />
      </div>

      {/* 상세 정보 팝업 */}
      {selectedWebsiteId && (
        <DetailPopup
          websiteId={selectedWebsiteId}
          websiteName={selectedWebsiteName}
          onClose={handleClosePopup}
        />
      )}
    </div>
  );
}
