'use client';

import { useEffect, useState, useCallback } from 'react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [kioskMode, setKioskMode] = useState(false);

  const toggleKiosk = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setKioskMode(true);
      } else {
        await document.exitFullscreen();
        setKioskMode(false);
      }
    } catch (err) {
      console.error('Fullscreen toggle failed:', err);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        toggleKiosk();
      }
    };

    // Sync state when exiting fullscreen via Esc key
    const handleFullscreenChange = () => {
      setKioskMode(!!document.fullscreenElement);
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [toggleKiosk]);

  return (
    <div
      className={`w-full h-screen bg-kwatch-bg-primary text-kwatch-text-primary flex flex-col ${kioskMode ? 'kiosk-mode' : ''}`}
    >
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
