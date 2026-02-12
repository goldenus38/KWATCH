'use client';

import { redirect } from 'next/navigation';

export default function RootPage() {
  // Root page에서 대시보드로 리다이렉트
  redirect('/(dashboard)');
}
