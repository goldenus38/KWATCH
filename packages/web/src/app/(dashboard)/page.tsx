'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useMonitoringData } from '@/hooks/useMonitoringData';
import { useAutoRotation } from '@/hooks/useAutoRotation';
import { connectSocket } from '@/lib/socket';
import { api } from '@/lib/api';
import { DEFAULT_ITEMS_PER_PAGE, DEFAULT_AUTO_ROTATE_INTERVAL } from '@/lib/constants';
import { SummaryBar } from '@/components/dashboard/SummaryBar';
import { ScreenshotGrid } from '@/components/dashboard/ScreenshotGrid';
import { AlertTimeline } from '@/components/dashboard/AlertTimeline';
import { DetailPopup } from '@/components/dashboard/DetailPopup';
import type { MonitoringStatus, SummaryFilterType } from '@/types';

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const {
    summary,
    statuses,
    recentAlerts,
    responseTimeWarningMs,
    isLoading,
    error,
    sortVersion,
    refetch,
  } = useMonitoringData();

  const [isConnected, setIsConnected] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<MonitoringStatus | null>(null);
  const [statusFilter, setStatusFilter] = useState<SummaryFilterType>(null);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_ITEMS_PER_PAGE);
  const [autoRotateInterval, setAutoRotateInterval] = useState(DEFAULT_AUTO_ROTATE_INTERVAL);

  // ?detail=<websiteId> 쿼리 파라미터로 DetailPopup 자동 오픈
  const detailHandled = useRef(false);
  useEffect(() => {
    const detailId = searchParams.get('detail');
    if (!detailId || detailHandled.current || statuses.length === 0) return;

    const websiteId = parseInt(detailId, 10);
    if (isNaN(websiteId)) return;

    const site = statuses.find((s) => s.websiteId === websiteId);
    if (site) {
      setSelectedStatus(site);
      detailHandled.current = true;
      // URL에서 detail 파라미터 제거 (뒤로가기 시 다시 팝업 안 뜨도록)
      router.replace('/', { scroll: false });
    }
  }, [searchParams, statuses, router]);

  // 대시보드 설정을 서버에서 로드
  useEffect(() => {
    api.get<{ autoRotateInterval: number; itemsPerPage: number }>('/api/settings/dashboard')
      .then((res) => {
        if (res.success && res.data) {
          setItemsPerPage(res.data.itemsPerPage);
          setAutoRotateInterval(res.data.autoRotateInterval);
        }
      })
      .catch(() => {
        // fallback to defaults
      });
  }, []);

  const filteredStatuses = useMemo(() => {
    if (!statusFilter) return statuses;
    return statuses.filter((s) => {
      switch (statusFilter) {
        case 'up':
          return s.isUp && !s.defacementStatus?.isDefaced && (s.responseTimeMs == null || s.responseTimeMs <= responseTimeWarningMs);
        case 'warning':
          return s.isUp && !s.defacementStatus?.isDefaced && s.responseTimeMs != null && s.responseTimeMs > responseTimeWarningMs;
        case 'down':
          return !s.isUp;
        case 'defaced':
          return s.defacementStatus?.isDefaced === true;
        default:
          return true;
      }
    });
  }, [statuses, statusFilter, responseTimeWarningMs]);

  const totalPages = Math.max(1, Math.ceil(filteredStatuses.length / itemsPerPage));

  const {
    currentPage,
    setCurrentPage,
    isRotating,
    toggleRotation,
  } = useAutoRotation({
    totalPages,
    interval: autoRotateInterval,
    enabled: true,
    paused: selectedStatus !== null,
  });

  // WebSocket 연결
  useEffect(() => {
    const socket = connectSocket();

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    if (socket.connected) setIsConnected(true);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  const handleSiteClick = (websiteId: number) => {
    const site = statuses.find((s) => s.websiteId === websiteId);
    if (site) setSelectedStatus(site);
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-kwatch-bg-primary">
      {/* 상단 요약바 */}
      <div className="flex-shrink-0">
        <SummaryBar
          summary={summary}
          isConnected={isConnected}
          isLoading={isLoading}
          isRotating={isRotating}
          onToggleRotation={toggleRotation}
          activeFilter={statusFilter}
          onFilterChange={(f) => { setStatusFilter(f); setCurrentPage(0); }}
        />
      </div>

      {/* 중앙 스크린샷 그리드 - 남은 공간을 채움 */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {isLoading ? (
          <div className="flex-1 p-2">
            <div
              className="h-full gap-2"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                gridTemplateRows: 'repeat(5, minmax(0, 1fr))',
              }}
            >
              {Array.from({ length: itemsPerPage }, (_, i) => (
                <div key={i} className="rounded bg-kwatch-bg-secondary overflow-hidden animate-pulse" />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="text-5xl">⚠️</div>
              <div className="text-dashboard-lg text-kwatch-text-primary">
                데이터를 불러올 수 없습니다
              </div>
              <div className="text-dashboard-base text-kwatch-text-secondary">{error}</div>
              <button
                onClick={refetch}
                className="px-6 py-2 bg-kwatch-accent hover:bg-kwatch-accent-hover text-white rounded-lg transition-colors"
              >
                다시 시도
              </button>
            </div>
          </div>
        ) : (
          <ScreenshotGrid
            statuses={filteredStatuses}
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            totalPages={totalPages}
            onSiteClick={handleSiteClick}
            onPageChange={setCurrentPage}
            responseTimeWarningMs={responseTimeWarningMs}
            sortVersion={sortVersion}
          />
        )}
      </div>

      {/* 하단 알림 타임라인 - 얇은 한 줄 */}
      <div className="flex-shrink-0 border-t border-kwatch-bg-tertiary">
        <AlertTimeline alerts={recentAlerts} onAlertClick={handleSiteClick} />
      </div>

      {/* 상세 정보 팝업 */}
      {selectedStatus && (
        <DetailPopup
          websiteId={selectedStatus.websiteId}
          websiteName={selectedStatus.websiteName}
          siteStatus={selectedStatus}
          onClose={() => setSelectedStatus(null)}
        />
      )}
    </div>
  );
}
