'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
    createdAt: string;
  };
}

interface ActiveBaseline {
  id: number;
  screenshotId: string;
  createdAt: string;
}

interface BaselineHistoryItem {
  id: number;
  screenshotId: string;
  createdAt: string;
  isActive: boolean;
  createdBy: number | null;
}

interface ScreenshotHistoryItem {
  id: string;
  websiteId: number;
  filePath: string;
  fileSize: number | null;
  capturedAt: string;
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
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [localStatus, setLocalStatus] = useState<MonitoringStatus | undefined>(siteStatus);
  const [isScreenshotRefreshing, setIsScreenshotRefreshing] = useState(false);
  const [screenshotElapsed, setScreenshotElapsed] = useState(0);
  const [isBaselineRefreshing, setIsBaselineRefreshing] = useState(false);
  const [baselineElapsed, setBaselineElapsed] = useState(0);
  const [isDefacementRechecking, setIsDefacementRechecking] = useState(false);
  const [defacementElapsed, setDefacementElapsed] = useState(0);
  const [isHttpRefreshing, setIsHttpRefreshing] = useState(false);
  const [httpElapsed, setHttpElapsed] = useState(0);
  const [monitoringHistory, setMonitoringHistory] = useState<MonitoringResult[]>([]);
  const [latestDefacement, setLatestDefacement] = useState<DefacementCheckData | null>(null);
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([]);
  const [activeBaseline, setActiveBaseline] = useState<ActiveBaseline | null>(null);
  const [cacheBuster, setCacheBuster] = useState(0);
  const [defacementHistory, setDefacementHistory] = useState<DefacementCheckData[]>([]);
  const [screenshotHistory, setScreenshotHistory] = useState<ScreenshotHistoryItem[]>([]);
  const [baselineHistory, setBaselineHistory] = useState<BaselineHistoryItem[]>([]);
  const [defacementHistoryPage, setDefacementHistoryPage] = useState(1);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState({
    defacement: false,
    baseline: false,
    screenshot: false,
  });

