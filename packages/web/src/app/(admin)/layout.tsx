'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import type { User } from '@/types';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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
    { label: '카테고리', href: '/categories' },
    { label: '알림 이력', href: '/alerts' },
    { label: '시스템 설정', href: '/settings' },
  ];

  return (
    <div className="h-screen bg-kwatch-bg-primary text-kwatch-text-primary flex flex-col">
      {/* 상단 헤더 */}
      <header className="border-b border-kwatch-bg-tertiary bg-kwatch-bg-secondary px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-kwatch-bg-tertiary rounded-md transition-colors"
            aria-label="Toggle sidebar"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <h1 className="text-2xl font-bold">KWATCH 관리</h1>
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

      {/* 메인 콘텐츠 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 사이드바 */}
        <aside
          className={`bg-kwatch-bg-secondary border-r border-kwatch-bg-tertiary transition-all duration-300 overflow-y-auto ${
            isSidebarOpen ? 'w-64' : 'w-0'
          }`}
        >
          <nav className="p-4 space-y-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-4 py-3 rounded-md transition-colors ${
                    isActive
                      ? 'bg-kwatch-accent text-white font-medium'
                      : 'text-kwatch-text-secondary hover:bg-kwatch-bg-tertiary hover:text-kwatch-text-primary'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* 대시보드로 돌아가기 */}
          <div className="p-4 border-t border-kwatch-bg-tertiary mt-4">
            <Link
              href="/"
              className="flex items-center gap-2 px-4 py-3 rounded-md bg-kwatch-accent hover:bg-kwatch-accent-hover text-white font-medium transition-colors"
            >
              <svg
                className="w-4 h-4"
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
              대시보드로 돌아가기
            </Link>
          </div>
        </aside>

        {/* 콘텐츠 영역 */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">{user ? children : null}</div>
        </main>
      </div>
    </div>
  );
}
