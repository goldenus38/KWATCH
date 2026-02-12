'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { MonitoringStatus, WebsiteStatus } from '@/types';
import { GRID_COLUMNS, GRID_ROWS } from '@/lib/constants';
import { SiteCard } from './SiteCard';

interface ScreenshotGridProps {
  statuses: MonitoringStatus[];
  currentPage: number; // 0-indexed
  itemsPerPage: number;
  totalPages: number;
  onSiteClick: (websiteId: number) => void;
}

/**
 * 웹사이트 스크린샷 그리드
 * 7x5 그리드가 화면에 스크롤 없이 꽉 차도록 렌더링
 * 비정상 사이트 우선 정렬 (장애/위변조 → 경고 → 정상)
 * 무한 루프 슬라이드: 마지막→첫 페이지 전환 시 복제본으로 자연스럽게 연결
 */
export function ScreenshotGrid({
  statuses,
  currentPage,
  itemsPerPage,
  totalPages,
  onSiteClick,
}: ScreenshotGridProps) {
  // 상태별 정렬 (비정상이 먼저 나타남)
  const sortedStatuses = useMemo(() => {
    return [...statuses].sort((a, b) => {
      const getStatusPriority = (status: MonitoringStatus): number => {
        if (status.defacementStatus?.isDefaced) return 0; // 위변조: 최우선
        if (!status.isUp) return 1; // 장애: 다음
        if (status.responseTimeMs && status.responseTimeMs > 3000) return 2; // 경고
        return 3; // 정상: 마지막
      };
      return getStatusPriority(a) - getStatusPriority(b);
    });
  }, [statuses]);

  // 페이지별로 아이템 분할
  const pages = useMemo(() => {
    const result: MonitoringStatus[][] = [];
    for (let i = 0; i < totalPages; i++) {
      const start = i * itemsPerPage;
      const end = start + itemsPerPage;
      result.push(sortedStatuses.slice(start, end));
    }
    return result;
  }, [sortedStatuses, totalPages, itemsPerPage]);

  // 무한 루프를 위한 내부 슬라이드 위치 관리
  const [slideIndex, setSlideIndex] = useState(currentPage);
  const [enableTransition, setEnableTransition] = useState(true);
  const prevPageRef = useRef(currentPage);

  useEffect(() => {
    const prevPage = prevPageRef.current;
    prevPageRef.current = currentPage;

    if (prevPage === totalPages - 1 && currentPage === 0 && totalPages > 1) {
      // 마지막 → 첫 페이지: 복제본(totalPages 위치)으로 슬라이드
      setEnableTransition(true);
      setSlideIndex(totalPages);

      // 애니메이션 완료 후 트랜지션 없이 실제 첫 페이지로 스냅
      const timer = setTimeout(() => {
        setEnableTransition(false);
        setSlideIndex(0);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setEnableTransition(true);
          });
        });
      }, 700);

      return () => clearTimeout(timer);
    } else {
      setEnableTransition(true);
      setSlideIndex(currentPage);
    }
  }, [currentPage, totalPages]);

  const displayPage = currentPage + 1;

  // 그리드 페이지 렌더링 헬퍼
  const renderPage = (pageItems: MonitoringStatus[], key: string) => (
    <div key={key} className="w-full flex-shrink-0 p-2">
      <div
        className="h-full gap-2"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${GRID_ROWS}, minmax(0, 1fr))`,
        }}
      >
        {pageItems.map((status) => (
          <SiteCard
            key={status.websiteId}
            data={status}
            onClick={() => onSiteClick(status.websiteId)}
          />
        ))}
        {Array.from(
          { length: Math.max(0, itemsPerPage - pageItems.length) },
          (_, i) => (
            <div
              key={`empty-${i}`}
              className="rounded bg-kwatch-bg-secondary/20 border border-dashed border-kwatch-bg-tertiary"
            />
          ),
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {statuses.length > 0 ? (
        <>
          {/* 슬라이드 컨테이너 */}
          <div className="flex-1 overflow-hidden">
            <div
              className={`flex h-full ${enableTransition ? 'transition-transform duration-700 ease-in-out' : ''}`}
              style={{ transform: `translateX(-${slideIndex * 100}%)` }}
            >
              {/* 실제 페이지들 */}
              {pages.map((pageItems, pageIndex) =>
                renderPage(pageItems, `page-${pageIndex}`),
              )}
              {/* 첫 페이지 복제본 (무한 루프용) */}
              {totalPages > 1 && pages[0] &&
                renderPage(pages[0], 'page-clone')}
            </div>
          </div>

          {/* 페이지네이션 - 얇은 바 */}
          {totalPages > 1 && (
            <div className="flex-shrink-0 px-4 py-1 flex items-center justify-center gap-3">
              <span className="text-xs text-kwatch-text-muted">
                {displayPage}/{totalPages}
              </span>
              <div className="flex gap-1.5">
                {Array.from({ length: totalPages }, (_, i) => i).map((page) => (
                  <div
                    key={page}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      page === currentPage
                        ? 'bg-kwatch-accent w-3'
                        : 'bg-kwatch-bg-tertiary'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4">📭</div>
            <div className="text-dashboard-lg text-kwatch-text-secondary">
              모니터링 중인 웹사이트가 없습니다
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
