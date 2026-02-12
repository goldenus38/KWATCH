'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/types';
import { formatTime } from '@/lib/utils';
import { ALERT_TYPE_ICONS, ALERT_TYPE_LABELS } from '@/lib/constants';

interface AlertTimelineProps {
  alerts: Alert[];
}

/**
 * 하단 알림 타임라인
 * 최근 알림을 수평 스크롤 티커로 표시
 * 자동 스크롤 및 호버 시 일시정지 기능
 */
export function AlertTimeline({ alerts }: AlertTimelineProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const prevAlertCountRef = useRef(alerts.length);

  // 신규 알림 하이라이트 효과
  useEffect(() => {
    if (alerts.length > prevAlertCountRef.current && alerts.length > 0) {
      const newAlertId = alerts[0].id;
      setHighlightId(newAlertId);
      const timer = setTimeout(() => setHighlightId(null), 2000);
      return () => clearTimeout(timer);
    }
    prevAlertCountRef.current = alerts.length;
  }, [alerts]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const content = contentRef.current;
    if (!container || !content || alerts.length === 0) return;

    let animationId: number;
    let isHovered = false;
    let scrollPosition = 0;

    const animate = () => {
      if (!isHovered) {
        scrollPosition += 0.5; // 스크롤 속도
        container.scrollLeft = scrollPosition;

        // 끝에 도달했을 때 처음으로
        if (scrollPosition > content.scrollWidth - container.clientWidth) {
          scrollPosition = 0;
        }
      }
      animationId = requestAnimationFrame(animate);
    };

    const onMouseEnter = () => {
      isHovered = true;
    };

    const onMouseLeave = () => {
      isHovered = false;
    };

    animationId = requestAnimationFrame(animate);
    container.addEventListener('mouseenter', onMouseEnter);
    container.addEventListener('mouseleave', onMouseLeave);

    return () => {
      cancelAnimationFrame(animationId);
      container.removeEventListener('mouseenter', onMouseEnter);
      container.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [alerts.length]);

  // 심각도별 색상
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-kwatch-status-critical/20 text-kwatch-status-critical';
      case 'WARNING':
        return 'bg-kwatch-status-warning/20 text-kwatch-status-warning';
      default:
        return 'bg-kwatch-status-checking/20 text-kwatch-status-checking';
    }
  };

  const renderAlertItem = (alert: Alert, keyPrefix = '') => (
    <div
      key={`${keyPrefix}${alert.id}`}
      className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded transition-all duration-500 text-xs ${getSeverityColor(alert.severity)} ${
        highlightId === alert.id ? 'ring-1 ring-white/50 brightness-150' : ''
      }`}
    >
      <span className="font-mono">{formatTime(alert.createdAt)}</span>
      <span>{ALERT_TYPE_ICONS[alert.alertType]}</span>
      <span className="font-semibold">{alert.websiteName || '알 수 없음'}</span>
      <span className="text-kwatch-text-secondary">{ALERT_TYPE_LABELS[alert.alertType]}</span>
    </div>
  );

  return (
    <div className="bg-kwatch-bg-secondary">
      <div
        ref={scrollContainerRef}
        className="overflow-x-auto overflow-y-hidden"
        style={{ scrollBehavior: 'auto' }}
      >
        <div ref={contentRef} className="flex gap-3 px-4 py-1.5 whitespace-nowrap items-center">
          {alerts.length > 0 ? (
            <>
              {alerts.map((alert) => renderAlertItem(alert))}
              {alerts.length > 3 &&
                alerts.map((alert) => renderAlertItem(alert, 'repeat-'))}
            </>
          ) : (
            <div className="flex items-center justify-center w-full text-kwatch-text-muted">
              <span className="text-xs">알림 없음</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
