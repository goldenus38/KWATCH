'use client';

import { useEffect, useState } from 'react';
import { MonitoringResult, Screenshot, Alert } from '@/types';
import { formatDateTime, formatResponseTime, cn } from '@/lib/utils';

interface DetailPopupProps {
  websiteId: number | null;
  websiteName?: string;
  onClose: () => void;
}

/**
 * 웹사이트 상세 정보 팝업/모달
 * 전체 스크린샷, 웹사이트 정보, 상태 이력 등을 표시
 * TODO: API 데이터 페칭 구현 필요
 */
export function DetailPopup({
  websiteId,
  websiteName = 'Loading...',
  onClose,
}: DetailPopupProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [monitoringHistory, setMonitoringHistory] = useState<MonitoringResult[]>(
    [],
  );
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    if (!websiteId) return;

    // TODO: 다음 API 엔드포인트에서 데이터 페칭 필요:
    // GET /api/monitoring/:websiteId?limit=24 (지난 24시간 이력)
    // GET /api/screenshots/:websiteId?limit=3
    // GET /api/alerts?websiteId=:websiteId&limit=10

    // 임시 시뮬레이션
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, [websiteId]);

  if (!websiteId) return null;

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
              {/* 스크린샷 스켈레톤 */}
              <div className="space-y-3">
                <div className="h-6 bg-kwatch-bg-tertiary rounded w-1/4 animate-pulse" />
                <div className="w-full h-96 bg-kwatch-bg-tertiary rounded animate-pulse" />
              </div>

              {/* 정보 스켈레톤 */}
              <div className="grid grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-4 bg-kwatch-bg-tertiary rounded w-1/3 animate-pulse" />
                    <div className="h-5 bg-kwatch-bg-tertiary rounded animate-pulse" />
                  </div>
                ))}
              </div>

              {/* 이력 스켈레톤 */}
              <div className="space-y-3">
                <div className="h-6 bg-kwatch-bg-tertiary rounded w-1/4 animate-pulse" />
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-kwatch-bg-tertiary rounded animate-pulse" />
                ))}
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
                  {screenshots.length > 0 ? (
                    <img
                      src={screenshots[0].fullUrl}
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
                <div className="grid grid-cols-2 gap-4 bg-kwatch-bg-tertiary/30 rounded p-4">
                  <div>
                    <div className="text-dashboard-sm text-kwatch-text-secondary">
                      URL
                    </div>
                    <div className="text-dashboard-base text-kwatch-text-primary font-mono break-all">
                      {/* TODO: URL 데이터 바인딩 */}
                      example.go.kr
                    </div>
                  </div>
                  <div>
                    <div className="text-dashboard-sm text-kwatch-text-secondary">
                      카테고리
                    </div>
                    <div className="text-dashboard-base text-kwatch-text-primary">
                      {/* TODO: 카테고리 데이터 바인딩 */}
                      정부 기관
                    </div>
                  </div>
                  <div>
                    <div className="text-dashboard-sm text-kwatch-text-secondary">
                      마지막 점검
                    </div>
                    <div className="text-dashboard-base text-kwatch-text-primary font-mono">
                      {/* TODO: 마지막 점검 시간 바인딩 */}
                      14:32:45
                    </div>
                  </div>
                  <div>
                    <div className="text-dashboard-sm text-kwatch-text-secondary">
                      응답 시간
                    </div>
                    <div className="text-dashboard-base text-kwatch-text-primary font-mono">
                      {/* TODO: 응답 시간 데이터 바인딩 */}
                      145ms
                    </div>
                  </div>
                </div>
              </section>

              {/* 3. 상태 이력 그래프 */}
              <section>
                <h3 className="text-dashboard-base font-bold text-kwatch-text-primary mb-3">
                  최근 24시간 응답 시간
                </h3>
                <div className="bg-kwatch-bg-tertiary/30 rounded p-6 h-48 flex items-center justify-center text-kwatch-text-muted">
                  {/* TODO: Recharts 또는 ECharts로 차트 구현 */}
                  <div className="text-center">
                    <div className="text-lg mb-2">📊</div>
                    <div className="text-dashboard-sm">차트 데이터 로드 중...</div>
                  </div>
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

              {/* 5. 베이스라인 비교 (선택사항) */}
              <section>
                <h3 className="text-dashboard-base font-bold text-kwatch-text-primary mb-3">
                  베이스라인 비교
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-kwatch-bg-tertiary/30 rounded overflow-hidden">
                    <div className="h-32 bg-black flex items-center justify-center text-kwatch-text-muted text-sm">
                      {/* TODO: 베이스라인 스크린샷 */}
                      베이스라인 스크린샷
                    </div>
                  </div>
                  <div className="bg-kwatch-bg-tertiary/30 rounded overflow-hidden">
                    <div className="h-32 bg-black flex items-center justify-center text-kwatch-text-muted text-sm">
                      {/* TODO: 차이 이미지 */}
                      차이 분석
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
