'use client';

import { ReactNode } from 'react';
import Link from 'next/link';

interface HeaderProps {
  title: string;
  children?: ReactNode;
  breadcrumbs?: Array<{
    label: string;
    href?: string;
  }>;
}

/**
 * 관리 페이지 공통 헤더
 * 페이지 제목, 브레드크럼 네비게이션 제공
 */
export function Header({ title, breadcrumbs, children }: HeaderProps) {
  return (
    <div className="bg-kwatch-bg-secondary border-b border-kwatch-bg-tertiary">
      <div className="px-6 py-6">
        {/* 브레드크럼 네비게이션 */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-2 mb-4 text-dashboard-sm text-kwatch-text-secondary">
            <Link
              href="/dashboard"
              className="hover:text-kwatch-text-primary transition-colors"
            >
              대시보드
            </Link>
            {breadcrumbs.map((crumb, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-kwatch-text-muted">/</span>
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="hover:text-kwatch-text-primary transition-colors"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span>{crumb.label}</span>
                )}
              </div>
            ))}
          </nav>
        )}

        {/* 제목 및 액션 */}
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-dashboard-2xl font-bold text-kwatch-text-primary">
            {title}
          </h1>
          {children && <div className="flex items-center gap-2">{children}</div>}
        </div>
      </div>
    </div>
  );
}
