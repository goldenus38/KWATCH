'use client';

import { useState, useEffect, useCallback } from 'react';
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
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * 모니터링 데이터 구독 훅
 * API에서 초기 데이터를 가져오고, WebSocket으로 실시간 업데이트 수신
 */
export function useMonitoringData(
  filter?: DashboardFilter,
): UseMonitoringDataReturn {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [statuses, setStatuses] = useState<MonitoringStatus[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 초기 데이터 로딩
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [summaryRes, statusesRes, alertsRes] = await Promise.all([
        api.get<DashboardSummary>('/api/monitoring/status'),
        api.get<MonitoringStatus[]>('/api/monitoring/statuses'),
        api.get<Alert[]>('/api/alerts?limit=20'),
      ]);

      if (summaryRes.success && summaryRes.data) {
        setSummary(summaryRes.data);
      }

      if (statusesRes.success && statusesRes.data) {
        setStatuses(statusesRes.data);
      }

      if (alertsRes.success && alertsRes.data) {
        setRecentAlerts(alertsRes.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '데이터 로딩 실패');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // WebSocket 이벤트 수신
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleStatusUpdate = (data: WsStatusUpdate) => {
      setStatuses((prev) =>
        prev.map((s) =>
          s.websiteId === data.websiteId ? data.status : s,
        ),
      );
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
        return updated;
      });
    };

    const handleAlertNew = (data: WsAlertNew) => {
      setRecentAlerts((prev) => [data.alert, ...prev.slice(0, 19)]);
    };

    const handleDefacementDetected = (data: WsDefacementDetected) => {
      setStatuses((prev) =>
        prev.map((s) =>
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
        ),
      );
    };

    const handleScreenshotUpdated = (data: WsScreenshotUpdated) => {
      setStatuses((prev) =>
        prev.map((s) =>
          s.websiteId === data.websiteId
            ? { ...s, screenshotUrl: data.screenshotUrl }
            : s,
        ),
      );
    };

    socket.on('status:update', handleStatusUpdate);
    socket.on('status:bulk', handleStatusBulk);
    socket.on('alert:new', handleAlertNew);
    socket.on('defacement:detected', handleDefacementDetected);
    socket.on('screenshot:updated', handleScreenshotUpdated);

    return () => {
      socket.off('status:update', handleStatusUpdate);
      socket.off('status:bulk', handleStatusBulk);
      socket.off('alert:new', handleAlertNew);
      socket.off('defacement:detected', handleDefacementDetected);
      socket.off('screenshot:updated', handleScreenshotUpdated);
    };
  }, []);

  // 초기 데이터 로딩
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    summary,
    statuses,
    recentAlerts,
    isLoading,
    error,
    refetch: fetchData,
  };
}
