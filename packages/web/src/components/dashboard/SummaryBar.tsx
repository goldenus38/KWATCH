'use client';

import Link from 'next/link';
import { KwatchLogo } from '@/components/common/KwatchLogo';
import { DashboardSummary, SummaryFilterType } from '@/types';
import { formatTime } from '@/lib/utils';
import { STATUS_COLORS } from '@/lib/constants';

interface SummaryBarProps {
  summary: DashboardSummary | null;
  isConnected: boolean;
  isLoading?: boolean;
  isRotating?: boolean;
  onToggleRotation?: () => void;
  activeFilter?: SummaryFilterType;
  onFilterChange?: (filter: SummaryFilterType) => void;
}

/**
 * 대시보드 상단 요약 바
 * 전체 상태, 정상/경고/장애/위변조 통계, 마지막 스캔 시간 표시
 */
export function SummaryBar({
  summary,
  isConnected,
  isLoading = false,
  isRotating = true,
  onToggleRotation,
  activeFilter,
  onFilterChange,
}: SummaryBarProps) {
  const handleFilterClick = (filter: SummaryFilterType) => {
    if (!onFilterChange) return;
    onFilterChange(activeFilter === filter ? null : filter);
  };
  return (
    <div className="w-full bg-kwatch-bg-secondary border-b border-kwatch-bg-tertiary px-6 py-4">
      <div className="flex items-center justify-between">
        {/* 왼쪽: 로고 */}
        <KwatchLogo size="sm" />

        {/* 중앙: 통계 */}
        {isLoading ? (
          <div className="flex items-center gap-8">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-kwatch-bg-tertiary animate-pulse" />
                <div className="w-10 h-7 bg-kwatch-bg-tertiary rounded animate-pulse" />
                <div className="w-8 h-5 bg-kwatch-bg-tertiary rounded animate-pulse" />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <div className="w-20 h-5 bg-kwatch-bg-tertiary rounded animate-pulse" />
              <div className="w-14 h-5 bg-kwatch-bg-tertiary rounded animate-pulse" />
            </div>
          </div>
        ) : summary ? (
          <div className="flex items-center gap-8">
            {/* 전체 */}
            <button
              onClick={() => handleFilterClick(null)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer transition-colors ${
                activeFilter === null || activeFilter === undefined
                  ? 'bg-kwatch-bg-tertiary ring-2 ring-kwatch-accent'
                  : 'hover:bg-kwatch-bg-tertiary'
              }`}
            >
              <span className="text-2xl font-bold text-kwatch-text-primary">
                {summary.total}
              </span>
              <span className="text-sm text-kwatch-text-secondary">
                전체
              </span>
            </button>

            {/* 정상 */}
            <button
              onClick={() => handleFilterClick('up')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer transition-colors ${
                activeFilter === 'up'
                  ? 'bg-kwatch-bg-tertiary ring-2 ring-kwatch-status-normal'
                  : 'hover:bg-kwatch-bg-tertiary'
              }`}
            >
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: STATUS_COLORS.normal.dot }}
              />
              <span className="text-2xl font-bold text-kwatch-text-primary">
                {summary.up}
              </span>
              <span className="text-sm text-kwatch-text-secondary">
                정상
              </span>
            </button>

            {/* 경고 */}
            <button
              onClick={() => handleFilterClick('warning')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer transition-colors ${
                activeFilter === 'warning'
                  ? 'bg-kwatch-bg-tertiary ring-2 ring-kwatch-status-warning'
                  : 'hover:bg-kwatch-bg-tertiary'
              }`}
            >
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: STATUS_COLORS.warning.dot }}
              />
              <span className="text-2xl font-bold text-kwatch-text-primary">
                {summary.warning}
              </span>
              <span className="text-sm text-kwatch-text-secondary">
                경고
              </span>
            </button>

            {/* 장애 */}
            <button
              onClick={() => handleFilterClick('down')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer transition-colors ${
                activeFilter === 'down'
                  ? 'bg-kwatch-bg-tertiary ring-2 ring-kwatch-status-critical'
                  : 'hover:bg-kwatch-bg-tertiary'
              }`}
            >
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: STATUS_COLORS.critical.dot }}
              />
              <span className="text-2xl font-bold text-kwatch-text-primary">
                {summary.down}
              </span>
              <span className="text-sm text-kwatch-text-secondary">
                장애
              </span>
            </button>

            {/* 위변조 */}
            <button
              onClick={() => handleFilterClick('defaced')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer transition-colors ${
                activeFilter === 'defaced'
                  ? 'bg-kwatch-bg-tertiary ring-2 ring-kwatch-status-critical'
                  : 'hover:bg-kwatch-bg-tertiary'
              }`}
            >
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: STATUS_COLORS.critical.dot }}
              />
              <span className="text-2xl font-bold text-kwatch-text-primary">
                {summary.defaced}
              </span>
              <span className="text-sm text-kwatch-text-secondary">
                위변조
              </span>
            </button>

            {/* 마지막 스캔 시간 */}
            <div className="flex items-baseline gap-2 text-kwatch-text-secondary text-sm">
              <span>마지막 스캔:</span>
              <span className="font-mono tabular-nums leading-none">
                {summary.lastScanAt ? formatTime(summary.lastScanAt) : '-'}
              </span>
            </div>
          </div>
        ) : null}

        {/* 오른쪽: 컨트롤 */}
        <div className="flex items-center gap-1">
          {/* 자동 로테이션 토글 */}
          {onToggleRotation && (
            <button
              onClick={onToggleRotation}
              className="p-2 rounded-lg text-kwatch-text-secondary hover:text-kwatch-text-primary hover:bg-kwatch-bg-tertiary transition-colors"
              title={isRotating ? '자동 전환 일시정지' : '자동 전환 시작'}
            >
              {isRotating ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </button>
          )}

          {/* 구분선 */}
          <div className="w-px h-6 bg-kwatch-bg-tertiary mx-1" />

          {/* 관리 페이지 링크 */}
          <Link
            href="/settings"
            className="p-2 rounded-lg text-kwatch-text-secondary hover:text-kwatch-text-primary hover:bg-kwatch-bg-tertiary transition-colors"
            title="설정"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>

          {/* 구분선 */}
          <div className="w-px h-6 bg-kwatch-bg-tertiary mx-1" />

          {/* 연결 상태 */}
          <div className="flex items-center gap-2 px-2">
            <div
              className={`w-3.5 h-3.5 rounded-full ${
                isConnected ? 'bg-kwatch-status-normal' : 'bg-kwatch-status-unknown'
              } ${isConnected ? 'animate-pulse-slow' : ''}`}
            />
            <span className="text-sm text-kwatch-text-secondary">
              {isConnected ? '연결됨' : '연결 끊김'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
