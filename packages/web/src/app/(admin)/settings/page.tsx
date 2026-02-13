'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import type { AlertChannel, User, DefacementConfig } from '@/types';

export default function SettingsPage() {
  const [alertChannels, setAlertChannels] = useState<AlertChannel[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // 모니터링 설정
  const [checkInterval, setCheckInterval] = useState(300);
  const [monitoringStats, setMonitoringStats] = useState<{
    totalWebsites: number;
    checkInterval: { avg: number; min: number; max: number; mode: number };
  } | null>(null);
  const [isSavingInterval, setIsSavingInterval] = useState(false);

  // 위변조 탐지 설정
  const [defacementConfig, setDefacementConfig] = useState<DefacementConfig | null>(null);
  const [editWeights, setEditWeights] = useState({ pixel: 30, structural: 30, critical: 40 });
  const [editThreshold, setEditThreshold] = useState(85);
  const [editHtmlEnabled, setEditHtmlEnabled] = useState(true);
  const [isSavingDefacement, setIsSavingDefacement] = useState(false);

  // 서버 재시작
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartStatus, setRestartStatus] = useState('');
  const restartTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 서버 상태
  const [serverStatus, setServerStatus] = useState<{
    uptime: number;
    nodeVersion: string;
    platform: string;
    env: string;
    memory: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
      systemTotal: number;
      systemFree: number;
    };
    database: 'connected' | 'disconnected';
    redis: 'connected' | 'disconnected';
    queues: Record<string, { waiting: number; active: number; completed: number; failed: number } | null> | null;
  } | null>(null);
  const serverStatusTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 서버 복구 감지 polling
  const startHealthPolling = useCallback(() => {
    let elapsed = 0;
    const poll = () => {
      elapsed += 2;
      setRestartStatus(`서버 재시작 중... (${elapsed}초 경과)`);
      fetch('/api/health')
        .then((res) => {
          if (res.ok) {
            setRestartStatus('서버가 복구되었습니다. 페이지를 새로고침합니다...');
            setTimeout(() => window.location.reload(), 1000);
          } else {
            restartTimerRef.current = setTimeout(poll, 2000);
          }
        })
        .catch(() => {
          restartTimerRef.current = setTimeout(poll, 2000);
        });
    };
    // 첫 poll은 3초 후 (서버가 종료될 시간)
    restartTimerRef.current = setTimeout(poll, 3000);
  }, []);

  // 서버 상태 조회
  const fetchServerStatus = useCallback(async () => {
    try {
      const response = await api.get<typeof serverStatus>('/api/settings/server/status');
      if (response.success && response.data) {
        setServerStatus(response.data);
      }
    } catch {
      // 서버 재시작 중일 수 있으므로 무시
    }
  }, []);

  // cleanup
  useEffect(() => {
    return () => {
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (serverStatusTimerRef.current) clearInterval(serverStatusTimerRef.current);
    };
  }, []);

  // 현재 사용자 정보 로드
  useEffect(() => {
    const userJson = localStorage.getItem('kwatch_user');
    if (userJson) {
      try {
        setCurrentUser(JSON.parse(userJson));
      } catch (err) {
        console.error('Failed to parse user:', err);
      }
    }
  }, []);

  // 알림 채널 설정 조회
  const fetchAlertChannels = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.get<AlertChannel[]>('/api/alerts/channels');

      if (response.success && response.data) {
        setAlertChannels(response.data);
      } else if (!isRestarting) {
        setError('알림 채널 설정을 불러올 수 없습니다.');
      }
    } catch (err) {
      if (!isRestarting) {
        setError('서버 통신 중 오류가 발생했습니다.');
      }
      console.error('Error fetching alert channels:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 사용자 목록 조회 (admin만 가능)
  const fetchUsers = async () => {
    if (currentUser?.role !== 'admin') {
      return;
    }

    try {
      const response = await api.get<User[]>('/api/users');

      if (response.success && response.data) {
        setUsers(response.data);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  // 모니터링 설정 조회
  const fetchMonitoringSettings = async () => {
    try {
      const response = await api.get<{
        totalWebsites: number;
        checkInterval: { avg: number; min: number; max: number; mode: number };
      }>('/api/settings/monitoring');

      if (response.success && response.data) {
        setMonitoringStats(response.data);
        setCheckInterval(response.data.checkInterval.mode);
      }
    } catch (err) {
      console.error('Error fetching monitoring settings:', err);
    }
  };

  // 위변조 탐지 설정 조회
  const fetchDefacementConfig = async () => {
    try {
      const response = await api.get<DefacementConfig>('/api/settings/defacement');
      if (response.success && response.data) {
        setDefacementConfig(response.data);
        setEditWeights({
          pixel: Math.round(response.data.hybridWeights.pixel * 100),
          structural: Math.round(response.data.hybridWeights.structural * 100),
          critical: Math.round(response.data.hybridWeights.critical * 100),
        });
        setEditThreshold(response.data.defacementThreshold);
        setEditHtmlEnabled(response.data.htmlAnalysisEnabled);
      }
    } catch (err) {
      console.error('Error fetching defacement config:', err);
    }
  };

  // 체크 주기 저장
  const handleSaveCheckInterval = async () => {
    setIsSavingInterval(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await api.put<{ updatedCount: number; message: string }>(
        '/api/settings/monitoring/check-interval',
        { checkIntervalSeconds: checkInterval },
      );

      if (response.success && response.data) {
        setSuccessMessage(response.data.message);
        fetchMonitoringSettings();
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError(response.error?.message || '체크 주기 변경에 실패했습니다.');
      }
    } catch (err) {
      setError('서버 통신 중 오류가 발생했습니다.');
    } finally {
      setIsSavingInterval(false);
    }
  };

  // 위변조 탐지 설정 저장
  const handleSaveDefacement = async () => {
    setIsSavingDefacement(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await api.put<DefacementConfig & { message: string }>(
        '/api/settings/defacement',
        {
          defacementThreshold: editThreshold,
          hybridWeights: {
            pixel: editWeights.pixel / 100,
            structural: editWeights.structural / 100,
            critical: editWeights.critical / 100,
          },
          htmlAnalysisEnabled: editHtmlEnabled,
        },
      );

      if (response.success && response.data) {
        setSuccessMessage(response.data.message);
        fetchDefacementConfig();

        // .env 저장 및 재시작 여부 확인
        const shouldPersist = window.confirm(
          '런타임에 설정이 적용되었습니다.\n\n' +
          '.env 파일에도 저장하고 서버를 재시작하시겠습니까?\n' +
          '(아니오 선택 시 런타임에만 적용되며, 서버 재시작 시 이전 값으로 복원됩니다.)'
        );

        if (shouldPersist) {
          const persistRes = await api.post<{ message: string }>('/api/settings/defacement/persist', {});
          if (persistRes.success) {
            setIsRestarting(true);
            setRestartStatus('.env 저장 완료. 서버 재시작 요청 중...');
            await api.post('/api/settings/server/restart', {});
            startHealthPolling();
          } else {
            setError(persistRes.error?.message || '.env 파일 저장에 실패했습니다.');
          }
        } else {
          setTimeout(() => setSuccessMessage(null), 3000);
        }
      } else {
        setError(response.error?.message || '위변조 탐지 설정 변경에 실패했습니다.');
      }
    } catch (err) {
      setError('서버 통신 중 오류가 발생했습니다.');
    } finally {
      setIsSavingDefacement(false);
    }
  };

  // 서버 재시작
  const handleServerRestart = async () => {
    if (!window.confirm('서버를 재시작하시겠습니까?\n런타임 변경사항이 초기화되고 .env 파일의 설정값이 적용됩니다.')) {
      return;
    }

    setIsRestarting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      setRestartStatus('서버 재시작 요청 중...');
      await api.post('/api/settings/server/restart', {});
      startHealthPolling();
    } catch (err) {
      setError('서버 재시작 요청에 실패했습니다.');
      setIsRestarting(false);
      setRestartStatus('');
    }
  };

  // 초기 로드
  useEffect(() => {
    fetchAlertChannels();
    fetchMonitoringSettings();
    fetchDefacementConfig();
    if (currentUser?.role === 'admin') {
      fetchUsers();
      fetchServerStatus();
      // 30초마다 서버 상태 갱신
      serverStatusTimerRef.current = setInterval(fetchServerStatus, 30000);
    }
  }, [currentUser, fetchServerStatus]);

  const handleChannelToggle = async (channelId: number, isActive: boolean) => {
    try {
      const response = await api.put(`/api/alerts/channels/${channelId}`, {
        isActive: !isActive,
      });

      if (response.success) {
        setAlertChannels(
          alertChannels.map((channel) =>
            channel.id === channelId
              ? { ...channel, isActive: !isActive }
              : channel
          )
        );
      } else {
        setError('알림 채널 설정 변경에 실패했습니다.');
      }
    } catch (err) {
      setError('서버 통신 중 오류가 발생했습니다.');
      console.error('Error updating channel:', err);
    }
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}일 ${hours}시간`;
    if (hours > 0) return `${hours}시간 ${minutes}분`;
    return `${minutes}분`;
  };

  const formatBytes = (bytes: number): string => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const getChannelTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      EMAIL: '이메일',
      SLACK: '슬랙',
      TELEGRAM: '텔레그램',
    };
    return labels[type] || type;
  };

  return (
    <div className="space-y-8">
      {/* 서버 재시작 오버레이 */}
      {isRestarting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-kwatch-bg-primary bg-opacity-90">
          <div className="text-center space-y-4">
            <div className="inline-block w-12 h-12 border-4 border-kwatch-accent border-t-transparent rounded-full animate-spin" />
            <h2 className="text-xl font-semibold text-kwatch-text-primary">
              서버 재시작
            </h2>
            <p className="text-kwatch-text-secondary">
              {restartStatus}
            </p>
            <p className="text-xs text-kwatch-text-muted">
              서버가 복구되면 자동으로 새로고침됩니다.
            </p>
          </div>
        </div>
      )}

      {/* 페이지 제목 */}
      <h1 className="text-3xl font-bold">시스템 설정</h1>

      {/* 에러 메시지 */}
      {error && !isRestarting && (
        <div className="p-4 bg-kwatch-status-critical bg-opacity-10 border border-kwatch-status-critical rounded-md text-kwatch-status-critical">
          {error}
        </div>
      )}

      {/* 성공 메시지 */}
      {successMessage && !isRestarting && (
        <div className="p-4 bg-kwatch-status-normal bg-opacity-10 border border-kwatch-status-normal rounded-md text-kwatch-status-normal">
          {successMessage}
        </div>
      )}

      {/* 섹션 1: 모니터링 설정 */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-kwatch-text-primary">
          모니터링 설정
        </h2>

        <div className="bg-kwatch-bg-secondary rounded-lg border border-kwatch-bg-tertiary p-6 space-y-6">
          {/* 현재 상태 요약 */}
          {monitoringStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-kwatch-bg-primary rounded-md p-3">
                <div className="text-xs text-kwatch-text-muted">모니터링 사이트</div>
                <div className="text-lg font-semibold text-kwatch-text-primary">
                  {monitoringStats.totalWebsites}개
                </div>
              </div>
              <div className="bg-kwatch-bg-primary rounded-md p-3">
                <div className="text-xs text-kwatch-text-muted">현재 체크 주기</div>
                <div className="text-lg font-semibold text-kwatch-text-primary">
                  {monitoringStats.checkInterval.mode}초
                </div>
              </div>
              <div className="bg-kwatch-bg-primary rounded-md p-3">
                <div className="text-xs text-kwatch-text-muted">최소 주기</div>
                <div className="text-lg font-semibold text-kwatch-text-primary">
                  {monitoringStats.checkInterval.min}초
                </div>
              </div>
              <div className="bg-kwatch-bg-primary rounded-md p-3">
                <div className="text-xs text-kwatch-text-muted">최대 주기</div>
                <div className="text-lg font-semibold text-kwatch-text-primary">
                  {monitoringStats.checkInterval.max}초
                </div>
              </div>
            </div>
          )}

          {/* 체크 주기 변경 */}
          <div>
            <label className="block text-sm font-medium text-kwatch-text-primary mb-2">
              HTTP 상태체크 주기 (초)
            </label>
            <div className="flex items-center gap-4">
              <input
                type="number"
                value={checkInterval}
                onChange={(e) => setCheckInterval(Math.max(10, Math.min(86400, parseInt(e.target.value) || 10)))}
                min="10"
                max="86400"
                step="10"
                className="w-32 px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
              />
              <div className="flex gap-2">
                {[60, 120, 180, 300, 600].map((val) => (
                  <button
                    key={val}
                    onClick={() => setCheckInterval(val)}
                    className={`px-3 py-1.5 rounded text-sm transition-colors ${
                      checkInterval === val
                        ? 'bg-kwatch-accent text-white'
                        : 'bg-kwatch-bg-primary border border-kwatch-bg-tertiary text-kwatch-text-secondary hover:bg-kwatch-bg-tertiary'
                    }`}
                  >
                    {val >= 60 ? `${val / 60}분` : `${val}초`}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-kwatch-text-muted mt-2">
              모든 활성 웹사이트에 일괄 적용됩니다. 10초~86400초(24시간) 범위에서 설정 가능합니다.
            </p>
          </div>

          <button
            onClick={handleSaveCheckInterval}
            disabled={isSavingInterval}
            className="px-6 py-2 bg-kwatch-accent hover:bg-kwatch-accent-hover disabled:opacity-50 text-white rounded-md font-medium transition-colors"
          >
            {isSavingInterval ? '적용 중...' : '체크 주기 적용'}
          </button>
        </div>
      </div>

      {/* 섹션 2: 위변조 탐지 설정 */}
      {defacementConfig && (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-kwatch-text-primary">
            위변조 탐지 설정
          </h2>

          <div className="bg-kwatch-bg-secondary rounded-lg border border-kwatch-bg-tertiary p-6 space-y-6">
            {/* 요약 카드 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-kwatch-bg-primary rounded-md p-3">
                <div className="text-xs text-kwatch-text-muted">위변조 임계값</div>
                <div className="text-lg font-semibold text-kwatch-text-primary">
                  {editThreshold}%
                </div>
              </div>
              <div className="bg-kwatch-bg-primary rounded-md p-3">
                <div className="text-xs text-kwatch-text-muted">HTML 분석</div>
                <div className={`text-lg font-semibold ${editHtmlEnabled ? 'text-kwatch-status-normal' : 'text-kwatch-text-muted'}`}>
                  {editHtmlEnabled ? '활성' : '비활성'}
                </div>
              </div>
              <div className="bg-kwatch-bg-primary rounded-md p-3">
                <div className="text-xs text-kwatch-text-muted">탐지 모드</div>
                <div className="text-lg font-semibold text-kwatch-text-primary">
                  {editHtmlEnabled ? '하이브리드' : '픽셀 전용'}
                </div>
              </div>
              <div className="bg-kwatch-bg-primary rounded-md p-3">
                <div className="text-xs text-kwatch-text-muted">가중치 합계</div>
                <div className={`text-lg font-semibold ${
                  editWeights.pixel + editWeights.structural + editWeights.critical !== 100
                    ? 'text-kwatch-status-warning'
                    : 'text-kwatch-text-primary'
                }`}>
                  {editWeights.pixel + editWeights.structural + editWeights.critical}%
                  {editWeights.pixel + editWeights.structural + editWeights.critical !== 100 && (
                    <span className="text-xs ml-1">(!= 100%)</span>
                  )}
                </div>
              </div>
            </div>

            {/* 임계값 설정 */}
            <div>
              <label className="block text-sm font-medium text-kwatch-text-primary mb-2">
                위변조 임계값 (%)
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  value={editThreshold}
                  onChange={(e) => setEditThreshold(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                  min="0"
                  max="100"
                  className="w-24 px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
                />
                <p className="text-xs text-kwatch-text-muted">
                  유사도가 이 값 미만이면 위변조로 판정합니다.
                </p>
              </div>
            </div>

            {/* HTML 분석 토글 */}
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editHtmlEnabled}
                  onChange={(e) => setEditHtmlEnabled(e.target.checked)}
                  className="w-5 h-5"
                />
                <span className="text-sm font-medium text-kwatch-text-primary">
                  HTML 구조 분석 활성화
                </span>
                <span className="text-xs text-kwatch-text-muted">
                  (비활성 시 픽셀 전용 모드)
                </span>
              </label>
            </div>

            {/* 하이브리드 점수 가중치 슬라이더 */}
            <div>
              <h3 className="text-sm font-medium text-kwatch-text-primary mb-3">
                하이브리드 점수 가중치
              </h3>
              <div className="space-y-4">
                {([
                  { label: '픽셀 비교', key: 'pixel' as const },
                  { label: '구조 분석', key: 'structural' as const },
                  { label: '도메인 감사', key: 'critical' as const },
                ]).map(({ label, key }) => (
                  <div key={key} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-kwatch-text-secondary">{label}</span>
                      <span className="text-kwatch-text-primary font-semibold">{editWeights[key]}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={editWeights[key]}
                      onChange={(e) => setEditWeights({ ...editWeights, [key]: parseInt(e.target.value) })}
                      className="w-full h-2 bg-kwatch-bg-tertiary rounded-full appearance-none cursor-pointer accent-kwatch-accent"
                    />
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-kwatch-text-muted">
              런타임 변경은 서버 재시작 시 .env 값으로 복원됩니다.
            </p>

            <button
              onClick={handleSaveDefacement}
              disabled={isSavingDefacement}
              className="px-6 py-2 bg-kwatch-accent hover:bg-kwatch-accent-hover disabled:opacity-50 text-white rounded-md font-medium transition-colors"
            >
              {isSavingDefacement ? '저장 중...' : '위변조 설정 저장'}
            </button>
          </div>
        </div>
      )}

      {/* 섹션 3: 알림 채널 설정 */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-kwatch-text-primary">
          알림 채널 설정
        </h2>

        {isLoading ? (
          <div className="text-kwatch-text-muted">로딩 중...</div>
        ) : (
          <div className="space-y-4">
            {alertChannels.map((channel) => (
              <div
                key={channel.id}
                className="bg-kwatch-bg-secondary rounded-lg border border-kwatch-bg-tertiary p-6 flex items-start justify-between"
              >
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-kwatch-text-primary mb-2">
                    {getChannelTypeLabel(channel.channelType)}
                  </h3>
                  <div className="text-sm text-kwatch-text-secondary space-y-1">
                    {/* 채널별 설정 표시 */}
                    {channel.channelType === 'EMAIL' && (
                      <p>발신자: {String(channel.config.from || '-')}</p>
                    )}
                    {channel.channelType === 'SLACK' && (
                      <p>
                        Webhook URL:{' '}
                        {typeof channel.config.webhookUrl === 'string'
                          ? `${channel.config.webhookUrl.substring(0, 30)}...`
                          : '-'}
                      </p>
                    )}
                    {channel.channelType === 'TELEGRAM' && (
                      <p>Chat ID: {String(channel.config.chatId || '-')}</p>
                    )}
                  </div>
                </div>
                <div className="ml-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={channel.isActive}
                      onChange={() => handleChannelToggle(channel.id, channel.isActive)}
                      className="w-5 h-5"
                    />
                    <span className="text-sm text-kwatch-text-primary">
                      {channel.isActive ? '활성' : '비활성'}
                    </span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 섹션 2: 대시보드 설정 */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-kwatch-text-primary">
          대시보드 설정
        </h2>

        <div className="bg-kwatch-bg-secondary rounded-lg border border-kwatch-bg-tertiary p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-kwatch-text-primary mb-2">
              자동 로테이션 간격 (초)
            </label>
            <input
              type="number"
              defaultValue="15"
              min="5"
              max="120"
              className="w-full max-w-xs px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
            />
            <p className="text-xs text-kwatch-text-muted mt-1">
              대시보드 페이지가 자동으로 전환되는 간격입니다.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-kwatch-text-primary mb-2">
              페이지당 표시 웹사이트 수
            </label>
            <input
              type="number"
              defaultValue="35"
              min="10"
              max="100"
              className="w-full max-w-xs px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
            />
            <p className="text-xs text-kwatch-text-muted mt-1">
              한 번에 표시할 웹사이트의 최대 개수입니다. (7x5 그리드 = 35개 권장)
            </p>
          </div>

          <button
            disabled
            title="준비 중"
            className="px-6 py-2 bg-kwatch-accent text-white rounded-md font-medium transition-colors opacity-50 cursor-not-allowed"
          >
            저장
          </button>
        </div>
      </div>

      {/* 섹션 3: 사용자 관리 (Admin만) */}
      {currentUser?.role === 'admin' && (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-kwatch-text-primary">
            사용자 관리
          </h2>

          <div className="bg-kwatch-bg-secondary rounded-lg overflow-hidden border border-kwatch-bg-tertiary">
            <table className="w-full">
              <thead className="border-b border-kwatch-bg-tertiary bg-kwatch-bg-tertiary">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                    사용자명
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                    이메일
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                    역할
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                    상태
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                    작업
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center">
                      <div className="text-kwatch-text-muted">등록된 사용자가 없습니다.</div>
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-kwatch-bg-tertiary hover:bg-kwatch-bg-primary transition-colors"
                    >
                      <td className="px-6 py-3 text-sm font-medium">{user.username}</td>
                      <td className="px-6 py-3 text-sm text-kwatch-text-secondary">
                        {user.email || '-'}
                      </td>
                      <td className="px-6 py-3 text-sm text-kwatch-text-secondary">
                        {user.role}
                      </td>
                      <td className="px-6 py-3 text-sm">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            user.isActive
                              ? 'bg-kwatch-status-normal text-white'
                              : 'bg-kwatch-status-unknown text-white'
                          }`}
                        >
                          {user.isActive ? '활성' : '비활성'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm space-x-2">
                        <button
                          disabled
                          title="준비 중"
                          className="text-kwatch-accent opacity-50 cursor-not-allowed"
                        >
                          수정
                        </button>
                        <button
                          disabled
                          title="준비 중"
                          className="text-kwatch-status-critical opacity-50 cursor-not-allowed"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <button
            disabled
            title="준비 중"
            className="px-6 py-2 bg-kwatch-accent text-white rounded-md font-medium transition-colors opacity-50 cursor-not-allowed"
          >
            + 새 사용자 추가
          </button>
        </div>
      )}

      {/* 섹션: 시스템 관리 */}
      {currentUser?.role === 'admin' && (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-kwatch-text-primary">
            시스템 관리
          </h2>

          <div className="bg-kwatch-bg-secondary rounded-lg border border-kwatch-bg-tertiary p-6 space-y-6">
            {/* 상단 4칸 카드: 가동시간, 메모리, DB, Redis */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-kwatch-bg-primary rounded-md p-3">
                <div className="text-xs text-kwatch-text-muted">가동시간</div>
                <div className="text-lg font-semibold text-kwatch-text-primary">
                  {serverStatus ? formatUptime(serverStatus.uptime) : '-'}
                </div>
              </div>
              <div className="bg-kwatch-bg-primary rounded-md p-3">
                <div className="text-xs text-kwatch-text-muted">메모리 (RSS)</div>
                <div className="text-lg font-semibold text-kwatch-text-primary">
                  {serverStatus ? formatBytes(serverStatus.memory.rss) : '-'}
                </div>
                {serverStatus && (
                  <div className="text-xs text-kwatch-text-muted mt-1">
                    Heap: {formatBytes(serverStatus.memory.heapUsed)} / {formatBytes(serverStatus.memory.heapTotal)}
                  </div>
                )}
              </div>
              <div className="bg-kwatch-bg-primary rounded-md p-3">
                <div className="text-xs text-kwatch-text-muted">데이터베이스</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`w-2.5 h-2.5 rounded-full ${serverStatus?.database === 'connected' ? 'bg-kwatch-status-normal' : 'bg-kwatch-status-critical'}`} />
                  <span className={`text-lg font-semibold ${serverStatus?.database === 'connected' ? 'text-kwatch-status-normal' : 'text-kwatch-status-critical'}`}>
                    {serverStatus ? (serverStatus.database === 'connected' ? '연결됨' : '끊김') : '-'}
                  </span>
                </div>
              </div>
              <div className="bg-kwatch-bg-primary rounded-md p-3">
                <div className="text-xs text-kwatch-text-muted">Redis</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`w-2.5 h-2.5 rounded-full ${serverStatus?.redis === 'connected' ? 'bg-kwatch-status-normal' : 'bg-kwatch-status-critical'}`} />
                  <span className={`text-lg font-semibold ${serverStatus?.redis === 'connected' ? 'text-kwatch-status-normal' : 'text-kwatch-status-critical'}`}>
                    {serverStatus ? (serverStatus.redis === 'connected' ? '연결됨' : '끊김') : '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* 작업 큐 현황 */}
            {serverStatus?.queues && (
              <div>
                <h3 className="text-sm font-medium text-kwatch-text-primary mb-3">작업 큐 현황</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {([
                    { key: 'monitoring', label: '모니터링' },
                    { key: 'screenshot', label: '스크린샷' },
                    { key: 'defacement', label: '위변조' },
                  ] as const).map(({ key, label }) => {
                    const q = serverStatus.queues?.[key];
                    return (
                      <div key={key} className="bg-kwatch-bg-primary rounded-md p-3">
                        <div className="text-xs text-kwatch-text-muted mb-2">{label} 큐</div>
                        {q ? (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            <span className="text-kwatch-text-secondary">대기</span>
                            <span className="text-kwatch-text-primary font-medium text-right">{q.waiting}</span>
                            <span className="text-kwatch-text-secondary">처리 중</span>
                            <span className="text-kwatch-accent font-medium text-right">{q.active}</span>
                            <span className="text-kwatch-text-secondary">완료</span>
                            <span className="text-kwatch-status-normal font-medium text-right">{q.completed}</span>
                            <span className="text-kwatch-text-secondary">실패</span>
                            <span className={`font-medium text-right ${q.failed > 0 ? 'text-kwatch-status-critical' : 'text-kwatch-text-primary'}`}>{q.failed}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-kwatch-text-muted">사용 불가</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 서버 정보 + 재시작 */}
            <div className="flex items-end justify-between">
              <div className="text-xs text-kwatch-text-muted space-y-0.5">
                {serverStatus && (
                  <>
                    <div>Node.js {serverStatus.nodeVersion} / {serverStatus.platform} / {serverStatus.env}</div>
                    <div>시스템 메모리: {formatBytes(serverStatus.memory.systemFree)} 가용 / {formatBytes(serverStatus.memory.systemTotal)} 전체</div>
                  </>
                )}
                <div>서버를 재시작하면 런타임 변경사항이 초기화되고 .env 파일의 설정값이 적용됩니다.</div>
              </div>
              <button
                onClick={handleServerRestart}
                disabled={isRestarting}
                className="ml-4 px-6 py-2 bg-kwatch-status-critical hover:bg-red-700 disabled:opacity-50 text-white rounded-md font-medium transition-colors whitespace-nowrap"
              >
                {isRestarting ? '재시작 중...' : '서버 재시작'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
