'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { KwatchLogo } from '@/components/common/KwatchLogo';
import type { LoginCredentials, User } from '@/types';

export default function LoginPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<LoginCredentials>({
    username: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.currentTarget;
    setCredentials((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await api.post<{ token: string; user: User }>(
        '/api/auth/login',
        credentials
      );

      if (response.success && response.data) {
        // 토큰 저장
        localStorage.setItem('kwatch_token', response.data.token);
        localStorage.setItem('kwatch_user', JSON.stringify(response.data.user));

        // 대시보드로 이동
        router.push('/');
      } else {
        setError(response.error?.message || '로그인에 실패했습니다.');
      }
    } catch (err) {
      setError('서버와의 통신 중 오류가 발생했습니다.');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-kwatch-bg-primary px-4">
      <div className="w-full max-w-md">
        <div className="bg-kwatch-bg-secondary rounded-lg shadow-lg p-8 border border-kwatch-bg-tertiary">
          {/* 로고 / 제목 */}
          <div className="flex justify-center mb-8">
            <KwatchLogo size="lg" />
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="mb-6 p-3 bg-kwatch-status-critical bg-opacity-10 border border-kwatch-status-critical rounded text-kwatch-status-critical text-sm">
              {error}
            </div>
          )}

          {/* 로그인 폼 */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 사용자명 입력 */}
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-kwatch-text-primary mb-1"
              >
                사용자명
              </label>
              <input
                id="username"
                name="username"
                type="text"
                value={credentials.username}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary placeholder-kwatch-text-muted focus:outline-none focus:ring-2 focus:ring-kwatch-accent focus:border-transparent"
                placeholder="사용자명 입력"
                disabled={isLoading}
              />
            </div>

            {/* 비밀번호 입력 */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-kwatch-text-primary mb-1"
              >
                비밀번호
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={credentials.password}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary placeholder-kwatch-text-muted focus:outline-none focus:ring-2 focus:ring-kwatch-accent focus:border-transparent"
                placeholder="비밀번호 입력"
                disabled={isLoading}
              />
            </div>

            {/* 로그인 버튼 */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2 px-4 bg-kwatch-accent hover:bg-kwatch-accent-hover text-white font-medium rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '로그인 중...' : '로그인'}
            </button>
          </form>

          {/* 안내문 */}
          <div className="mt-6 text-center text-xs text-kwatch-text-muted">
            <p>웹사이트 관제 시스템에 로그인하세요.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
