'use client';

import { MonitoringStatus, WebsiteStatus } from '@/types';
import { GRID_COLUMNS } from '@/lib/constants';
import { SiteCard } from './SiteCard';

interface ScreenshotGridProps {
  statuses: MonitoringStatus[];
  currentPage: number; // 0-indexed
  itemsPerPage: number;
  onPageChange: (page: number) => void; // 0-indexed
  onSiteClick: (websiteId: number) => void;
}

/**
 * 웹사이트 스크린샷 그리드
 * 반응형 CSS Grid, 비정상 사이트 우선 정렬
 * currentPage는 0-indexed로 동작
 */
export function ScreenshotGrid({
  statuses,
  currentPage,
  itemsPerPage,
  onPageChange,
  onSiteClick,
}: ScreenshotGridProps) {
  // 상태별 정렬 (비정상이 먼저 나타남)
  const sortedStatuses = [...statuses].sort((a, b) => {
    const getStatusPriority = (status: MonitoringStatus): number => {
      if (!status.isUp || status.defacementStatus?.isDefaced) return 0; // 장애/위변조: 최우선
      if (status.responseTimeMs && status.responseTimeMs > 3000) return 1; // 경고: 다음
      return 2; // 정상: 마지막
    };

    return getStatusPriority(a) - getStatusPriority(b);
  });

  // 페이징 (0-indexed)
  const totalPages = Math.max(1, Math.ceil(sortedStatuses.length / itemsPerPage));
  const start = currentPage * itemsPerPage;
  const end = start + itemsPerPage;
  const currentItems = sortedStatuses.slice(start, end);

  // 빈 공간 채우기 (그리드 레이아웃 완성)
  const emptySlots = itemsPerPage - currentItems.length;
  const emptyArray = Array.from({ length: Math.max(0, emptySlots) }, (_, i) => i);

  // 표시용 페이지 번호 (1-indexed)
  const displayPage = currentPage + 1;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 그리드 */}
      <div className="flex-1 overflow-auto p-6">
        {currentItems.length > 0 ? (
          <div
            className="gap-4"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
              height: 'fit-content',
            }}
          >
            {/* 웹사이트 카드 */}
            {currentItems.map((status) => (
              <SiteCard
                key={status.websiteId}
                data={status}
                onClick={() => onSiteClick(status.websiteId)}
              />
            ))}

            {/* 빈 슬롯 */}
            {emptyArray.map((index) => (
              <div
                key={`empty-${index}`}
                className="rounded-lg bg-kwatch-bg-secondary/30 border-2 border-dashed border-kwatch-bg-tertiary aspect-video"
              />
            ))}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl mb-4">📭</div>
              <div className="text-dashboard-lg text-kwatch-text-secondary">
                모니터링 중인 웹사이트가 없습니다
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="bg-kwatch-bg-secondary border-t border-kwatch-bg-tertiary px-6 py-4 flex items-center justify-center gap-3">
          {/* 페이지 텍스트 */}
          <span className="text-dashboard-sm text-kwatch-text-secondary">
            페이지 {displayPage}/{totalPages}
          </span>

          {/* 페이지 인디케이터 도트 */}
          <div className="flex gap-2">
            {Array.from({ length: totalPages }, (_, i) => i).map((page) => (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={`w-2 h-2 rounded-full transition-all ${
                  page === currentPage
                    ? 'bg-kwatch-accent w-4'
                    : 'bg-kwatch-bg-tertiary hover:bg-kwatch-text-secondary'
                }`}
                aria-label={`페이지 ${page + 1}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
