'use client';

import Link from 'next/link';
import { DashboardSummary } from '@/types';
import { formatTime } from '@/lib/utils';
import { STATUS_COLORS } from '@/lib/constants';

interface SummaryBarProps {
  summary: DashboardSummary | null;
  isConnected: boolean;
  isLoading?: boolean;
  isRotating?: boolean;
  onToggleRotation?: () => void;
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
}: SummaryBarProps) {
  return (
    <div className="w-full bg-kwatch-bg-secondary border-b border-kwatch-bg-tertiary px-6 py-4">
      <div className="flex items-center justify-between">
        {/* 왼쪽: 로고 및 타이틀 */}
        <div className="flex items-center gap-3">
          <div className="text-2xl font-bold text-kwatch-text-primary">
            KWATCH
          </div>
          <div className="text-dashboard-base text-kwatch-text-secondary">
            웹사이트 관제 대시보드
          </div>
        </div>

        {/* 중앙: 통계 */}
        {isLoading ? (
          <div className="flex items-center gap-8">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-kwatch-bg-tertiary animate-pulse" />
                <div className="w-8 h-5 bg-kwatch-bg-tertiary rounded animate-pulse" />
                <div className="w-6 h-4 bg-kwatch-bg-tertiary rounded animate-pulse" />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <div className="w-16 h-4 bg-kwatch-bg-tertiary rounded animate-pulse" />
              <div className="w-12 h-4 bg-kwatch-bg-tertiary rounded animate-pulse" />
            </div>
          </div>
        ) : summary ? (
          <div className="flex items-center gap-8">
            {/* 전체 */}
            <div className="flex items-center gap-2">
              <span className="text-dashboard-lg font-bold text-kwatch-text-primary">
                {summary.total}
              </span>
              <span className="text-dashboard-sm text-kwatch-text-secondary">
                전체
              </span>
            </div>

            {/* 정상 */}
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: STATUS_COLORS.normal.dot }}
              />
              <span className="text-dashboard-lg font-bold text-kwatch-text-primary">
                {summary.up}
              </span>
              <span className="text-dashboard-sm text-kwatch-text-secondary">
                정상
              </span>
            </div>

            {/* 경고 */}
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: STATUS_COLORS.warning.dot }}
              />
              <span className="text-dashboard-lg font-bold text-kwatch-text-primary">
                {summary.warning}
              </span>
              <span className="text-dashboard-sm text-kwatch-text-secondary">
                경고
              </span>
            </div>

            {/* 장애 */}
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: STATUS_COLORS.critical.dot }}
              />
              <span className="text-dashboard-lg font-bold text-kwatch-text-primary">
                {summary.down}
              </span>
              <span className="text-dashboard-sm text-kwatch-text-secondary">
                장애
              </span>
            </div>

            {/* 위변조 */}
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: STATUS_COLORS.critical.dot }}
              />
              <span className="text-dashboard-lg font-bold text-kwatch-text-primary">
                {summary.defaced}
              </span>
              <span className="text-dashboard-sm text-kwatch-text-secondary">
                위변조
              </span>
            </div>

            {/* 마지막 스캔 시간 */}
            <div className="flex items-center gap-2 text-kwatch-text-secondary text-dashboard-sm">
              <span>마지막 스캔:</span>
              <span className="font-mono">
                {summary.lastScanAt ? formatTime(summary.lastScanAt) : '-'}
              </span>
            </div>
          </div>
        ) : null}

        {/* 오른쪽: 컨트롤 */}
        <div className="flex items-center gap-4">
          {/* 자동 로테이션 토글 */}
          {onToggleRotation && (
            <button
              onClick={onToggleRotation}
              className="text-dashboard-sm text-kwatch-text-secondary hover:text-kwatch-text-primary transition-colors px-2 py-1 rounded hover:bg-kwatch-bg-tertiary"
              title={isRotating ? '자동 전환 일시정지' : '자동 전환 시작'}
            >
              {isRotating ? '⏸' : '▶'}
            </button>
          )}

          {/* 관리 페이지 링크 */}
          <Link
            href="/websites"
            className="text-dashboard-sm text-kwatch-text-secondary hover:text-kwatch-text-primary transition-colors px-2 py-1 rounded hover:bg-kwatch-bg-tertiary"
            title="관리 페이지"
          >
            ⚙
          </Link>

          {/* 연결 상태 */}
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                isConnected ? 'bg-kwatch-status-normal' : 'bg-kwatch-status-unknown'
              } ${isConnected ? 'animate-pulse-slow' : ''}`}
            />
            <span className="text-dashboard-sm text-kwatch-text-secondary">
              {isConnected ? '연결됨' : '연결 끊김'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
