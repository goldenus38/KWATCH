'use client';

import { DashboardSummary } from '@/types';
import { formatTime } from '@/lib/utils';
import { STATUS_COLORS } from '@/lib/constants';

interface SummaryBarProps {
  summary: DashboardSummary | null;
  isConnected: boolean;
}

/**
 * 대시보드 상단 요약 바
 * 전체 상태, 정상/경고/장애/위변조 통계, 마지막 스캔 시간 표시
 */
export function SummaryBar({ summary, isConnected }: SummaryBarProps) {
  return (
    <div className="w-full bg-kwatch-bg-secondary border-b border-kwatch-bg-tertiary px-6 py-4">
      <div className="flex items-center justify-between">
        {/* 왼쪽: 로고 및 타이틀 */}
        <div className="flex items-center gap-3">
          <div className="text-2xl font-bold text-kwatch-text-primary">
            🔒 KWATCH
          </div>
          <div className="text-dashboard-base text-kwatch-text-secondary">
            웹사이트 관제 대시보드
          </div>
        </div>

        {/* 중앙: 통계 */}
        {summary && (
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
        )}

        {/* 오른쪽: 연결 상태 */}
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
  );
}
