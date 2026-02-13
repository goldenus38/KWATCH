'use client';

import React, { useState } from 'react';
import { MonitoringStatus, WebsiteStatus } from '@/types';
import { formatResponseTime, cn, truncate } from '@/lib/utils';
import { STATUS_COLORS, RESPONSE_TIME_WARNING_MS, API_BASE_URL } from '@/lib/constants';
import { StatusIndicator } from './StatusIndicator';

interface SiteCardProps {
  data: MonitoringStatus;
  onClick: () => void;
}

/**
 * 개별 웹사이트 카드 컴포넌트 (컴팩트 버전)
 * 그리드 셀에 꽉 차도록 h-full 사용
 */
export const SiteCard = React.memo(function SiteCard({ data, onClick }: SiteCardProps) {
  const [imgError, setImgError] = useState(false);
  const status: WebsiteStatus = (() => {
    if (!data.isUp) return 'critical';
    if (data.defacementStatus?.isDefaced) return 'critical';
    if (data.responseTimeMs && data.responseTimeMs > RESPONSE_TIME_WARNING_MS) return 'warning';
    return 'normal';
  })();

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative group cursor-pointer rounded overflow-hidden h-full flex flex-col',
        'bg-kwatch-bg-secondary transition-all duration-300',
        'border',
        status === 'warning' && 'border-kwatch-status-warning shadow-status-warning',
        status === 'critical' && 'border-kwatch-status-critical shadow-status-critical animate-glow',
        status === 'normal' && 'border-kwatch-bg-tertiary',
      )}
    >
      {/* 스크린샷 영역 - 카드 높이의 대부분 차지 */}
      <div className="relative flex-1 bg-black overflow-hidden min-h-0">
        {data.screenshotUrl && !imgError ? (
          <img
            src={`${API_BASE_URL}${data.screenshotUrl}`}
            alt={data.websiteName}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-kwatch-bg-tertiary">
            <span className="text-kwatch-text-muted text-xs">No Image</span>
          </div>
        )}

        {/* 위변조 배지 */}
        {data.defacementStatus?.isDefaced && (
          <div className="absolute top-1 left-1 text-[10px] bg-kwatch-status-critical/80 text-white rounded px-1">
            위변조
          </div>
        )}

        {/* 비정상 시 상태코드 배지 */}
        {status !== 'normal' && data.statusCode && (
          <div
            className={cn(
              'absolute top-1 right-1 text-[10px] text-white rounded px-1 font-mono',
              status === 'critical' ? 'bg-kwatch-status-critical/80' : 'bg-kwatch-status-warning/80',
            )}
          >
            {data.statusCode}
          </div>
        )}
      </div>

      {/* 하단 정보 바 - 한 줄로 컴팩트하게 */}
      <div className="flex-shrink-0 px-1.5 py-1 flex items-center justify-between gap-1 min-h-0">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <StatusIndicator status={status} size="sm" pulse={status === 'critical'} />
          <span className="text-[11px] text-kwatch-text-primary truncate">
            {truncate(data.organizationName ? `${data.organizationName} ${data.websiteName}` : data.websiteName, 12)}
          </span>
        </div>
        <span
          className={cn(
            'text-[10px] font-mono flex-shrink-0',
            status === 'warning' && 'text-kwatch-status-warning',
            status === 'critical' && 'text-kwatch-status-critical',
            status === 'normal' && 'text-kwatch-status-normal',
          )}
        >
          {data.isUp
            ? formatResponseTime(data.responseTimeMs)
            : 'ERR'}
        </span>
      </div>
    </div>
  );
});
