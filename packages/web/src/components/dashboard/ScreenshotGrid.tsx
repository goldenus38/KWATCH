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
  onPageChange: (page: number) => void;
  responseTimeWarningMs?: number;
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
  onPageChange,
  responseTimeWarningMs = 10000,
}: ScreenshotGridProps) {
  // 상태별 정렬 (비정상이 먼저 나타남)
  const sortedStatuses = useMemo(() => {
    return [...statuses].sort((a, b) => {
      const getStatusPriority = (status: MonitoringStatus): number => {
        if (status.defacementStatus?.isDefaced) return 0; // 위변조: 최우선
        if (!status.isUp) return 1; // 장애: 다음
        if (status.isUp && status.responseTimeMs && status.responseTimeMs > responseTimeWarningMs) return 2; // 경고
        return 3; // 정상: 마지막
      };
      const priorityDiff = getStatusPriority(a) - getStatusPriority(b);
      return priorityDiff !== 0 ? priorityDiff : a.websiteId - b.websiteId;
    });
  }, [statuses, responseTimeWarningMs]);

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
            responseTimeWarningMs={responseTimeWarningMs}
          />
        ))}
        {Array.from(
          { length: Math.max(0, itemsPerPage - pageItems.length) },
          (_, i) => (
            <div
              key={`empty-${currentPage}-${i}`}
              className="rounded bg-kwatch-bg-secondary/20 border border-dashed border-kwatch-bg-tertiary"
            />
          ),
        )}
      </div>
    </div>
  );

  const handlePrev = () => {
    const prevPage = currentPage === 0 ? totalPages - 1 : currentPage - 1;
    onPageChange(prevPage);
  };

  const handleNext = () => {
    const nextPage = (currentPage + 1) % totalPages;
    onPageChange(nextPage);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {statuses.length > 0 ? (
        <>
          {/* 슬라이드 컨테이너 + 화살표 */}
          <div className="flex-1 overflow-hidden relative">
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

            {/* 좌/우 화살표 버튼 */}
            {totalPages > 1 && (
              <>
                <button
                  onClick={handlePrev}
                  className="absolute left-1 top-1/2 -translate-y-1/2 z-10 w-8 h-16 flex items-center justify-center rounded bg-kwatch-bg-secondary/60 hover:bg-kwatch-bg-tertiary/80 text-kwatch-text-secondary hover:text-kwatch-text-primary transition-all"
                  aria-label="이전 페이지"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <button
                  onClick={handleNext}
                  className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-8 h-16 flex items-center justify-center rounded bg-kwatch-bg-secondary/60 hover:bg-kwatch-bg-tertiary/80 text-kwatch-text-secondary hover:text-kwatch-text-primary transition-all"
                  aria-label="다음 페이지"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </>
            )}
          </div>

          {/* 페이지네이션 - 얇은 바 */}
          {totalPages > 1 && (
            <div className="flex-shrink-0 px-4 py-1 flex items-center justify-center gap-3">
              <span className="text-xs text-kwatch-text-muted">
                {displayPage}/{totalPages}
              </span>
              <div className="flex gap-1.5">
                {Array.from({ length: totalPages }, (_, i) => i).map((page) => (
                  <button
                    key={page}
                    onClick={() => onPageChange(page)}
                    className={`h-1.5 rounded-full transition-all cursor-pointer hover:bg-kwatch-accent/70 ${
                      page === currentPage
                        ? 'bg-kwatch-accent w-3'
                        : 'bg-kwatch-bg-tertiary w-1.5 hover:w-2'
                    }`}
                    aria-label={`${page + 1} 페이지로 이동`}
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
