'use client';

import { useState, useEffect } from 'react';
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
      } else {
        setError('알림 채널 설정을 불러올 수 없습니다.');
      }
    } catch (err) {
      setError('서버 통신 중 오류가 발생했습니다.');
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

  // 초기 로드
  useEffect(() => {
    fetchAlertChannels();
    fetchMonitoringSettings();
    fetchDefacementConfig();
    if (currentUser?.role === 'admin') {
      fetchUsers();
    }
  }, [currentUser]);

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
      {/* 페이지 제목 */}
      <h1 className="text-3xl font-bold">시스템 설정</h1>

      {/* 에러 메시지 */}
      {error && (
        <div className="p-4 bg-kwatch-status-critical bg-opacity-10 border border-kwatch-status-critical rounded-md text-kwatch-status-critical">
          {error}
        </div>
      )}

      {/* 성공 메시지 */}
      {successMessage && (
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
                  {defacementConfig.defacementThreshold}%
                </div>
              </div>
              <div className="bg-kwatch-bg-primary rounded-md p-3">
                <div className="text-xs text-kwatch-text-muted">HTML 분석</div>
                <div className={`text-lg font-semibold ${defacementConfig.htmlAnalysisEnabled ? 'text-kwatch-status-normal' : 'text-kwatch-text-muted'}`}>
                  {defacementConfig.htmlAnalysisEnabled ? '활성' : '비활성'}
                </div>
              </div>
              <div className="bg-kwatch-bg-primary rounded-md p-3">
                <div className="text-xs text-kwatch-text-muted">탐지 모드</div>
                <div className="text-lg font-semibold text-kwatch-text-primary">
                  {defacementConfig.htmlAnalysisEnabled ? '하이브리드' : '픽셀 전용'}
                </div>
              </div>
              <div className="bg-kwatch-bg-primary rounded-md p-3">
                <div className="text-xs text-kwatch-text-muted">가중치 합계</div>
                <div className="text-lg font-semibold text-kwatch-text-primary">
                  {(defacementConfig.hybridWeights.pixel + defacementConfig.hybridWeights.structural + defacementConfig.hybridWeights.critical).toFixed(1)}
                </div>
              </div>
            </div>

            {/* 하이브리드 점수 가중치 */}
            <div>
              <h3 className="text-sm font-medium text-kwatch-text-primary mb-3">
                하이브리드 점수 가중치
              </h3>
              <div className="space-y-3">
                {[
                  { label: '픽셀 비교', value: defacementConfig.hybridWeights.pixel },
                  { label: '구조 분석', value: defacementConfig.hybridWeights.structural },
                  { label: '도메인 감사', value: defacementConfig.hybridWeights.critical },
                ].map(({ label, value }) => (
                  <div key={label} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-kwatch-text-secondary">{label}</span>
                      <span className="text-kwatch-text-primary font-semibold">{(value * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full h-2 bg-kwatch-bg-tertiary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-kwatch-accent transition-all"
                        style={{ width: `${value * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-kwatch-text-muted">
              위변조 탐지 설정은 환경변수로 관리됩니다. 변경이 필요하면 서버의 .env 파일을 수정한 후 서버를 재시작하세요.
            </p>
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

    </div>
  );
}
