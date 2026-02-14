'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type {
  DashboardSummary,
  MonitoringStatus,
  Alert,
  DashboardFilter,
  WsStatusUpdate,
  WsAlertNew,
  WsDefacementDetected,
  WsScreenshotUpdated,
} from '@/types';

interface UseMonitoringDataReturn {
  summary: DashboardSummary | null;
  statuses: MonitoringStatus[];
  recentAlerts: Alert[];
  responseTimeWarningMs: number;
  isLoading: boolean;
  error: string | null;
  sortVersion: number;
  refetch: () => Promise<void>;
}

// 모듈 레벨 캐시 — 페이지 이동 후 돌아와도 즉시 표시
let cachedSummary: DashboardSummary | null = null;
let cachedStatuses: MonitoringStatus[] = [];
let cachedAlerts: Alert[] = [];
let cachedResponseTimeWarningMs = 10000;

/**
 * 모니터링 데이터 구독 훅
 * API에서 초기 데이터를 가져오고, WebSocket으로 실시간 업데이트 수신
 * - 캐시된 데이터가 있으면 즉시 표시 (로딩 스켈레톤 없이)
 * - WebSocket 재연결 시 자동으로 데이터 refetch
 */
export function useMonitoringData(
  filter?: DashboardFilter,
): UseMonitoringDataReturn {
  const hasCached = cachedStatuses.length > 0;
  const [summary, setSummary] = useState<DashboardSummary | null>(cachedSummary);
  const [statuses, setStatuses] = useState<MonitoringStatus[]>(cachedStatuses);
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>(cachedAlerts);
  const [responseTimeWarningMs, setResponseTimeWarningMs] = useState(cachedResponseTimeWarningMs);
  const [isLoading, setIsLoading] = useState(!hasCached);
  const [error, setError] = useState<string | null>(null);
  const [sortVersion, setSortVersion] = useState(0);
  const fetchingRef = useRef(false);

  // 데이터 로딩 (silent=true면 로딩 스켈레톤 없이 백그라운드 갱신)
  const fetchData = useCallback(async (silent = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      if (!silent) {
        setIsLoading(true);
      }
      setError(null);

      const [statusesRes, alertsRes] = await Promise.all([
        api.get<{ statuses: MonitoringStatus[]; summary: DashboardSummary & { responseTimeWarningMs?: number } }>('/api/monitoring/statuses'),
        api.get<Alert[]>('/api/alerts?limit=20'),
      ]);

      if (statusesRes.success && statusesRes.data) {
        const { statuses: newStatuses, summary: newSummary } = statusesRes.data;
        setStatuses(newStatuses);
        cachedStatuses = newStatuses;
        setSummary(newSummary);
        cachedSummary = newSummary;
        if (newSummary.responseTimeWarningMs != null) {
          setResponseTimeWarningMs(newSummary.responseTimeWarningMs);
          cachedResponseTimeWarningMs = newSummary.responseTimeWarningMs;
        }
      }

      if (alertsRes.success && alertsRes.data) {
        setRecentAlerts(alertsRes.data);
        cachedAlerts = alertsRes.data;
      }
      setSortVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : '데이터 로딩 실패');
    } finally {
      setIsLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  // WebSocket 이벤트 수신 + 재연결 시 자동 refetch
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleStatusUpdate = (data: WsStatusUpdate) => {
      setStatuses((prev) => {
        const updated = prev.map((s) =>
          s.websiteId === data.websiteId ? data.status : s,
        );
        cachedStatuses = updated;
        return updated;
      });
    };

    const handleStatusBulk = (data: WsStatusUpdate[]) => {
      setStatuses((prev) => {
        const updated = [...prev];
        data.forEach((item) => {
          const index = updated.findIndex(
            (s) => s.websiteId === item.websiteId,
          );
          if (index >= 0) {
            updated[index] = item.status;
          }
        });
        cachedStatuses = updated;
        return updated;
      });
    };

    const handleAlertNew = (data: WsAlertNew) => {
      setRecentAlerts((prev) => {
        const updated = [data.alert, ...prev.slice(0, 19)];
        cachedAlerts = updated;
        return updated;
      });
    };

    const handleDefacementDetected = (data: WsDefacementDetected) => {
      setStatuses((prev) => {
        const updated = prev.map((s) =>
          s.websiteId === data.websiteId
            ? {
                ...s,
                defacementStatus: {
                  isDefaced: true,
                  similarityScore: data.similarityScore,
                  htmlSimilarityScore: s.defacementStatus?.htmlSimilarityScore ?? null,
                  detectionMethod: s.defacementStatus?.detectionMethod ?? 'pixel_only',
                },
              }
            : s,
        );
        cachedStatuses = updated;
        return updated;
      });
    };

    const handleScreenshotUpdated = (data: WsScreenshotUpdated) => {
      setStatuses((prev) => {
        const updated = prev.map((s) =>
          s.websiteId === data.websiteId
            ? { ...s, screenshotUrl: data.screenshotUrl, thumbnailUrl: data.thumbnailUrl }
            : s,
        );
        cachedStatuses = updated;
        return updated;
      });
    };

    // WebSocket 재연결 시 전체 데이터 refetch (서버 재시작 대응)
    const handleReconnect = () => {
      fetchData(true);
    };

    socket.on('status:update', handleStatusUpdate);
    socket.on('status:bulk', handleStatusBulk);
    socket.on('alert:new', handleAlertNew);
    socket.on('defacement:detected', handleDefacementDetected);
    socket.on('screenshot:updated', handleScreenshotUpdated);
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('status:update', handleStatusUpdate);
      socket.off('status:bulk', handleStatusBulk);
      socket.off('alert:new', handleAlertNew);
      socket.off('defacement:detected', handleDefacementDetected);
      socket.off('screenshot:updated', handleScreenshotUpdated);
      socket.off('connect', handleReconnect);
    };
  }, [fetchData]);

  // 초기 데이터 로딩 (캐시가 있으면 백그라운드로)
  useEffect(() => {
    fetchData(hasCached);
  }, [fetchData, hasCached]);

  return {
    summary,
    statuses,
    recentAlerts,
    responseTimeWarningMs,
    isLoading,
    error,
    sortVersion,
    refetch: () => fetchData(false),
  };
}
