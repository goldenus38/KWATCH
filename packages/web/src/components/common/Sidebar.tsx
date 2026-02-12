'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface SidebarProps {
  currentPath?: string;
}

/**
 * 관리 페이지 사이드바 네비게이션
 * 축소/확장 상태, 활성 링크 강조, Dark Theme 스타일 적용
 */
export function Sidebar({ currentPath }: SidebarProps) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const activePathname = currentPath || pathname;

  const navItems = [
    {
      label: '대시보드',
      href: '/dashboard',
      icon: '📊',
    },
    {
      label: '웹사이트 관리',
      href: '/admin/websites',
      icon: '🌐',
    },
    {
      label: '카테고리',
      href: '/admin/categories',
      icon: '📁',
    },
    {
      label: '알림 이력',
      href: '/admin/alerts',
      icon: '🔔',
    },
    {
      label: '시스템 설정',
      href: '/admin/settings',
      icon: '⚙️',
    },
  ];

  return (
    <div
      className={cn(
        'bg-kwatch-bg-secondary border-r border-kwatch-bg-tertiary h-screen transition-all duration-300 flex flex-col',
        isCollapsed ? 'w-20' : 'w-64',
      )}
    >
      {/* 헤더 */}
      <div className="px-4 py-6 border-b border-kwatch-bg-tertiary flex items-center justify-between gap-3">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <div className="text-2xl">🔒</div>
            <div className="font-bold text-kwatch-text-primary">KWATCH</div>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-2 hover:bg-kwatch-bg-tertiary rounded transition-colors text-kwatch-text-secondary hover:text-kwatch-text-primary flex-shrink-0"
          aria-label={isCollapsed ? '확장' : '축소'}
        >
          {isCollapsed ? '→' : '←'}
        </button>
      </div>

      {/* 네비게이션 메뉴 */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activePathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-3 rounded-lg transition-colors',
                'text-dashboard-sm font-medium',
                isActive
                  ? 'bg-kwatch-accent/20 text-kwatch-accent border border-kwatch-accent/30'
                  : 'text-kwatch-text-secondary hover:bg-kwatch-bg-tertiary hover:text-kwatch-text-primary',
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <span className="flex-shrink-0 text-lg">{item.icon}</span>
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* 푸터 */}
      <div className="border-t border-kwatch-bg-tertiary px-4 py-4 text-dashboard-xs text-kwatch-text-muted">
        {!isCollapsed && (
          <div className="space-y-2">
            <div className="text-xs">버전 1.0.0</div>
            <div className="text-xs">
              © 2024 KWATCH
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
