'use client';

import { MonitoringStatus, WebsiteStatus } from '@/types';
import { formatResponseTime, cn, truncate } from '@/lib/utils';
import { STATUS_COLORS, RESPONSE_TIME_WARNING_MS } from '@/lib/constants';
import { StatusIndicator } from './StatusIndicator';

interface SiteCardProps {
  data: MonitoringStatus;
  onClick: () => void;
}

/**
 * 개별 웹사이트 카드 컴포넌트
 * 스크린샷 썸네일, 상태, 응답 시간 표시
 */
export function SiteCard({ data, onClick }: SiteCardProps) {
  // 상태 판정
  const status: WebsiteStatus = (() => {
    if (!data.isUp) return 'critical';
    if (data.defacementStatus?.isDefaced) return 'critical';
    if (data.responseTimeMs && data.responseTimeMs > RESPONSE_TIME_WARNING_MS) return 'warning';
    return 'normal';
  })();

  const colors = STATUS_COLORS[status];

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative group cursor-pointer rounded-lg overflow-hidden',
        'bg-kwatch-bg-secondary transition-all duration-300',
        'border-2',
        status === 'warning' && 'border-kwatch-status-warning shadow-status-warning',
        status === 'critical' &&
          'border-kwatch-status-critical shadow-status-critical animate-glow',
        status === 'normal' && 'border-transparent',
        'hover:shadow-lg hover:scale-105 active:scale-95',
      )}
    >
      {/* 스크린샷 영역 */}
      <div className="relative w-full bg-black aspect-video overflow-hidden">
        {data.screenshotUrl ? (
          <img
            src={data.screenshotUrl}
            alt={data.websiteName}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-kwatch-bg-tertiary">
            <div className="text-center">
              <div className="text-4xl mb-2">📷</div>
              <div className="text-kwatch-text-muted text-xs">
                스크린샷 없음
              </div>
            </div>
          </div>
        )}

        {/* 상태 오버레이 */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
      </div>

      {/* 정보 영역 */}
      <div className="p-3 space-y-2">
        {/* 웹사이트 이름 */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-dashboard-sm font-semibold text-kwatch-text-primary flex-1 truncate">
            {truncate(data.websiteName, 20)}
          </h3>
          <StatusIndicator status={status} size="md" pulse={status === 'critical'} />
        </div>

        {/* 응답 시간 */}
        <div className="flex items-center justify-between text-dashboard-sm">
          <span className="text-kwatch-text-secondary">응답:</span>
          <span
            className={cn(
              'font-mono font-semibold',
              status === 'warning' && 'text-kwatch-status-warning',
              status === 'critical' && 'text-kwatch-status-critical',
              status === 'normal' && 'text-kwatch-status-normal',
            )}
          >
            {data.isUp
              ? formatResponseTime(data.responseTimeMs)
              : data.errorMessage?.slice(0, 10) || 'ERROR'}
          </span>
        </div>

        {/* 위변조 상태 표시 */}
        {data.defacementStatus?.isDefaced && (
          <div className="text-xs bg-kwatch-status-critical/20 text-kwatch-status-critical rounded px-2 py-1">
            ◎ 위변조 감지
          </div>
        )}
      </div>

      {/* 호버 상태 추가 정보 */}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
        <div className="text-center text-white">
          <div className="text-dashboard-lg font-bold">클릭하여 상세 확인</div>
          <div className="text-dashboard-sm text-gray-300">
            {data.websiteName}
          </div>
        </div>
      </div>
    </div>
  );
}
