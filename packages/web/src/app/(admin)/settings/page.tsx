'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { AlertChannel, User } from '@/types';

export default function SettingsPage() {
  const [alertChannels, setAlertChannels] = useState<AlertChannel[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

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

  // 초기 로드
  useEffect(() => {
    fetchAlertChannels();
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

      {/* 섹션 1: 알림 채널 설정 */}
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

          <button className="px-6 py-2 bg-kwatch-accent hover:bg-kwatch-accent-hover text-white rounded-md font-medium transition-colors">
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
                        <button className="text-kwatch-accent hover:text-kwatch-accent-hover transition-colors">
                          수정
                        </button>
                        <button className="text-kwatch-status-critical hover:opacity-80 transition-opacity">
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <button className="px-6 py-2 bg-kwatch-accent hover:bg-kwatch-accent-hover text-white rounded-md font-medium transition-colors">
            + 새 사용자 추가
          </button>
        </div>
      )}

      {/* TODO: 모니터링 설정 (기본 체크 간격, 타임아웃 등) */}
      {/* TODO: 위변조 탐지 설정 (임계값, 연속 감지 횟수 등) */}
      {/* TODO: 데이터 보관 정책 설정 */}
      {/* TODO: 백업 및 복원 */}
    </div>
  );
}
