'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { API_BASE_URL } from '@/lib/constants';
import type { AlertChannel, User, DefacementConfig, EmailChannelConfig, SlackChannelConfig, TelegramChannelConfig } from '@/types';

export default function SettingsPage() {
  const [alertChannels, setAlertChannels] = useState<AlertChannel[]>([]);
  const [channelsLoaded, setChannelsLoaded] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // 모니터링 설정
  const [checkInterval, setCheckInterval] = useState(300);
  const [responseTimeWarning, setResponseTimeWarning] = useState(100000);
  const [monitoringStats, setMonitoringStats] = useState<{
    totalWebsites: number;
    checkInterval: { avg: number; min: number; max: number; mode: number };
    responseTimeWarningMs?: number;
  } | null>(null);
  const [isSavingInterval, setIsSavingInterval] = useState(false);
  const [isSavingResponseTime, setIsSavingResponseTime] = useState(false);

  // 위변조 탐지 설정
  const [defacementConfig, setDefacementConfig] = useState<DefacementConfig | null>(null);
  const [editWeights, setEditWeights] = useState({ pixel: 60, structural: 20, critical: 20 });
  const [editThreshold, setEditThreshold] = useState(85);
  const [editHtmlEnabled, setEditHtmlEnabled] = useState(true);
  const [isSavingDefacement, setIsSavingDefacement] = useState(false);

  // 대시보드 설정
  const [dashboardAutoRotate, setDashboardAutoRotate] = useState(15);
  const [dashboardItemsPerPage, setDashboardItemsPerPage] = useState(35);
  const [isSavingDashboard, setIsSavingDashboard] = useState(false);

  // 베이스라인 관리
  const [isBulkRefreshing, setIsBulkRefreshing] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ total: number; updated: number; skipped: number; failed: number; message: string } | null>(null);
  const [baselineScheduleDays, setBaselineScheduleDays] = useState(0);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  // 알림 채널 폼
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [editingChannel, setEditingChannel] = useState<AlertChannel | null>(null);
  const [channelFormType, setChannelFormType] = useState<'EMAIL' | 'SLACK' | 'TELEGRAM'>('EMAIL');
  const [channelFormEmail, setChannelFormEmail] = useState({ smtpHost: '', smtpPort: 587, from: '', user: '', pass: '', to: [] as string[] });
  const [channelFormSlack, setChannelFormSlack] = useState({ webhookUrl: '' });
  const [channelFormTelegram, setChannelFormTelegram] = useState({ botToken: '', chatId: '' });
  const [emailToInput, setEmailToInput] = useState('');
  const [isSavingChannel, setIsSavingChannel] = useState(false);
  const [isTestingChannel, setIsTestingChannel] = useState<Record<number, boolean>>({});
  const [testResults, setTestResults] = useState<Record<number, { success: boolean; error?: string }>>({});

  // 사용자 관리
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({ username: '', password: '', email: '', role: 'VIEWER' });
  const [isSavingUser, setIsSavingUser] = useState(false);

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
      fetch(`${API_BASE_URL}/api/health`)
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

  // 사용자 폼 열기
  const openUserForm = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setUserForm({ username: user.username, password: '', email: user.email || '', role: user.role });
    } else {
      setEditingUser(null);
      setUserForm({ username: '', password: '', email: '', role: 'VIEWER' });
    }
    setShowUserForm(true);
  };

  const closeUserForm = () => {
    setShowUserForm(false);
    setEditingUser(null);
  };

  // 사용자 저장 (추가/수정)
  const handleSaveUser = async () => {
    setIsSavingUser(true);
    setError(null);

    try {
      if (editingUser) {
        // 수정
        const body: Record<string, unknown> = {
          email: userForm.email,
          role: userForm.role,
        };
        if (userForm.password) {
          body.password = userForm.password;
        }
        const response = await api.put(`/api/users/${editingUser.id}`, body);
        if (response.success) {
          setSuccessMessage('사용자가 수정되었습니다.');
          setTimeout(() => setSuccessMessage(null), 3000);
          closeUserForm();
          fetchUsers();
        } else {
          setError(response.error?.message || '사용자 수정에 실패했습니다.');
        }
      } else {
        // 추가
        if (!userForm.username || !userForm.password) {
          setError('사용자명과 비밀번호는 필수입니다.');
          setIsSavingUser(false);
          return;
        }
        const response = await api.post('/api/users', {
          username: userForm.username,
          password: userForm.password,
          email: userForm.email,
          role: userForm.role,
        });
        if (response.success) {
          setSuccessMessage('사용자가 추가되었습니다.');
          setTimeout(() => setSuccessMessage(null), 3000);
          closeUserForm();
          fetchUsers();
        } else {
          setError(response.error?.message || '사용자 추가에 실패했습니다.');
        }
      }
    } catch (err) {
      setError('서버 통신 중 오류가 발생했습니다.');
    } finally {
      setIsSavingUser(false);
    }
  };

  // 사용자 삭제
  const handleDeleteUser = async (userId: number) => {
    if (!window.confirm('이 사용자를 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('kwatch_token')}`,
        },
      });

      if (response.status === 204 || response.ok) {
        setUsers(users.filter((u) => u.id !== userId));
        setSuccessMessage('사용자가 삭제되었습니다.');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        const data = await response.json().catch(() => null);
        setError(data?.error?.message || '사용자 삭제에 실패했습니다.');
      }
    } catch (err) {
      setError('서버 통신 중 오류가 발생했습니다.');
    }
  };

  // 알림 채널 설정 조회 (admin 전용)
  const fetchAlertChannels = async () => {
    try {
      const response = await api.get<AlertChannel[]>('/api/alerts/channels');

      if (response.success && response.data) {
        setAlertChannels(response.data);
      }
    } catch (err) {
      console.error('Error fetching alert channels:', err);
    } finally {
      setChannelsLoaded(true);
    }
  };

  // 사용자 목록 조회 (admin만 가능)
  const fetchUsers = async () => {
    if (currentUser?.role?.toLowerCase() !== 'admin') {
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
        responseTimeWarningMs?: number;
      }>('/api/settings/monitoring');

      if (response.success && response.data) {
        setMonitoringStats(response.data);
        setCheckInterval(response.data.checkInterval.mode);
        if (response.data.responseTimeWarningMs) {
          setResponseTimeWarning(response.data.responseTimeWarningMs);
        }
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

  // 베이스라인 갱신 주기 조회
  const fetchBaselineSchedule = async () => {
    try {
      const response = await api.get<{ intervalDays: number }>('/api/settings/defacement/baseline-schedule');
      if (response.success && response.data) {
        setBaselineScheduleDays(response.data.intervalDays);
      }
    } catch (err) {
      console.error('Error fetching baseline schedule:', err);
    }
  };

  // 전체 베이스라인 일괄 교체
  const handleBulkBaselineRefresh = async () => {
    if (!window.confirm('모든 활성 사이트의 베이스라인을 최신 스크린샷으로 교체하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.')) {
      return;
    }

    setIsBulkRefreshing(true);
    setBulkResult(null);
    setError(null);

    try {
      const response = await api.post<{ total: number; updated: number; skipped: number; failed: number; message: string }>(
        '/api/settings/defacement/baseline-bulk',
        {},
      );

      if (response.success && response.data) {
        setBulkResult(response.data);
        setSuccessMessage(response.data.message);
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        setError(response.error?.message || '베이스라인 일괄 교체에 실패했습니다.');
      }
    } catch (err) {
      setError('서버 통신 중 오류가 발생했습니다.');
    } finally {
      setIsBulkRefreshing(false);
    }
  };

  // 베이스라인 갱신 주기 저장
  const handleSaveBaselineSchedule = async () => {
    setIsSavingSchedule(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await api.put<{ intervalDays: number; message: string }>(
        '/api/settings/defacement/baseline-schedule',
        { intervalDays: baselineScheduleDays },
      );

      if (response.success && response.data) {
        setSuccessMessage(response.data.message);
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError(response.error?.message || '베이스라인 갱신 주기 변경에 실패했습니다.');
      }
    } catch (err) {
      setError('서버 통신 중 오류가 발생했습니다.');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  // 대시보드 설정 조회
  const fetchDashboardSettings = async () => {
    try {
      const response = await api.get<{ autoRotateInterval: number; itemsPerPage: number }>('/api/settings/dashboard');
      if (response.success && response.data) {
        setDashboardAutoRotate(Math.round(response.data.autoRotateInterval / 1000));
        setDashboardItemsPerPage(response.data.itemsPerPage);
      }
    } catch (err) {
      console.error('Error fetching dashboard settings:', err);
    }
  };

  // 대시보드 설정 저장
  const handleSaveDashboard = async () => {
    setIsSavingDashboard(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await api.put<{ autoRotateInterval: number; itemsPerPage: number; message: string }>(
        '/api/settings/dashboard',
        {
          autoRotateInterval: dashboardAutoRotate * 1000,
          itemsPerPage: dashboardItemsPerPage,
        },
      );

      if (response.success && response.data) {
        setSuccessMessage(response.data.message);
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError(response.error?.message || '대시보드 설정 저장에 실패했습니다.');
      }
    } catch (err) {
      setError('서버 통신 중 오류가 발생했습니다.');
    } finally {
      setIsSavingDashboard(false);
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

  // 위변조 탐지 설정 적용
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
    fetchMonitoringSettings();
    fetchDefacementConfig();
    fetchBaselineSchedule();
    fetchDashboardSettings();
    if (currentUser?.role?.toLowerCase() === 'admin') {
      fetchAlertChannels();
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

  // 채널 추가 폼 초기화
  const openChannelForm = (channel?: AlertChannel) => {
    if (channel) {
      setEditingChannel(channel);
      setChannelFormType(channel.channelType);
      if (channel.channelType === 'EMAIL') {
        const c = channel.config as EmailChannelConfig;
        setChannelFormEmail({ smtpHost: c.smtpHost || '', smtpPort: c.smtpPort || 587, from: c.from || '', user: c.user || '', pass: c.pass || '', to: c.to || [] });
      } else if (channel.channelType === 'SLACK') {
        const c = channel.config as SlackChannelConfig;
        setChannelFormSlack({ webhookUrl: c.webhookUrl || '' });
      } else if (channel.channelType === 'TELEGRAM') {
        const c = channel.config as TelegramChannelConfig;
        setChannelFormTelegram({ botToken: c.botToken || '', chatId: c.chatId || '' });
      }
    } else {
      setEditingChannel(null);
      setChannelFormType('EMAIL');
      setChannelFormEmail({ smtpHost: '', smtpPort: 587, from: '', user: '', pass: '', to: [] });
      setChannelFormSlack({ webhookUrl: '' });
      setChannelFormTelegram({ botToken: '', chatId: '' });
    }
    setEmailToInput('');
    setShowChannelForm(true);
  };

  const closeChannelForm = () => {
    setShowChannelForm(false);
    setEditingChannel(null);
  };

  const getChannelConfig = () => {
    switch (channelFormType) {
      case 'EMAIL': return channelFormEmail;
      case 'SLACK': return channelFormSlack;
      case 'TELEGRAM': return channelFormTelegram;
    }
  };

  const handleSaveChannel = async () => {
    setIsSavingChannel(true);
    setError(null);

    try {
      const config = getChannelConfig();

      if (editingChannel) {
        const response = await api.put(`/api/alerts/channels/${editingChannel.id}`, { config });
        if (response.success) {
          setSuccessMessage('알림 채널이 수정되었습니다.');
          setTimeout(() => setSuccessMessage(null), 3000);
          closeChannelForm();
          fetchAlertChannels();
        } else {
          setError(response.error?.message || '알림 채널 수정에 실패했습니다.');
        }
      } else {
        const response = await api.post('/api/alerts/channels', {
          channelType: channelFormType,
          config,
        });
        if (response.success) {
          setSuccessMessage('알림 채널이 추가되었습니다.');
          setTimeout(() => setSuccessMessage(null), 3000);
          closeChannelForm();
          fetchAlertChannels();
        } else {
          setError(response.error?.message || '알림 채널 추가에 실패했습니다.');
        }
      }
    } catch (err) {
      setError('서버 통신 중 오류가 발생했습니다.');
    } finally {
      setIsSavingChannel(false);
    }
  };

  const handleDeleteChannel = async (channelId: number) => {
    if (!window.confirm('이 알림 채널을 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/alerts/channels/${channelId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('kwatch_token')}`,
        },
      });

      if (response.status === 204 || response.ok) {
        setAlertChannels(alertChannels.filter((c) => c.id !== channelId));
        setSuccessMessage('알림 채널이 삭제되었습니다.');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError('알림 채널 삭제에 실패했습니다.');
      }
    } catch (err) {
      setError('서버 통신 중 오류가 발생했습니다.');
    }
  };

  const handleTestChannel = async (channelId: number, channelType: string) => {
    setIsTestingChannel((prev) => ({ ...prev, [channelId]: true }));
    setTestResults((prev) => { const next = { ...prev }; delete next[channelId]; return next; });

    try {
      const response = await api.post<{ results: { channel: string; success: boolean; error?: string }[] }>('/api/alerts/test', { channelType });

      if (response.success && response.data?.results) {
        const result = response.data.results.find((r) => r.channel === channelType);
        if (result) {
          setTestResults((prev) => ({ ...prev, [channelId]: { success: result.success, error: result.error } }));
        } else {
          setTestResults((prev) => ({ ...prev, [channelId]: { success: false, error: '해당 채널의 테스트 결과가 없습니다.' } }));
        }
      } else {
        setTestResults((prev) => ({ ...prev, [channelId]: { success: false, error: '테스트 요청에 실패했습니다.' } }));
      }
    } catch (err) {
      setTestResults((prev) => ({ ...prev, [channelId]: { success: false, error: '서버 통신 중 오류가 발생했습니다.' } }));
    } finally {
      setIsTestingChannel((prev) => ({ ...prev, [channelId]: false }));
    }
  };

  const addEmailRecipient = () => {
    const email = emailToInput.trim();
    if (email && !channelFormEmail.to.includes(email)) {
      setChannelFormEmail({ ...channelFormEmail, to: [...channelFormEmail.to, email] });
      setEmailToInput('');
    }
  };

  const removeEmailRecipient = (email: string) => {
    setChannelFormEmail({ ...channelFormEmail, to: channelFormEmail.to.filter((e) => e !== email) });
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

          {/* 응답 시간 경고 임계값 */}
          <div className="border-t border-kwatch-bg-tertiary pt-6">
            <label className="block text-sm font-medium text-kwatch-text-primary mb-2">
              응답 시간 경고 임계값 (ms)
            </label>
            <div className="flex items-center gap-4">
              <input
                type="number"
                value={responseTimeWarning}
                onChange={(e) => setResponseTimeWarning(Math.max(1000, Math.min(300000, parseInt(e.target.value) || 1000)))}
                min="1000"
                max="300000"
                step="1000"
                className="w-32 px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
              />
              <div className="flex gap-2 flex-wrap">
                {[10000, 30000, 60000, 100000].map((val) => (
                  <button
                    key={val}
                    onClick={() => setResponseTimeWarning(val)}
                    className={`px-3 py-1.5 rounded text-sm transition-colors ${
                      responseTimeWarning === val
                        ? 'bg-kwatch-accent text-white'
                        : 'bg-kwatch-bg-primary border border-kwatch-bg-tertiary text-kwatch-text-secondary hover:bg-kwatch-bg-tertiary'
                    }`}
                  >
                    {val / 1000}초
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-kwatch-text-muted mt-2">
              응답 시간이 이 값을 초과하면 경고(warning) 상태로 표시됩니다.
            </p>
          </div>

          <button
            onClick={async () => {
              setIsSavingResponseTime(true);
              setError(null);
              setSuccessMessage(null);
              try {
                const response = await api.put<{ responseTimeWarningMs: number; message: string }>(
                  '/api/settings/monitoring/response-time-threshold',
                  { responseTimeWarningMs: responseTimeWarning },
                );
                if (response.success && response.data) {
                  setSuccessMessage(response.data.message);
                  fetchMonitoringSettings();

                  const shouldPersist = window.confirm(
                    '런타임에 설정이 적용되었습니다.\n\n' +
                    '.env 파일에도 저장하고 서버를 재시작하시겠습니까?\n' +
                    '(아니오 선택 시 런타임에만 적용되며, 서버 재시작 시 이전 값으로 복원됩니다.)'
                  );

                  if (shouldPersist) {
                    const persistRes = await api.post<{ message: string }>('/api/settings/monitoring/persist', {});
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
                  setError(response.error?.message || '응답 시간 경고 임계값 변경에 실패했습니다.');
                }
              } catch (err) {
                setError('서버 통신 중 오류가 발생했습니다.');
              } finally {
                setIsSavingResponseTime(false);
              }
            }}
            disabled={isSavingResponseTime}
            className="px-6 py-2 bg-kwatch-accent hover:bg-kwatch-accent-hover disabled:opacity-50 text-white rounded-md font-medium transition-colors"
          >
            {isSavingResponseTime ? '적용 중...' : '경고 임계값 적용'}
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
              {isSavingDefacement ? '적용 중...' : '위변조 설정 적용'}
            </button>
          </div>
        </div>
      )}

      {/* 섹션: 베이스라인 관리 */}
      {currentUser?.role?.toLowerCase() === 'admin' && (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-kwatch-text-primary">
            베이스 스크린샷 관리
          </h2>

          <div className="bg-kwatch-bg-secondary rounded-lg border border-kwatch-bg-tertiary p-6 space-y-6">
            {/* 전체 베이스라인 일괄 교체 */}
            <div>
              <h3 className="text-sm font-medium text-kwatch-text-primary mb-2">
                전체 베이스라인 일괄 교체
              </h3>
              <p className="text-xs text-kwatch-text-muted mb-3">
                모든 활성 사이트의 베이스라인을 최신 스크린샷으로 교체합니다. 사이트 디자인 일괄 변경 후 또는 월 1회 갱신을 권장합니다.
              </p>
              <button
                onClick={handleBulkBaselineRefresh}
                disabled={isBulkRefreshing}
                className="px-6 py-2 bg-kwatch-status-warning hover:bg-yellow-600 disabled:opacity-50 text-black rounded-md font-medium transition-colors"
              >
                {isBulkRefreshing ? '교체 중...' : '전체 베이스라인 교체'}
              </button>
              {bulkResult && (
                <div className="mt-3 text-sm text-kwatch-text-secondary bg-kwatch-bg-primary rounded-md p-3">
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <span className="text-xs text-kwatch-text-muted">전체</span>
                      <div className="font-semibold text-kwatch-text-primary">{bulkResult.total}</div>
                    </div>
                    <div>
                      <span className="text-xs text-kwatch-text-muted">갱신</span>
                      <div className="font-semibold text-kwatch-status-normal">{bulkResult.updated}</div>
                    </div>
                    <div>
                      <span className="text-xs text-kwatch-text-muted">스킵</span>
                      <div className="font-semibold text-kwatch-text-secondary">{bulkResult.skipped}</div>
                    </div>
                    <div>
                      <span className="text-xs text-kwatch-text-muted">실패</span>
                      <div className={`font-semibold ${bulkResult.failed > 0 ? 'text-kwatch-status-critical' : 'text-kwatch-text-primary'}`}>{bulkResult.failed}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 베이스라인 자동 갱신 주기 */}
            <div className="border-t border-kwatch-bg-tertiary pt-6">
              <h3 className="text-sm font-medium text-kwatch-text-primary mb-2">
                베이스라인 자동 갱신 주기 (일)
              </h3>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  value={baselineScheduleDays}
                  onChange={(e) => setBaselineScheduleDays(Math.max(0, Math.min(365, parseInt(e.target.value) || 0)))}
                  min="0"
                  max="365"
                  className="w-24 px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
                />
                <div className="flex gap-2">
                  {[0, 7, 14, 30].map((val) => (
                    <button
                      key={val}
                      onClick={() => setBaselineScheduleDays(val)}
                      className={`px-3 py-1.5 rounded text-sm transition-colors ${
                        baselineScheduleDays === val
                          ? 'bg-kwatch-accent text-white'
                          : 'bg-kwatch-bg-primary border border-kwatch-bg-tertiary text-kwatch-text-secondary hover:bg-kwatch-bg-tertiary'
                      }`}
                    >
                      {val === 0 ? '비활성' : `${val}일`}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-kwatch-text-muted mt-2">
                0으로 설정하면 자동 갱신이 비활성화됩니다. 설정된 주기마다 새벽 4시에 자동으로 모든 베이스라인이 최신 스크린샷으로 교체됩니다.
              </p>
            </div>

            <button
              onClick={handleSaveBaselineSchedule}
              disabled={isSavingSchedule}
              className="px-6 py-2 bg-kwatch-accent hover:bg-kwatch-accent-hover disabled:opacity-50 text-white rounded-md font-medium transition-colors"
            >
              {isSavingSchedule ? '적용 중...' : '스케줄 적용'}
            </button>
          </div>
        </div>
      )}

      {/* 섹션 3: 알림 채널 설정 (admin 전용) */}
      {currentUser?.role?.toLowerCase() === 'admin' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-kwatch-text-primary">
              알림 채널 설정
            </h2>
            <button
              onClick={() => openChannelForm()}
              className="px-4 py-2 bg-kwatch-accent hover:bg-kwatch-accent-hover text-white rounded-md font-medium transition-colors text-sm"
            >
              + 채널 추가
            </button>
          </div>

          {/* 채널 추가/수정 폼 */}
          {showChannelForm && (
            <div className="bg-kwatch-bg-secondary rounded-lg border border-kwatch-accent p-6 space-y-4">
              <h3 className="text-lg font-semibold text-kwatch-text-primary">
                {editingChannel ? '채널 수정' : '채널 추가'}
              </h3>

              {/* 채널 유형 선택 (추가 시에만) */}
              {!editingChannel && (
                <div>
                  <label className="block text-sm font-medium text-kwatch-text-primary mb-2">채널 유형</label>
                  <div className="flex gap-2">
                    {(['EMAIL', 'SLACK', 'TELEGRAM'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setChannelFormType(type)}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                          channelFormType === type
                            ? 'bg-kwatch-accent text-white'
                            : 'bg-kwatch-bg-primary border border-kwatch-bg-tertiary text-kwatch-text-secondary hover:bg-kwatch-bg-tertiary'
                        }`}
                      >
                        {getChannelTypeLabel(type)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* EMAIL 폼 */}
              {channelFormType === 'EMAIL' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-kwatch-text-muted mb-1">SMTP 호스트 *</label>
                      <input
                        type="text"
                        value={channelFormEmail.smtpHost}
                        onChange={(e) => setChannelFormEmail({ ...channelFormEmail, smtpHost: e.target.value })}
                        placeholder="smtp.example.com"
                        className="w-full px-3 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-kwatch-text-muted mb-1">SMTP 포트 *</label>
                      <input
                        type="number"
                        value={channelFormEmail.smtpPort}
                        onChange={(e) => setChannelFormEmail({ ...channelFormEmail, smtpPort: parseInt(e.target.value) || 587 })}
                        placeholder="587"
                        className="w-full px-3 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-kwatch-text-muted mb-1">발신 주소 *</label>
                    <input
                      type="email"
                      value={channelFormEmail.from}
                      onChange={(e) => setChannelFormEmail({ ...channelFormEmail, from: e.target.value })}
                      placeholder="alerts@example.com"
                      className="w-full px-3 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-kwatch-text-muted mb-1">SMTP 사용자</label>
                      <input
                        type="text"
                        value={channelFormEmail.user}
                        onChange={(e) => setChannelFormEmail({ ...channelFormEmail, user: e.target.value })}
                        placeholder="(선택)"
                        className="w-full px-3 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-kwatch-text-muted mb-1">SMTP 비밀번호</label>
                      <input
                        type="password"
                        value={channelFormEmail.pass}
                        onChange={(e) => setChannelFormEmail({ ...channelFormEmail, pass: e.target.value })}
                        placeholder="(선택)"
                        className="w-full px-3 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-kwatch-text-muted mb-1">수신 주소 *</label>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={emailToInput}
                        onChange={(e) => setEmailToInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmailRecipient(); } }}
                        placeholder="recipient@example.com"
                        className="flex-1 px-3 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
                      />
                      <button
                        type="button"
                        onClick={addEmailRecipient}
                        className="px-3 py-2 bg-kwatch-bg-tertiary text-kwatch-text-primary rounded-md text-sm hover:bg-kwatch-accent hover:text-white transition-colors"
                      >
                        추가
                      </button>
                    </div>
                    {channelFormEmail.to.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {channelFormEmail.to.map((email) => (
                          <span key={email} className="inline-flex items-center gap-1 px-2 py-1 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded text-xs text-kwatch-text-secondary">
                            {email}
                            <button
                              type="button"
                              onClick={() => removeEmailRecipient(email)}
                              className="text-kwatch-text-muted hover:text-kwatch-status-critical ml-1"
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SLACK 폼 */}
              {channelFormType === 'SLACK' && (
                <div>
                  <label className="block text-xs text-kwatch-text-muted mb-1">Webhook URL *</label>
                  <input
                    type="text"
                    value={channelFormSlack.webhookUrl}
                    onChange={(e) => setChannelFormSlack({ webhookUrl: e.target.value })}
                    placeholder="https://hooks.slack.com/services/..."
                    className="w-full px-3 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
                  />
                </div>
              )}

              {/* TELEGRAM 폼 */}
              {channelFormType === 'TELEGRAM' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-kwatch-text-muted mb-1">Bot Token *</label>
                    <input
                      type="password"
                      value={channelFormTelegram.botToken}
                      onChange={(e) => setChannelFormTelegram({ ...channelFormTelegram, botToken: e.target.value })}
                      placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                      className="w-full px-3 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-kwatch-text-muted mb-1">Chat ID *</label>
                    <input
                      type="text"
                      value={channelFormTelegram.chatId}
                      onChange={(e) => setChannelFormTelegram({ ...channelFormTelegram, chatId: e.target.value })}
                      placeholder="-1001234567890"
                      className="w-full px-3 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
                    />
                  </div>
                </div>
              )}

              {/* 버튼 */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSaveChannel}
                  disabled={isSavingChannel}
                  className="px-6 py-2 bg-kwatch-accent hover:bg-kwatch-accent-hover disabled:opacity-50 text-white rounded-md font-medium transition-colors text-sm"
                >
                  {isSavingChannel ? '저장 중...' : (editingChannel ? '수정' : '추가')}
                </button>
                <button
                  onClick={closeChannelForm}
                  className="px-6 py-2 bg-kwatch-bg-tertiary hover:bg-kwatch-bg-primary text-kwatch-text-secondary rounded-md font-medium transition-colors text-sm"
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {!channelsLoaded ? (
            <div className="text-kwatch-text-muted">로딩 중...</div>
          ) : alertChannels.length === 0 && !showChannelForm ? (
            <div className="bg-kwatch-bg-secondary rounded-lg border border-kwatch-bg-tertiary p-6 text-center">
              <p className="text-kwatch-text-muted mb-3">
                설정된 알림 채널이 없습니다.
              </p>
              <button
                onClick={() => openChannelForm()}
                className="px-4 py-2 bg-kwatch-accent hover:bg-kwatch-accent-hover text-white rounded-md font-medium transition-colors text-sm"
              >
                + 채널 추가
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {alertChannels.map((channel) => {
                const emailConfig = channel.channelType === 'EMAIL' ? channel.config as EmailChannelConfig : null;
                const slackConfig = channel.channelType === 'SLACK' ? channel.config as SlackChannelConfig : null;
                const telegramConfig = channel.channelType === 'TELEGRAM' ? channel.config as TelegramChannelConfig : null;

                return (
                  <div
                    key={channel.id}
                    className={`bg-kwatch-bg-secondary rounded-lg border p-6 ${
                      channel.isActive ? 'border-kwatch-bg-tertiary' : 'border-kwatch-bg-tertiary opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-lg">
                            {channel.channelType === 'EMAIL' ? '\u2709' : channel.channelType === 'SLACK' ? '\u{1F4AC}' : '\u{1F4E8}'}
                          </span>
                          <h3 className="text-lg font-semibold text-kwatch-text-primary">
                            {getChannelTypeLabel(channel.channelType)}
                          </h3>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            channel.isActive
                              ? 'bg-kwatch-status-normal bg-opacity-20 text-kwatch-status-normal'
                              : 'bg-kwatch-bg-tertiary text-kwatch-text-muted'
                          }`}>
                            {channel.isActive ? '활성' : '비활성'}
                          </span>
                        </div>
                        <div className="text-sm text-kwatch-text-secondary space-y-1 ml-8">
                          {emailConfig && (
                            <>
                              <p>SMTP: {emailConfig.smtpHost}:{emailConfig.smtpPort}</p>
                              <p>발신: {emailConfig.from}</p>
                              <p>수신: {emailConfig.to?.join(', ') || '-'}</p>
                            </>
                          )}
                          {slackConfig && (
                            <p>Webhook URL: {slackConfig.webhookUrl ? `${slackConfig.webhookUrl.substring(0, 50)}...` : '-'}</p>
                          )}
                          {telegramConfig && (
                            <>
                              <p>Bot Token: {'*'.repeat(20)}</p>
                              <p>Chat ID: {telegramConfig.chatId}</p>
                            </>
                          )}
                        </div>

                        {/* 테스트 결과 */}
                        {testResults[channel.id] && (
                          <div className={`mt-2 ml-8 text-sm px-3 py-1.5 rounded ${
                            testResults[channel.id].success
                              ? 'bg-kwatch-status-normal bg-opacity-10 text-kwatch-status-normal'
                              : 'bg-kwatch-status-critical bg-opacity-10 text-kwatch-status-critical'
                          }`}>
                            {testResults[channel.id].success
                              ? '테스트 발송 성공'
                              : `테스트 실패: ${testResults[channel.id].error}`}
                          </div>
                        )}
                      </div>

                      {/* 우측 액션 */}
                      <div className="ml-4 flex flex-col items-end gap-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={channel.isActive}
                            onChange={() => handleChannelToggle(channel.id, channel.isActive)}
                            className="w-4 h-4"
                          />
                        </label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleTestChannel(channel.id, channel.channelType)}
                            disabled={isTestingChannel[channel.id] || !channel.isActive}
                            title={!channel.isActive ? '비활성 채널은 테스트할 수 없습니다' : '테스트 발송'}
                            className="p-1.5 text-kwatch-text-secondary hover:text-kwatch-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {isTestingChannel[channel.id] ? (
                              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25"/><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg>
                            ) : (
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                            )}
                          </button>
                          <button
                            onClick={() => openChannelForm(channel)}
                            title="수정"
                            className="p-1.5 text-kwatch-text-secondary hover:text-kwatch-accent transition-colors"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                          </button>
                          <button
                            onClick={() => handleDeleteChannel(channel.id)}
                            title="삭제"
                            className="p-1.5 text-kwatch-text-secondary hover:text-kwatch-status-critical transition-colors"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
              value={dashboardAutoRotate}
              onChange={(e) => setDashboardAutoRotate(Math.max(5, Math.min(120, parseInt(e.target.value) || 15)))}
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
              value={dashboardItemsPerPage}
              onChange={(e) => setDashboardItemsPerPage(Math.max(10, Math.min(100, parseInt(e.target.value) || 35)))}
              min="10"
              max="100"
              className="w-full max-w-xs px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
            />
            <p className="text-xs text-kwatch-text-muted mt-1">
              한 번에 표시할 웹사이트의 최대 개수입니다. (7x5 그리드 = 35개 권장)
            </p>
          </div>

          <button
            onClick={handleSaveDashboard}
            disabled={isSavingDashboard}
            className="px-6 py-2 bg-kwatch-accent hover:bg-kwatch-accent-hover disabled:opacity-50 text-white rounded-md font-medium transition-colors"
          >
            {isSavingDashboard ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {/* 섹션 3: 사용자 관리 (Admin만) */}
      {currentUser?.role?.toLowerCase() === 'admin' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-kwatch-text-primary">
              사용자 관리
            </h2>
            <button
              onClick={() => openUserForm()}
              className="px-4 py-2 bg-kwatch-accent hover:bg-kwatch-accent-hover text-white rounded-md font-medium transition-colors text-sm"
            >
              + 새 사용자 추가
            </button>
          </div>

          {/* 사용자 추가/수정 폼 */}
          {showUserForm && (
            <div className="bg-kwatch-bg-secondary rounded-lg border border-kwatch-accent p-6 space-y-4">
              <h3 className="text-lg font-semibold text-kwatch-text-primary">
                {editingUser ? '사용자 수정' : '사용자 추가'}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 사용자명 (추가 시만 편집 가능) */}
                <div>
                  <label className="block text-xs text-kwatch-text-muted mb-1">사용자명 *</label>
                  <input
                    type="text"
                    value={userForm.username}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                    disabled={!!editingUser}
                    placeholder="사용자명 (1~50자)"
                    className="w-full px-3 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-kwatch-accent disabled:opacity-50"
                  />
                </div>

                {/* 비밀번호 */}
                <div>
                  <label className="block text-xs text-kwatch-text-muted mb-1">
                    비밀번호 {editingUser ? '(변경 시에만 입력)' : '*'}
                  </label>
                  <input
                    type="password"
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    placeholder={editingUser ? '변경하지 않으려면 비워두세요' : '비밀번호 (6자 이상)'}
                    className="w-full px-3 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
                  />
                </div>

                {/* 이메일 */}
                <div>
                  <label className="block text-xs text-kwatch-text-muted mb-1">이메일</label>
                  <input
                    type="email"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    placeholder="email@example.com (선택)"
                    className="w-full px-3 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
                  />
                </div>

                {/* 역할 */}
                <div>
                  <label className="block text-xs text-kwatch-text-muted mb-1">역할 *</label>
                  <select
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                    className="w-full px-3 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
                  >
                    <option value="VIEWER">VIEWER</option>
                    <option value="ANALYST">ANALYST</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSaveUser}
                  disabled={isSavingUser}
                  className="px-6 py-2 bg-kwatch-accent hover:bg-kwatch-accent-hover disabled:opacity-50 text-white rounded-md font-medium transition-colors text-sm"
                >
                  {isSavingUser ? '저장 중...' : (editingUser ? '수정' : '추가')}
                </button>
                <button
                  onClick={closeUserForm}
                  className="px-6 py-2 bg-kwatch-bg-tertiary hover:bg-kwatch-bg-primary text-kwatch-text-secondary rounded-md font-medium transition-colors text-sm"
                >
                  취소
                </button>
              </div>
            </div>
          )}

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
                    관리
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
                  users.map((user) => {
                    const isAdmin = user.username.toLowerCase() === 'admin';
                    return (
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
                        <td className="px-6 py-3 text-sm">
                          <div className="flex gap-2">
                            <button
                              onClick={() => openUserForm(user)}
                              disabled={isAdmin}
                              title={isAdmin ? 'admin 계정은 수정할 수 없습니다' : '수정'}
                              className="p-1.5 text-kwatch-text-secondary hover:text-kwatch-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                            </button>
                            {!isAdmin && (
                              <button
                                onClick={() => handleDeleteUser(user.id)}
                                title="삭제"
                                className="p-1.5 text-kwatch-text-secondary hover:text-kwatch-status-critical transition-colors"
                              >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 섹션: 시스템 관리 */}
      {currentUser?.role?.toLowerCase() === 'admin' && (
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
