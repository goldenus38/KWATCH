'use client';

import { useEffect, useState } from 'react';
import {
  ComposedChart,
  Area,
  Line,
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

interface DetectionDetails {
  pixelScore: number;
  structuralScore: number;
  criticalElementsScore: number;
  hybridScore: number;
  newDomains: string[];
  removedDomains: string[];
  structuralMatch: boolean;
  weights: { pixel: number; structural: number; critical: number };
}

interface DefacementCheckData {
  id: string;
  baselineId: number;
  currentScreenshotId: string;
  similarityScore: number | null;
  isDefaced: boolean;
  diffImagePath: string | null;
  checkedAt: string;
  structuralScore: number | null;
  criticalElementsScore: number | null;
  htmlSimilarityScore: number | null;
  detectionDetails: DetectionDetails | null;
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
 * 점수 프로그레스 바 컴포넌트
 */
function ScoreBar({ label, score, weight }: { label: string; score: number; weight?: number }) {
  const color = score >= 85 ? 'bg-kwatch-status-normal' : score >= 60 ? 'bg-kwatch-status-warning' : 'bg-kwatch-status-critical';
  const textColor = score >= 85 ? 'text-kwatch-status-normal' : score >= 60 ? 'text-kwatch-status-warning' : 'text-kwatch-status-critical';

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-dashboard-sm">
        <span className="text-kwatch-text-secondary">
          {label}
          {weight != null && (
            <span className="text-kwatch-text-muted ml-1">({(weight * 100).toFixed(0)}%)</span>
          )}
        </span>
        <span className={`font-semibold ${textColor}`}>{score.toFixed(1)}%</span>
      </div>
      <div className="w-full h-2 bg-kwatch-bg-tertiary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
    </div>
  );
}

/**
 * 웹사이트 상세 정보 팝업/모달
 * 전체 스크린샷, 웹사이트 정보, 상태 이력 그래프, 위변조 탐지 분석
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
      } else if (historyRes.status === 'rejected') {
        console.error('[DetailPopup] Failed to fetch monitoring history:', historyRes.reason);
      }

      if (defacementRes.status === 'fulfilled' && defacementRes.value.success && defacementRes.value.data) {
        setLatestDefacement(defacementRes.value.data);
      } else if (defacementRes.status === 'rejected') {
        console.error('[DetailPopup] Failed to fetch defacement data:', defacementRes.reason);
      }

      if (alertsRes.status === 'fulfilled' && alertsRes.value.success && alertsRes.value.data) {
        setRecentAlerts(alertsRes.value.data);
      } else if (alertsRes.status === 'rejected') {
        console.error('[DetailPopup] Failed to fetch alerts:', alertsRes.reason);
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
      statusCode: r.statusCode,
      isUp: r.isUp,
      errorMessage: r.errorMessage,
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
            {siteStatus?.organizationName ? `${siteStatus.organizationName} ${websiteName}` : websiteName}
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
                      {siteStatus?.url ? (
                        <a
                          href={siteStatus.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-kwatch-accent hover:text-kwatch-accent-hover hover:underline"
                        >
                          {siteStatus.url}
                        </a>
                      ) : '-'}
                    </div>
                    {siteStatus?.finalUrl && siteStatus.finalUrl !== siteStatus.url && (
                      <div className="mt-1 text-dashboard-sm text-kwatch-text-secondary font-mono break-all">
                        <span className="text-kwatch-text-muted mr-1">↳ 최종 URL:</span>
                        <a
                          href={siteStatus.finalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-kwatch-accent hover:text-kwatch-accent-hover hover:underline"
                        >
                          {siteStatus.finalUrl}
                        </a>
                      </div>
                    )}
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
                            위변조 감지 (유사도: {siteStatus.defacementStatus.htmlSimilarityScore != null || siteStatus.defacementStatus.similarityScore != null ? Number(siteStatus.defacementStatus.htmlSimilarityScore ?? siteStatus.defacementStatus.similarityScore).toFixed(1) : '-'}%)
                            {siteStatus.defacementStatus.detectionMethod === 'hybrid' && (
                              <span className="ml-1 px-1.5 py-0.5 bg-kwatch-accent/20 text-kwatch-accent rounded text-xs font-normal">하이브리드</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-kwatch-status-normal">
                            정상 (유사도: {siteStatus.defacementStatus.htmlSimilarityScore != null || siteStatus.defacementStatus.similarityScore != null ? Number(siteStatus.defacementStatus.htmlSimilarityScore ?? siteStatus.defacementStatus.similarityScore).toFixed(1) : '-'}%)
                            {siteStatus.defacementStatus.detectionMethod === 'hybrid' && (
                              <span className="ml-1 px-1.5 py-0.5 bg-kwatch-accent/20 text-kwatch-accent rounded text-xs font-normal">하이브리드</span>
                            )}
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

              {/* 3. 응답 추이 그래프 */}
              <section>
                <h3 className="text-dashboard-base font-bold text-kwatch-text-primary mb-3">
                  최근 응답 추이
                </h3>
                <div className="bg-kwatch-bg-tertiary/30 rounded p-4 h-64">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData}>
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
                          yAxisId="responseTime"
                          stroke="#94A3B8"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v: number) => `${v}ms`}
                        />
                        <YAxis
                          yAxisId="statusCode"
                          orientation="right"
                          stroke="#64748B"
                          tick={{ fontSize: 11 }}
                          domain={[0, 600]}
                          ticks={[200, 301, 403, 500]}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1E293B',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            color: '#F1F5F9',
                            fontSize: '12px',
                          }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const data = payload[0]?.payload;
                            const statusCode = data?.statusCode;
                            const statusColor = !statusCode ? '#FF1744'
                              : statusCode < 300 ? '#00C853'
                              : statusCode < 400 ? '#42A5F5'
                              : '#FF1744';
                            return (
                              <div className="bg-kwatch-bg-secondary border border-kwatch-bg-tertiary rounded-lg px-3 py-2">
                                <div className="text-kwatch-text-secondary text-xs mb-1">{label}</div>
                                <div className="text-kwatch-text-primary text-sm">
                                  응답 시간: <span className="font-semibold text-kwatch-accent">{data?.responseTime}ms</span>
                                </div>
                                <div className="text-sm" style={{ color: statusColor }}>
                                  HTTP: <span className="font-semibold">{statusCode ?? 'ERR'}</span>
                                  {data?.errorMessage && !statusCode && (
                                    <span className="text-xs text-kwatch-text-muted ml-1">({data.errorMessage})</span>
                                  )}
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Area
                          yAxisId="responseTime"
                          type="monotone"
                          dataKey="responseTime"
                          stroke="#3B82F6"
                          fill="url(#responseTimeGrad)"
                          strokeWidth={2}
                          name="응답 시간"
                        />
                        <Line
                          yAxisId="statusCode"
                          type="stepAfter"
                          dataKey="statusCode"
                          stroke="#64748B"
                          strokeWidth={1.5}
                          dot={({ cx, cy, payload }: any) => {
                            if (!payload?.statusCode) {
                              return <circle cx={cx} cy={cy || 0} r={3} fill="#FF1744" stroke="none" />;
                            }
                            const color = payload.statusCode < 300 ? '#00C853'
                              : payload.statusCode < 400 ? '#42A5F5'
                              : '#FF1744';
                            return <circle cx={cx} cy={cy} r={3} fill={color} stroke="none" />;
                          }}
                          name="HTTP 상태"
                          connectNulls={false}
                        />
                      </ComposedChart>
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

              {/* 5. 위변조 탐지 분석 */}
              <section>
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-dashboard-base font-bold text-kwatch-text-primary">
                    위변조 탐지 분석
                  </h3>
                  {latestDefacement && (
                    <>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        latestDefacement.htmlSimilarityScore != null
                          ? 'bg-kwatch-accent/20 text-kwatch-accent'
                          : 'bg-kwatch-bg-tertiary text-kwatch-text-secondary'
                      }`}>
                        {latestDefacement.htmlSimilarityScore != null ? '하이브리드' : '픽셀 전용'}
                      </span>
                      <span className="text-dashboard-sm font-normal text-kwatch-text-secondary">
                        종합 유사도: {latestDefacement.htmlSimilarityScore != null || latestDefacement.similarityScore != null
                          ? `${Number(latestDefacement.htmlSimilarityScore ?? latestDefacement.similarityScore).toFixed(1)}%`
                          : '-'}
                      </span>
                    </>
                  )}
                </div>

                {latestDefacement ? (
                  <div className="space-y-4">
                    {/* 점수 바 */}
                    <div className="bg-kwatch-bg-tertiary/30 rounded p-4 space-y-3">
                      {latestDefacement.detectionDetails ? (
                        <>
                          <ScoreBar
                            label="픽셀 비교"
                            score={latestDefacement.detectionDetails.pixelScore}
                            weight={latestDefacement.detectionDetails.weights.pixel}
                          />
                          <ScoreBar
                            label="HTML 구조 분석"
                            score={latestDefacement.detectionDetails.structuralScore}
                            weight={latestDefacement.detectionDetails.weights.structural}
                          />
                          <ScoreBar
                            label="외부 도메인 감사"
                            score={latestDefacement.detectionDetails.criticalElementsScore}
                            weight={latestDefacement.detectionDetails.weights.critical}
                          />
                        </>
                      ) : (
                        <ScoreBar
                          label="픽셀 유사도"
                          score={Number(latestDefacement.similarityScore ?? 0)}
                        />
                      )}
                    </div>

                    {/* 새 외부 도메인 경고 */}
                    {latestDefacement.detectionDetails?.newDomains && latestDefacement.detectionDetails.newDomains.length > 0 && (
                      <div className="bg-kwatch-status-critical/10 border border-kwatch-status-critical/30 rounded p-3">
                        <div className="text-dashboard-sm font-semibold text-kwatch-status-critical mb-1">
                          새 외부 도메인 감지
                        </div>
                        <ul className="text-dashboard-sm text-kwatch-text-primary space-y-0.5">
                          {latestDefacement.detectionDetails.newDomains.map((domain) => (
                            <li key={domain} className="font-mono">{domain}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* 제거된 외부 도메인 경고 */}
                    {latestDefacement.detectionDetails?.removedDomains && latestDefacement.detectionDetails.removedDomains.length > 0 && (
                      <div className="bg-kwatch-status-warning/10 border border-kwatch-status-warning/30 rounded p-3">
                        <div className="text-dashboard-sm font-semibold text-kwatch-status-warning mb-1">
                          제거된 외부 도메인
                        </div>
                        <ul className="text-dashboard-sm text-kwatch-text-primary space-y-0.5">
                          {latestDefacement.detectionDetails.removedDomains.map((domain) => (
                            <li key={domain} className="font-mono">{domain}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* 이미지 비교 그리드 (3컬럼: 베이스라인 | 현재 | 차이분석) */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-kwatch-bg-tertiary/30 rounded overflow-hidden">
                        <div className="px-3 py-2 text-dashboard-sm text-kwatch-text-secondary border-b border-kwatch-bg-tertiary">
                          베이스라인 스크린샷
                        </div>
                        <div className="h-48 bg-black flex items-center justify-center">
                          {baselineScreenshotUrl ? (
                            <img
                              src={baselineScreenshotUrl}
                              alt={`${websiteName} 베이스라인 스크린샷`}
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
                          현재 스크린샷
                        </div>
                        <div className="h-48 bg-black flex items-center justify-center">
                          {latestDefacement?.currentScreenshotId ? (
                            <img
                              src={`${API_BASE_URL}/api/screenshots/image/${latestDefacement.currentScreenshotId}`}
                              alt={`${websiteName} 현재 스크린샷`}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <span className="text-kwatch-text-muted text-sm">
                              현재 스크린샷 없음
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
                              alt={`${websiteName} 차이 분석`}
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
                  </div>
                ) : (
                  <div className="text-center py-8 text-kwatch-text-muted bg-kwatch-bg-tertiary/30 rounded">
                    위변조 검사 데이터가 없습니다
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
