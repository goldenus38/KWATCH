'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { api } from '@/lib/api';
import { API_BASE_URL } from '@/lib/constants';
import { formatDateTime, formatResponseTime, formatTime } from '@/lib/utils';
import type { MonitoringResult, MonitoringStatus, Alert } from '@/types';

interface DefacementCheckData {
  id: string;
  baselineId: number;
  currentScreenshotId: string;
  similarityScore: number | null;
  isDefaced: boolean;
  diffImagePath: string | null;
  checkedAt: string;
  baseline?: {
    screenshotId: string;
  };
}

interface DetailPopupProps {
  websiteId: number | null;
  websiteName?: string;
  siteStatus?: MonitoringStatus;
  onClose: () => void;
}

/**
 * 웹사이트 상세 정보 팝업/모달
 * 전체 스크린샷, 웹사이트 정보, 상태 이력 그래프, 베이스라인 비교
 */
export function DetailPopup({
  websiteId,
  websiteName = 'Loading...',
  siteStatus,
  onClose,
}: DetailPopupProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [monitoringHistory, setMonitoringHistory] = useState<MonitoringResult[]>([]);
  const [latestDefacement, setLatestDefacement] = useState<DefacementCheckData | null>(null);
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    if (!websiteId) return;

    const fetchDetails = async () => {
      setIsLoading(true);

      const results = await Promise.allSettled([
        api.get<MonitoringResult[]>(`/api/monitoring/${websiteId}?limit=48`),
        api.get<DefacementCheckData>(`/api/defacement/${websiteId}/latest`),
        api.get<Alert[]>(`/api/alerts?websiteId=${websiteId}&limit=10`),
      ]);

      const [historyRes, defacementRes, alertsRes] = results;

      if (historyRes.status === 'fulfilled' && historyRes.value.success && historyRes.value.data) {
        setMonitoringHistory(historyRes.value.data);
      }

      if (defacementRes.status === 'fulfilled' && defacementRes.value.success && defacementRes.value.data) {
        setLatestDefacement(defacementRes.value.data);
      }

      if (alertsRes.status === 'fulfilled' && alertsRes.value.success && alertsRes.value.data) {
        setRecentAlerts(alertsRes.value.data);
      }

      setIsLoading(false);
    };

    fetchDetails();
  }, [websiteId]);

  if (!websiteId) return null;

  // 차트 데이터 (최신 → 오래된 순을 뒤집어서 시간순 정렬)
  const chartData = [...monitoringHistory]
    .reverse()
    .map((r) => ({
      time: formatTime(r.checkedAt),
      responseTime: r.responseTimeMs ?? 0,
      isUp: r.isUp,
    }));

  // 스크린샷 URL
  const screenshotUrl = siteStatus?.screenshotUrl
    ? `${API_BASE_URL}${siteStatus.screenshotUrl}`
    : null;

  // 베이스라인 스크린샷 URL
  const baselineScreenshotUrl = latestDefacement?.baseline?.screenshotId
    ? `${API_BASE_URL}/api/screenshots/image/${latestDefacement.baseline.screenshotId}`
    : null;

  // Diff 이미지 URL
  const diffImageUrl = latestDefacement?.id
    ? `${API_BASE_URL}/api/defacement/diff/${latestDefacement.id}`
    : null;

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-kwatch-bg-secondary rounded-lg w-11/12 h-5/6 max-w-6xl overflow-hidden flex flex-col animate-slide-up">
        {/* 헤더 */}
        <div className="bg-kwatch-bg-tertiary border-b border-kwatch-bg-tertiary px-6 py-4 flex items-center justify-between">
          <h2 className="text-dashboard-lg font-bold text-kwatch-text-primary">
            {websiteName}
          </h2>
          <button
            onClick={onClose}
            className="text-2xl text-kwatch-text-secondary hover:text-kwatch-text-primary transition-colors"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* 컨텐츠 */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            /* 로딩 스켈레톤 */
            <div className="p-6 space-y-6">
              <div className="space-y-3">
                <div className="h-6 bg-kwatch-bg-tertiary rounded w-1/4 animate-pulse" />
                <div className="w-full h-96 bg-kwatch-bg-tertiary rounded animate-pulse" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-4 bg-kwatch-bg-tertiary rounded w-1/3 animate-pulse" />
                    <div className="h-5 bg-kwatch-bg-tertiary rounded animate-pulse" />
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <div className="h-6 bg-kwatch-bg-tertiary rounded w-1/4 animate-pulse" />
                <div className="h-48 bg-kwatch-bg-tertiary rounded animate-pulse" />
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-8">
              {/* 1. 현재 스크린샷 */}
              <section>
                <h3 className="text-dashboard-base font-bold text-kwatch-text-primary mb-3">
                  현재 스크린샷
                </h3>
                <div className="bg-black rounded-lg overflow-hidden w-full h-96">
                  {screenshotUrl ? (
                    <img
                      src={screenshotUrl}
                      alt={websiteName}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-kwatch-text-muted">
                      스크린샷이 없습니다
                    </div>
                  )}
                </div>
              </section>

              {/* 2. 웹사이트 정보 */}
              <section>
                <h3 className="text-dashboard-base font-bold text-kwatch-text-primary mb-3">
                  웹사이트 정보
                </h3>
                <div className="grid grid-cols-3 gap-4 bg-kwatch-bg-tertiary/30 rounded p-4">
                  <div className="col-span-3">
                    <div className="text-dashboard-sm text-kwatch-text-secondary">
                      URL
                    </div>
                    <div className="text-dashboard-base text-kwatch-text-primary font-mono break-all">
                      {siteStatus?.url ?? '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-dashboard-sm text-kwatch-text-secondary">
                      HTTP 상태
                    </div>
                    <div className="text-dashboard-base font-semibold">
                      {siteStatus?.isUp ? (
                        <span className="text-kwatch-status-normal">
                          정상 {siteStatus?.statusCode ? `(${siteStatus.statusCode})` : ''}
                        </span>
                      ) : (
                        <span className="text-kwatch-status-critical">
                          {siteStatus?.errorMessage ?? '장애'} {siteStatus?.statusCode ? `(${siteStatus.statusCode})` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-dashboard-sm text-kwatch-text-secondary">
                      위변조 상태
                    </div>
                    <div className="text-dashboard-base font-semibold">
                      {siteStatus?.defacementStatus ? (
                        siteStatus.defacementStatus.isDefaced ? (
                          <span className="text-kwatch-status-critical">
                            위변조 감지 (유사도: {siteStatus.defacementStatus.similarityScore?.toFixed(1) ?? '-'}%)
                          </span>
                        ) : (
                          <span className="text-kwatch-status-normal">
                            정상 (유사도: {siteStatus.defacementStatus.similarityScore?.toFixed(1) ?? '-'}%)
                          </span>
                        )
                      ) : (
                        <span className="text-kwatch-text-muted">미검사</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-dashboard-sm text-kwatch-text-secondary">
                      마지막 점검
                    </div>
                    <div className="text-dashboard-base text-kwatch-text-primary font-mono">
                      {siteStatus?.checkedAt ? formatDateTime(siteStatus.checkedAt) : '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-dashboard-sm text-kwatch-text-secondary">
                      응답 시간
                    </div>
                    <div className="text-dashboard-base text-kwatch-text-primary font-mono">
                      {formatResponseTime(siteStatus?.responseTimeMs ?? null)}
                    </div>
                  </div>
                </div>
              </section>

              {/* 3. 응답 시간 그래프 */}
              <section>
                <h3 className="text-dashboard-base font-bold text-kwatch-text-primary mb-3">
                  최근 응답 시간 추이
                </h3>
                <div className="bg-kwatch-bg-tertiary/30 rounded p-4 h-56">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="responseTimeGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis
                          dataKey="time"
                          stroke="#94A3B8"
                          tick={{ fontSize: 11 }}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          stroke="#94A3B8"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v: number) => `${v}ms`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1E293B',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            color: '#F1F5F9',
                          }}
                          formatter={(value: number) => [`${value}ms`, '응답 시간']}
                        />
                        <Area
                          type="monotone"
                          dataKey="responseTime"
                          stroke="#3B82F6"
                          fill="url(#responseTimeGrad)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-kwatch-text-muted">
                      <div className="text-center">
                        <div className="text-dashboard-sm">이력 데이터가 없습니다</div>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* 4. 최근 알림 */}
              <section>
                <h3 className="text-dashboard-base font-bold text-kwatch-text-primary mb-3">
                  최근 알림 (10개)
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {recentAlerts.length > 0 ? (
                    recentAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="flex items-center gap-3 bg-kwatch-bg-tertiary/20 rounded px-4 py-3 text-dashboard-sm"
                      >
                        <span className="text-kwatch-text-secondary flex-1">
                          {formatDateTime(alert.createdAt)}
                        </span>
                        <span className="font-semibold text-kwatch-text-primary">
                          {alert.message}
                        </span>
                        {!alert.isAcknowledged && (
                          <span className="px-2 py-1 bg-kwatch-status-critical/20 text-kwatch-status-critical rounded text-xs">
                            미확인
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-kwatch-text-muted">
                      알림이 없습니다
                    </div>
                  )}
                </div>
              </section>

              {/* 5. 베이스라인 비교 */}
              <section>
                <h3 className="text-dashboard-base font-bold text-kwatch-text-primary mb-3">
                  베이스라인 비교
                  {latestDefacement && (
                    <span className="ml-3 text-dashboard-sm font-normal text-kwatch-text-secondary">
                      유사도: {latestDefacement.similarityScore != null
                        ? `${latestDefacement.similarityScore}%`
                        : '-'}
                    </span>
                  )}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-kwatch-bg-tertiary/30 rounded overflow-hidden">
                    <div className="px-3 py-2 text-dashboard-sm text-kwatch-text-secondary border-b border-kwatch-bg-tertiary">
                      베이스라인 스크린샷
                    </div>
                    <div className="h-48 bg-black flex items-center justify-center">
                      {baselineScreenshotUrl ? (
                        <img
                          src={baselineScreenshotUrl}
                          alt="베이스라인"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-kwatch-text-muted text-sm">
                          베이스라인 없음
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="bg-kwatch-bg-tertiary/30 rounded overflow-hidden">
                    <div className="px-3 py-2 text-dashboard-sm text-kwatch-text-secondary border-b border-kwatch-bg-tertiary">
                      차이 분석
                    </div>
                    <div className="h-48 bg-black flex items-center justify-center">
                      {diffImageUrl && latestDefacement?.diffImagePath ? (
                        <img
                          src={diffImageUrl}
                          alt="차이 분석"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-kwatch-text-muted text-sm">
                          차이 데이터 없음
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
