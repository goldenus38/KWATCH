'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { KwatchLogo } from '@/components/common/KwatchLogo';
import type { User } from '@/types';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  // 로그인한 사용자 정보 로드 + 인증 가드
  useEffect(() => {
    const token = localStorage.getItem('kwatch_token');
    const userJson = localStorage.getItem('kwatch_user');

    if (!token || !userJson) {
      router.push('/login');
      return;
    }

    try {
      setUser(JSON.parse(userJson));
    } catch (err) {
      console.error('Failed to parse user:', err);
      router.push('/login');
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('kwatch_token');
    localStorage.removeItem('kwatch_user');
    router.push('/login');
  };

  const navItems = [
    { label: '웹사이트 관리', href: '/websites' },
    { label: '분류', href: '/categories' },
    { label: '알림 이력', href: '/alerts' },
    { label: '시스템 설정', href: '/settings' },
  ];

  return (
    <div className="h-screen bg-kwatch-bg-primary text-kwatch-text-primary flex flex-col">
      {/* 상단 헤더 */}
      <header className="flex-shrink-0 border-b border-kwatch-bg-tertiary bg-kwatch-bg-secondary px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* 대시보드로 돌아가기 */}
          <Link
            href="/"
            className="p-2 rounded-lg text-kwatch-text-secondary hover:text-kwatch-text-primary hover:bg-kwatch-bg-tertiary transition-colors"
            title="대시보드로 돌아가기"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
          </Link>
          <KwatchLogo size="sm" />
        </div>

        {/* 사용자 정보 및 로그아웃 */}
        <div className="flex items-center gap-4">
          {user && (
            <div className="text-sm">
              <p className="text-kwatch-text-primary">{user.username}</p>
              <p className="text-kwatch-text-muted text-xs">{user.role}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-kwatch-status-critical hover:opacity-90 text-white rounded-md text-sm font-medium transition-opacity"
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* 상단 탭 네비게이션 */}
      <nav className="flex-shrink-0 bg-kwatch-bg-secondary border-b border-kwatch-bg-tertiary px-6">
        <div className="flex gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-kwatch-accent text-kwatch-accent'
                    : 'border-transparent text-kwatch-text-secondary hover:text-kwatch-text-primary hover:border-kwatch-bg-tertiary'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* 콘텐츠 영역 - 전체 너비 활용 */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">{user ? children : null}</div>
      </main>
    </div>
  );
}