  // Timer refs for cleanup on unmount
  const screenshotTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const screenshotPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baselineTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const baselinePollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const defacementTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const defacementPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const httpTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const httpPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (screenshotTimerRef.current) clearInterval(screenshotTimerRef.current);
      if (screenshotPollRef.current) clearTimeout(screenshotPollRef.current);
      if (baselineTimerRef.current) clearInterval(baselineTimerRef.current);
      if (baselinePollRef.current) clearTimeout(baselinePollRef.current);
      if (defacementTimerRef.current) clearInterval(defacementTimerRef.current);
      if (defacementPollRef.current) clearTimeout(defacementPollRef.current);
      if (httpTimerRef.current) clearInterval(httpTimerRef.current);
      if (httpPollRef.current) clearTimeout(httpPollRef.current);
    };
  }, []);

  useEffect(() => {
    if (!websiteId) return;

    const fetchDetails = async () => {
      setIsLoading(true);
      setDefacementHistoryPage(1);
      setHistoryExpanded({ defacement: false, baseline: false, screenshot: false });

      const results = await Promise.allSettled([
        api.get<MonitoringResult[]>(`/api/monitoring/${websiteId}?limit=48`),
        api.get<DefacementCheckData>(`/api/defacement/${websiteId}/latest`),
        api.get<Alert[]>(`/api/alerts?websiteId=${websiteId}&limit=10`),
        api.get<MonitoringStatus>(`/api/monitoring/${websiteId}/latest`),
        api.get<ActiveBaseline>(`/api/defacement/${websiteId}/baseline`),
        api.get<DefacementCheckData[]>(`/api/defacement/${websiteId}?limit=20`),
        api.get<ScreenshotHistoryItem[]>(`/api/screenshots/${websiteId}?limit=20`),
        api.get<BaselineHistoryItem[]>(`/api/defacement/${websiteId}/baselines`),
      ]);

      const [historyRes, defacementRes, alertsRes, statusRes, baselineRes, defHistoryRes, scrHistoryRes, blHistoryRes] = results;

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

      if (statusRes.status === 'fulfilled' && statusRes.value.success && statusRes.value.data) {
        setLocalStatus(statusRes.value.data);
      }

      if (baselineRes.status === 'fulfilled' && baselineRes.value.success && baselineRes.value.data) {
        setActiveBaseline(baselineRes.value.data);
      }

      if (defHistoryRes.status === 'fulfilled' && defHistoryRes.value.success && defHistoryRes.value.data) {
        setDefacementHistory(Array.isArray(defHistoryRes.value.data) ? defHistoryRes.value.data : []);
      }

      if (scrHistoryRes.status === 'fulfilled' && scrHistoryRes.value.success && scrHistoryRes.value.data) {
        setScreenshotHistory(Array.isArray(scrHistoryRes.value.data) ? scrHistoryRes.value.data : []);
      }

      if (blHistoryRes.status === 'fulfilled' && blHistoryRes.value.success && blHistoryRes.value.data) {
        setBaselineHistory(Array.isArray(blHistoryRes.value.data) ? blHistoryRes.value.data : []);
      }

      setIsLoading(false);
    };

    fetchDetails();
  }, [websiteId]);

  /**
   * 스크린샷 새로고침 핸들러
   * POST /api/monitoring/:websiteId/refresh → 폴링으로 스크린샷 갱신 감지
   */
  const handleScreenshotRefresh = async () => {
    if (!websiteId || isScreenshotRefreshing) return;
    setIsScreenshotRefreshing(true);
    setScreenshotElapsed(0);

    const prevScreenshotUrl = localStatus?.screenshotUrl || '';

    try {
      await api.post(`/api/monitoring/${websiteId}/refresh`);
    } catch (e) {
      console.error('[DetailPopup] Screenshot refresh failed:', e);
      setIsScreenshotRefreshing(false);
      return;
    }

    // 경과 시간 카운터
    screenshotTimerRef.current = setInterval(() => {
      setScreenshotElapsed((prev) => prev + 1);
    }, 1000);

    let attempts = 0;
    const maxAttempts = 20;

    const poll = async () => {
      attempts++;
      const statusRes = await api.get<MonitoringStatus>(`/api/monitoring/${websiteId}/latest`);
      const newScreenshotUrl = statusRes.success && statusRes.data ? statusRes.data.screenshotUrl : '';

      if (statusRes.success && statusRes.data) {
        setLocalStatus(statusRes.data);
      }

      if (newScreenshotUrl && newScreenshotUrl !== prevScreenshotUrl) {
        if (screenshotTimerRef.current) clearInterval(screenshotTimerRef.current);
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
        setCacheBuster(Date.now());
        setIsScreenshotRefreshing(false);
        setScreenshotElapsed(0);
        return;
      }

      if (attempts < maxAttempts) {
        screenshotPollRef.current = setTimeout(poll, 3000);
      } else {
        if (screenshotTimerRef.current) clearInterval(screenshotTimerRef.current);
        setCacheBuster(Date.now());
        setIsScreenshotRefreshing(false);
        setScreenshotElapsed(0);
      }
    };

    screenshotPollRef.current = setTimeout(poll, 5000);
  };

  /**
   * 베이스라인 교체 핸들러
   * 현재 스크린샷을 새 베이스라인으로 설정 → 위변조 재분석 트리거 → 결과 폴링
   */
  const handleBaselineRefresh = async () => {
    if (!websiteId || isBaselineRefreshing) return;

    // 스크린샷 URL에서 ID 추출 (/api/screenshots/image/:id)
    const screenshotUrlPath = localStatus?.screenshotUrl || '';
    const match = screenshotUrlPath.match(/\/api\/screenshots\/image\/(\d+)/);
    if (!match) {
      console.error('[DetailPopup] Cannot extract screenshot ID from URL:', screenshotUrlPath);
      return;
    }
    const screenshotId = match[1];

    setIsBaselineRefreshing(true);
    setBaselineElapsed(0);

    baselineTimerRef.current = setInterval(() => {
      setBaselineElapsed((prev) => prev + 1);
    }, 1000);

    const prevCheckedAt = latestDefacement?.checkedAt || '';

    try {
      // 1. 베이스라인 갱신
      const baselineRes = await api.post(`/api/defacement/${websiteId}/baseline`, { screenshotId });
      if (!baselineRes.success) {
        console.error('[DetailPopup] Baseline update failed:', baselineRes.error);
        if (baselineTimerRef.current) clearInterval(baselineTimerRef.current);
        setIsBaselineRefreshing(false);
        setBaselineElapsed(0);
        return;
      }

      // 2. 위변조 재분석 트리거 (새 베이스라인 기준으로 재분석)
      const recheckRes = await api.post(`/api/defacement/${websiteId}/recheck`);
      if (!recheckRes.success) {
        console.error('[DetailPopup] Defacement recheck failed:', recheckRes.error);
        // 베이스라인은 갱신됨 — 최신 데이터 반영 후 종료
        const [defRes, monRes, blRes] = await Promise.all([
          api.get<DefacementCheckData>(`/api/defacement/${websiteId}/latest`),
          api.get<MonitoringStatus>(`/api/monitoring/${websiteId}/latest`),
          api.get<ActiveBaseline>(`/api/defacement/${websiteId}/baseline`),
        ]);
        if (defRes.success && defRes.data) setLatestDefacement(defRes.data);
        if (monRes.success && monRes.data) setLocalStatus(monRes.data);
        if (blRes.success && blRes.data) setActiveBaseline(blRes.data);
        if (baselineTimerRef.current) clearInterval(baselineTimerRef.current);
        setCacheBuster(Date.now());
        setIsBaselineRefreshing(false);
        setBaselineElapsed(0);
        return;
      }

      // 3. 폴링: 새 defacement check 결과 대기
      let attempts = 0;
      const maxAttempts = 20;

      const poll = async () => {
        attempts++;
        const defacementRes = await api.get<DefacementCheckData>(`/api/defacement/${websiteId}/latest`);

        if (defacementRes.success && defacementRes.data) {
          if (defacementRes.data.checkedAt && defacementRes.data.checkedAt !== prevCheckedAt) {
            if (baselineTimerRef.current) clearInterval(baselineTimerRef.current);
            setLatestDefacement(defacementRes.data);
            const [monRes, blRes] = await Promise.all([
              api.get<MonitoringStatus>(`/api/monitoring/${websiteId}/latest`),
              api.get<ActiveBaseline>(`/api/defacement/${websiteId}/baseline`),
            ]);
            if (monRes.success && monRes.data) setLocalStatus(monRes.data);
            if (blRes.success && blRes.data) setActiveBaseline(blRes.data);
            setCacheBuster(Date.now());
            setIsBaselineRefreshing(false);
            setBaselineElapsed(0);
            return;
          }
        }

        if (attempts < maxAttempts) {
          baselinePollRef.current = setTimeout(poll, 3000);
        } else {
          // 타임아웃 — 최소한 베이스라인 갱신은 완료됨, 최신 데이터 반영
          if (defacementRes.success && defacementRes.data) {
            setLatestDefacement(defacementRes.data);
          }
          const [monRes, blRes] = await Promise.all([
            api.get<MonitoringStatus>(`/api/monitoring/${websiteId}/latest`),
            api.get<ActiveBaseline>(`/api/defacement/${websiteId}/baseline`),
          ]);
          if (monRes.success && monRes.data) setLocalStatus(monRes.data);
          if (blRes.success && blRes.data) setActiveBaseline(blRes.data);
          if (baselineTimerRef.current) clearInterval(baselineTimerRef.current);
          setCacheBuster(Date.now());
          setIsBaselineRefreshing(false);
          setBaselineElapsed(0);
        }
      };

      baselinePollRef.current = setTimeout(poll, 3000);
    } catch (e) {
      console.error('[DetailPopup] Baseline refresh failed:', e);
      if (baselineTimerRef.current) clearInterval(baselineTimerRef.current);
      setIsBaselineRefreshing(false);
      setBaselineElapsed(0);
    }
  };

  /**
   * 위변조 재분석 핸들러
   * POST /api/defacement/:websiteId/recheck → 폴링으로 결과 갱신 감지
   */
  const handleDefacementRecheck = async () => {
    if (!websiteId || isDefacementRechecking) return;
    setIsDefacementRechecking(true);
    setDefacementElapsed(0);

    const prevCheckedAt = latestDefacement?.checkedAt || '';

    const recheckRes = await api.post(`/api/defacement/${websiteId}/recheck`);
    if (!recheckRes.success) {
      console.error('[DetailPopup] Defacement recheck failed:', recheckRes.error);
      setIsDefacementRechecking(false);
      return;
    }

    defacementTimerRef.current = setInterval(() => {
      setDefacementElapsed((prev) => prev + 1);
    }, 1000);

    let attempts = 0;
    const maxAttempts = 10;

    const poll = async () => {
      attempts++;
      const defacementRes = await api.get<DefacementCheckData>(`/api/defacement/${websiteId}/latest`);

      if (defacementRes.success && defacementRes.data) {
        if (defacementRes.data.checkedAt && defacementRes.data.checkedAt !== prevCheckedAt) {
          if (defacementTimerRef.current) clearInterval(defacementTimerRef.current);
          setLatestDefacement(defacementRes.data);
          setCacheBuster(Date.now());
          setIsDefacementRechecking(false);
          setDefacementElapsed(0);
          return;
        }
      }

      if (attempts < maxAttempts) {
        defacementPollRef.current = setTimeout(poll, 3000);
      } else {
        if (defacementTimerRef.current) clearInterval(defacementTimerRef.current);
        setIsDefacementRechecking(false);
        setDefacementElapsed(0);
      }
    };

    defacementPollRef.current = setTimeout(poll, 3000);
  };

  /**
   * 응답 추이 차트 데이터 새로고침 헬퍼
   */
  const refreshChartData = async () => {
    if (!websiteId) return;
    const historyRes = await api.get<MonitoringResult[]>(`/api/monitoring/${websiteId}?limit=48`);
    if (historyRes.success && historyRes.data) {
      setMonitoringHistory(historyRes.data);
    }
  };

  /**
   * HTTP 상태 새로고침 핸들러
   * POST /api/monitoring/:websiteId/refresh → 폴링으로 상태 갱신 감지
   */
  const handleHttpRefresh = async () => {
    if (!websiteId || isHttpRefreshing) return;
    setIsHttpRefreshing(true);
    setHttpElapsed(0);

    const prevCheckedAt = localStatus?.checkedAt || '';

    try {
      await api.post(`/api/monitoring/${websiteId}/refresh`);
    } catch (e) {
      console.error('[DetailPopup] HTTP refresh failed:', e);
      setIsHttpRefreshing(false);
      return;
    }

    httpTimerRef.current = setInterval(() => {
      setHttpElapsed((prev) => prev + 1);
    }, 1000);

    let attempts = 0;
    const maxAttempts = 10;

    const poll = async () => {
      attempts++;
      const statusRes = await api.get<MonitoringStatus>(`/api/monitoring/${websiteId}/latest`);

      if (statusRes.success && statusRes.data) {
        const newCheckedAt = statusRes.data.checkedAt;
        if (newCheckedAt && String(newCheckedAt) !== String(prevCheckedAt)) {
          if (httpTimerRef.current) clearInterval(httpTimerRef.current);
          setLocalStatus(statusRes.data);
          await refreshChartData();
          setIsHttpRefreshing(false);
          setHttpElapsed(0);
          return;
        }
      }

      if (attempts < maxAttempts) {
        httpPollRef.current = setTimeout(poll, 3000);
      } else {
        if (httpTimerRef.current) clearInterval(httpTimerRef.current);
        if (statusRes.success && statusRes.data) {
          setLocalStatus(statusRes.data);
        }
        await refreshChartData();
        setIsHttpRefreshing(false);
        setHttpElapsed(0);
      }
    };

    httpPollRef.current = setTimeout(poll, 3000);
  };

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

  // 스크린샷 URL (캐시 버스팅 포함)
  const cb = cacheBuster ? `?t=${cacheBuster}` : '';
  const screenshotUrl = localStatus?.screenshotUrl
    ? `${API_BASE_URL}${localStatus.screenshotUrl}${cb}`
    : null;

  // 베이스라인 스크린샷 URL (활성 베이스라인 우선)
  const baselineScreenshotId = activeBaseline?.screenshotId || latestDefacement?.baseline?.screenshotId;
  const baselineScreenshotUrl = baselineScreenshotId
    ? `${API_BASE_URL}/api/screenshots/image/${baselineScreenshotId}${cb}`
    : null;
  const baselineCreatedAt = activeBaseline?.createdAt || latestDefacement?.baseline?.createdAt;

  // Diff 이미지 URL
  const diffImageUrl = latestDefacement?.id
    ? `${API_BASE_URL}/api/defacement/diff/${latestDefacement.id}${cb}`
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
          <div className="flex items-center gap-3">
            <h2 className="text-dashboard-lg font-bold text-kwatch-text-primary">
              {localStatus?.organizationName ? `${localStatus.organizationName} ${websiteName}` : websiteName}
            </h2>
            <button
              onClick={() => { onClose(); router.push(`/websites?search=${encodeURIComponent(localStatus?.organizationName ? `${localStatus.organizationName} ${websiteName}` : websiteName)}`); }}
              className="text-kwatch-text-muted hover:text-kwatch-accent transition-colors"
              title="사이트 관리로 이동"
              aria-label="사이트 관리로 이동"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
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
                <h3 className="text-dashboard-base font-bold text-kwatch-text-primary mb-3 flex items-center gap-2">
                  현재 스크린샷
                  <button
                    onClick={handleScreenshotRefresh}
                    disabled={isScreenshotRefreshing}
                    className={`text-kwatch-text-muted hover:text-kwatch-accent transition-colors ${isScreenshotRefreshing ? 'animate-spin text-kwatch-accent' : ''}`}
                    title="스크린샷 새로고침"
                    aria-label="스크린샷 새로고침"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                      <path d="M3 3v5h5"/>
                      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                      <path d="M16 16h5v5"/>
                    </svg>
                  </button>
                  {isScreenshotRefreshing && screenshotElapsed > 0 && (
                    <span className="text-xs text-kwatch-accent animate-pulse font-normal">{screenshotElapsed}초</span>
                  )}
                  {!isScreenshotRefreshing && localStatus?.screenshotCapturedAt && (
                    <span className="text-xs text-kwatch-text-muted font-normal">{formatDateTime(localStatus.screenshotCapturedAt)}</span>
                  )}
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
                      {localStatus?.url ? (
                        <a
                          href={localStatus.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-kwatch-accent hover:text-kwatch-accent-hover hover:underline"
                        >
                          {localStatus.url}
                        </a>
                      ) : '-'}
                    </div>
                    {localStatus?.finalUrl && localStatus.finalUrl !== localStatus.url && (
                      <div className="mt-1 text-dashboard-sm text-kwatch-text-secondary font-mono break-all">
                        <span className="text-kwatch-text-muted mr-1">↳ 최종 URL:</span>
                        <a
                          href={localStatus.finalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-kwatch-accent hover:text-kwatch-accent-hover hover:underline"
                        >
                          {localStatus.finalUrl}
                        </a>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-dashboard-sm text-kwatch-text-secondary flex items-center gap-1.5">
                      HTTP 상태
                      <button
                        onClick={handleHttpRefresh}
                        disabled={isHttpRefreshing}
                        className={`text-kwatch-text-muted hover:text-kwatch-accent transition-colors ${isHttpRefreshing ? 'animate-spin text-kwatch-accent' : ''}`}
                        title="HTTP 상태 새로고침"
                        aria-label="HTTP 상태 새로고침"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                          <path d="M3 3v5h5"/>
                          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                          <path d="M16 16h5v5"/>
                        </svg>
                      </button>
                      {isHttpRefreshing && httpElapsed > 0 && (
                        <span className="text-xs text-kwatch-accent animate-pulse">{httpElapsed}초</span>
                      )}
                    </div>
                    <div className="text-dashboard-base font-semibold">
                      {localStatus?.isUp ? (
                        <span className="text-kwatch-status-normal">
                          정상 {localStatus?.statusCode ? `(${localStatus.statusCode})` : ''}
                        </span>
                      ) : (
                        <span className="text-kwatch-status-critical">
                          {localStatus?.errorMessage ?? '장애'} {localStatus?.statusCode ? `(${localStatus.statusCode})` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-dashboard-sm text-kwatch-text-secondary">
                      위변조 상태
                    </div>
                    <div className="text-dashboard-base font-semibold">
                      {localStatus?.defacementStatus ? (
                        localStatus.defacementStatus.isDefaced ? (
                          <span className="text-kwatch-status-critical">
                            위변조 감지 (유사도: {localStatus.defacementStatus.htmlSimilarityScore != null || localStatus.defacementStatus.similarityScore != null ? Number(localStatus.defacementStatus.htmlSimilarityScore ?? localStatus.defacementStatus.similarityScore).toFixed(1) : '-'}%)
                            {localStatus.defacementStatus.detectionMethod === 'hybrid' && (
                              <span className="ml-1 px-1.5 py-0.5 bg-kwatch-accent/20 text-kwatch-accent rounded text-xs font-normal">하이브리드</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-kwatch-status-normal">
                            정상 (유사도: {localStatus.defacementStatus.htmlSimilarityScore != null || localStatus.defacementStatus.similarityScore != null ? Number(localStatus.defacementStatus.htmlSimilarityScore ?? localStatus.defacementStatus.similarityScore).toFixed(1) : '-'}%)
                            {localStatus.defacementStatus.detectionMethod === 'hybrid' && (
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
                      {localStatus?.checkedAt ? formatDateTime(localStatus.checkedAt) : '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-dashboard-sm text-kwatch-text-secondary">
                      응답 시간
                    </div>
                    <div className="text-dashboard-base text-kwatch-text-primary font-mono">
                      {formatResponseTime(localStatus?.responseTimeMs ?? null)}
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
                          tickFormatter={(v: number) => `${v.toLocaleString()}ms`}
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
                                  응답 시간: <span className="font-semibold text-kwatch-accent">{data?.responseTime != null ? data.responseTime.toLocaleString() : '-'}ms</span>
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
                        latestDefacement?.detectionDetails
                          ? 'bg-kwatch-accent/20 text-kwatch-accent'
                          : 'bg-kwatch-bg-tertiary text-kwatch-text-secondary'
                      }`}>
                        {latestDefacement?.detectionDetails ? '하이브리드' : '픽셀 전용'}
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
                        <div className="px-3 py-2 text-dashboard-sm text-kwatch-text-secondary border-b border-kwatch-bg-tertiary flex items-center gap-1.5">
                          베이스라인
                          <button
                            onClick={handleBaselineRefresh}
                            disabled={isBaselineRefreshing || !localStatus?.screenshotUrl}
                            className={`text-kwatch-text-muted hover:text-kwatch-accent transition-colors disabled:opacity-30 ${isBaselineRefreshing ? 'animate-spin text-kwatch-accent' : ''}`}
                            title="현재 스크린샷을 베이스라인으로 설정"
                            aria-label="베이스라인 갱신"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                              <path d="M3 3v5h5"/>
                              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                              <path d="M16 16h5v5"/>
                            </svg>
                          </button>
                          {isBaselineRefreshing && baselineElapsed > 0 && (
                            <span className="text-xs text-kwatch-accent animate-pulse">{baselineElapsed}초</span>
                          )}
                          {!isBaselineRefreshing && baselineCreatedAt && (
                            <span className="text-xs text-kwatch-text-muted ml-auto">{formatDateTime(baselineCreatedAt)}</span>
                          )}
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
                        <div className="px-3 py-2 text-dashboard-sm text-kwatch-text-secondary border-b border-kwatch-bg-tertiary flex items-center gap-1.5">
                          현재 스크린샷
                          <button
                            onClick={handleScreenshotRefresh}
                            disabled={isScreenshotRefreshing}
                            className={`text-kwatch-text-muted hover:text-kwatch-accent transition-colors ${isScreenshotRefreshing ? 'animate-spin text-kwatch-accent' : ''}`}
                            title="스크린샷 새로고침"
                            aria-label="스크린샷 새로고침"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                              <path d="M3 3v5h5"/>
                              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                              <path d="M16 16h5v5"/>
                            </svg>
                          </button>
                          {isScreenshotRefreshing && screenshotElapsed > 0 && (
                            <span className="text-xs text-kwatch-accent animate-pulse">{screenshotElapsed}초</span>
                          )}
                          {!isScreenshotRefreshing && localStatus?.screenshotCapturedAt && (
                            <span className="text-xs text-kwatch-text-muted ml-auto">{formatDateTime(localStatus.screenshotCapturedAt)}</span>
                          )}
                        </div>
                        <div className="h-48 bg-black flex items-center justify-center">
                          {screenshotUrl ? (
                            <img
                              src={screenshotUrl}
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
                        <div className="px-3 py-2 text-dashboard-sm text-kwatch-text-secondary border-b border-kwatch-bg-tertiary flex items-center gap-1.5">
                          차이 분석
                          <button
                            onClick={handleDefacementRecheck}
                            disabled={isDefacementRechecking}
                            className={`text-kwatch-text-muted hover:text-kwatch-accent transition-colors ${isDefacementRechecking ? 'animate-spin text-kwatch-accent' : ''}`}
                            title="위변조 재분석"
                            aria-label="위변조 재분석"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                              <path d="M3 3v5h5"/>
                              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                              <path d="M16 16h5v5"/>
                            </svg>
                          </button>
                          {isDefacementRechecking && defacementElapsed > 0 && (
                            <span className="text-xs text-kwatch-accent animate-pulse">{defacementElapsed}초</span>
                          )}
                          {!isDefacementRechecking && latestDefacement?.checkedAt && (
                            <span className="text-xs text-kwatch-text-muted ml-auto">{formatDateTime(latestDefacement.checkedAt)}</span>
                          )}
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

                    {/* 위변조 체크 이력 (접이식) */}
                    <div>
                      <button
                        onClick={() => setHistoryExpanded((prev) => ({ ...prev, defacement: !prev.defacement }))}
                        className="flex items-center gap-2 text-dashboard-sm font-semibold text-kwatch-text-secondary hover:text-kwatch-text-primary transition-colors w-full"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`transition-transform ${historyExpanded.defacement ? 'rotate-90' : ''}`}
                        >
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                        위변조 체크 이력 ({defacementHistory.length}건)
                      </button>
                      {historyExpanded.defacement && defacementHistory.length > 0 && (
                        <div className="mt-2">
                          <div className="overflow-x-auto">
                            <table className="w-full text-dashboard-sm">
                              <thead>
                                <tr className="border-b border-kwatch-bg-tertiary text-kwatch-text-secondary">
                                  <th className="text-left py-2 px-3 font-medium">시간</th>
                                  <th className="text-right py-2 px-3 font-medium">유사도</th>
                                  <th className="text-center py-2 px-3 font-medium">탐지 방식</th>
                                  <th className="text-center py-2 px-3 font-medium">결과</th>
                                  <th className="text-center py-2 px-3 font-medium">diff</th>
                                </tr>
                              </thead>
                              <tbody>
                                {defacementHistory
                                  .slice((defacementHistoryPage - 1) * 10, defacementHistoryPage * 10)
                                  .map((check) => {
                                    const score = check.htmlSimilarityScore ?? check.similarityScore;
                                    const method = check.detectionDetails ? 'hybrid' : 'pixel';
                                    return (
                                      <tr
                                        key={check.id}
                                        className={`border-b border-kwatch-bg-tertiary/50 ${
                                          check.isDefaced ? 'bg-kwatch-status-critical/10' : ''
                                        }`}
                                      >
                                        <td className="py-2 px-3 text-kwatch-text-primary font-mono whitespace-nowrap">
                                          {formatDateTime(check.checkedAt)}
                                        </td>
                                        <td className={`py-2 px-3 text-right font-semibold tabular-nums ${
                                          score != null && score < 85
                                            ? 'text-kwatch-status-critical'
                                            : 'text-kwatch-status-normal'
                                        }`}>
                                          {score != null ? `${Number(score).toFixed(1)}%` : '-'}
                                        </td>
                                        <td className="py-2 px-3 text-center">
                                          <span className={`px-1.5 py-0.5 rounded text-xs ${
                                            method === 'hybrid'
                                              ? 'bg-kwatch-accent/20 text-kwatch-accent'
                                              : 'bg-kwatch-bg-tertiary text-kwatch-text-secondary'
                                          }`}>
                                            {method === 'hybrid' ? '하이브리드' : '픽셀'}
                                          </span>
                                        </td>
                                        <td className="py-2 px-3 text-center">
                                          {check.isDefaced ? (
                                            <span className="text-kwatch-status-critical font-semibold">위변조</span>
                                          ) : (
                                            <span className="text-kwatch-status-normal">정상</span>
                                          )}
                                        </td>
                                        <td className="py-2 px-3 text-center">
                                          {check.diffImagePath ? (
                                            <button
                                              onClick={() => setImagePreviewUrl(`${API_BASE_URL}/api/defacement/diff/${check.id}`)}
                                              className="text-kwatch-accent hover:text-kwatch-accent-hover transition-colors"
                                              title="차이 이미지 보기"
                                            >
                                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="11" cy="11" r="8" />
                                                <path d="m21 21-4.3-4.3" />
                                              </svg>
                                            </button>
                                          ) : (
                                            <span className="text-kwatch-text-muted">-</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                            </table>
                          </div>
                          {/* 페이지네이션 */}
                          {defacementHistory.length > 10 && (
                            <div className="flex items-center justify-center gap-2 mt-3">
                              <button
                                onClick={() => setDefacementHistoryPage((p) => Math.max(1, p - 1))}
                                disabled={defacementHistoryPage === 1}
                                className="px-2 py-1 text-xs text-kwatch-text-secondary hover:text-kwatch-text-primary disabled:opacity-30 transition-colors"
                              >
                                &lt;&lt;
                              </button>
                              {Array.from({ length: Math.ceil(defacementHistory.length / 10) }, (_, i) => (
                                <button
                                  key={i + 1}
                                  onClick={() => setDefacementHistoryPage(i + 1)}
                                  className={`px-2 py-1 text-xs rounded ${
                                    defacementHistoryPage === i + 1
                                      ? 'bg-kwatch-accent text-white'
                                      : 'text-kwatch-text-secondary hover:text-kwatch-text-primary'
                                  }`}
                                >
                                  {i + 1}
                                </button>
                              ))}
                              <button
                                onClick={() => setDefacementHistoryPage((p) => Math.min(Math.ceil(defacementHistory.length / 10), p + 1))}
                                disabled={defacementHistoryPage === Math.ceil(defacementHistory.length / 10)}
                                className="px-2 py-1 text-xs text-kwatch-text-secondary hover:text-kwatch-text-primary disabled:opacity-30 transition-colors"
                              >
                                &gt;&gt;
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {historyExpanded.defacement && defacementHistory.length === 0 && (
                        <div className="mt-2 text-center py-4 text-kwatch-text-muted text-dashboard-sm bg-kwatch-bg-tertiary/20 rounded">
                          위변조 체크 이력이 없습니다
                        </div>
                      )}
                    </div>

                    {/* 베이스라인 변경 이력 (접이식) */}
                    <div>
                      <button
                        onClick={() => setHistoryExpanded((prev) => ({ ...prev, baseline: !prev.baseline }))}
                        className="flex items-center gap-2 text-dashboard-sm font-semibold text-kwatch-text-secondary hover:text-kwatch-text-primary transition-colors w-full"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`transition-transform ${historyExpanded.baseline ? 'rotate-90' : ''}`}
                        >
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                        베이스라인 변경 이력 ({baselineHistory.length}건)
                      </button>
                      {historyExpanded.baseline && baselineHistory.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {baselineHistory.map((bl) => (
                            <div
                              key={bl.id}
                              className="flex items-center gap-3 bg-kwatch-bg-tertiary/20 rounded px-4 py-2"
                            >
                              <div
                                className="w-16 h-9 bg-black rounded overflow-hidden flex-shrink-0 cursor-pointer"
                                onClick={() => setImagePreviewUrl(`${API_BASE_URL}/api/screenshots/image/${bl.screenshotId}`)}
                              >
                                <img
                                  src={`${API_BASE_URL}/api/screenshots/thumbnail/${bl.screenshotId}`}
                                  alt="베이스라인 썸네일"
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <span className="text-dashboard-sm text-kwatch-text-primary font-mono flex-1">
                                {formatDateTime(bl.createdAt)}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                bl.isActive
                                  ? 'bg-kwatch-status-normal/20 text-kwatch-status-normal'
                                  : 'bg-kwatch-bg-tertiary text-kwatch-text-muted'
                              }`}>
                                {bl.isActive ? '활성' : '비활성'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {historyExpanded.baseline && baselineHistory.length === 0 && (
                        <div className="mt-2 text-center py-4 text-kwatch-text-muted text-dashboard-sm bg-kwatch-bg-tertiary/20 rounded">
                          베이스라인 이력이 없습니다
                        </div>
                      )}
                    </div>

                    {/* 스크린샷 이력 갤러리 (접이식) */}
                    <div>
                      <button
                        onClick={() => setHistoryExpanded((prev) => ({ ...prev, screenshot: !prev.screenshot }))}
                        className="flex items-center gap-2 text-dashboard-sm font-semibold text-kwatch-text-secondary hover:text-kwatch-text-primary transition-colors w-full"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`transition-transform ${historyExpanded.screenshot ? 'rotate-90' : ''}`}
                        >
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                        스크린샷 이력 ({screenshotHistory.length}건)
                      </button>
                      {historyExpanded.screenshot && screenshotHistory.length > 0 && (
                        <div className="mt-2 flex gap-3 overflow-x-auto pb-2">
                          {screenshotHistory.map((scr) => (
                            <div
                              key={scr.id}
                              className="flex-shrink-0 cursor-pointer group"
                              onClick={() => setImagePreviewUrl(`${API_BASE_URL}/api/screenshots/image/${scr.id}`)}
                            >
                              <div className="w-32 h-[72px] bg-black rounded overflow-hidden border border-kwatch-bg-tertiary group-hover:border-kwatch-accent transition-colors">
                                <img
                                  src={`${API_BASE_URL}/api/screenshots/thumbnail/${scr.id}`}
                                  alt={`스크린샷 ${formatDateTime(scr.capturedAt)}`}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                              <div className="text-xs text-kwatch-text-muted mt-1 text-center font-mono">
                                {formatTime(scr.capturedAt)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {historyExpanded.screenshot && screenshotHistory.length === 0 && (
                        <div className="mt-2 text-center py-4 text-kwatch-text-muted text-dashboard-sm bg-kwatch-bg-tertiary/20 rounded">
                          스크린샷 이력이 없습니다
                        </div>
                      )}
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

      {/* 이미지 확대 미리보기 모달 */}
      {imagePreviewUrl && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-[60]"
          onClick={() => setImagePreviewUrl(null)}
        >
          <button
            onClick={() => setImagePreviewUrl(null)}
            className="absolute top-4 right-4 text-2xl text-kwatch-text-secondary hover:text-kwatch-text-primary transition-colors"
            aria-label="닫기"
          >
            ✕
          </button>
          <img
            src={imagePreviewUrl}
            alt="이미지 미리보기"
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      )}
    </div>
  );
}
