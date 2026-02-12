'use client';

import { WebsiteStatus } from '@/types';
import { STATUS_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface StatusIndicatorProps {
  status: WebsiteStatus;
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
}

/**
 * 상태 표시 도트 컴포넌트
 * 웹사이트 상태를 색상으로 표현
 */
export function StatusIndicator({
  status,
  size = 'md',
  pulse = false,
}: StatusIndicatorProps) {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  const colors = STATUS_COLORS[status];

  return (
    <div
      className={cn(
        'rounded-full',
        sizeClasses[size],
        pulse && status === 'critical' && 'animate-pulse',
      )}
      style={{ backgroundColor: colors.dot }}
      title={status}
      role="img"
      aria-label={`Status: ${status}`}
    />
  );
}
