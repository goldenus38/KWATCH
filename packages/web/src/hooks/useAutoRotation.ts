'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DEFAULT_AUTO_ROTATE_INTERVAL } from '@/lib/constants';

interface UseAutoRotationOptions {
  totalPages: number;
  interval?: number;
  enabled?: boolean;
  paused?: boolean;
}

interface UseAutoRotationReturn {
  currentPage: number;
  setCurrentPage: (page: number) => void;
  isRotating: boolean;
  toggleRotation: () => void;
  startRotation: () => void;
  stopRotation: () => void;
}

/**
 * 자동 페이지 로테이션 훅
 * 관제실 전광판에서 페이지를 자동으로 전환
 *
 * currentPage는 0-indexed로 반환됩니다.
 */
export function useAutoRotation(
  options: UseAutoRotationOptions,
): UseAutoRotationReturn {
  const {
    totalPages,
    interval = DEFAULT_AUTO_ROTATE_INTERVAL,
    enabled = true,
    paused = false,
  } = options;

  const [currentPage, setCurrentPage] = useState(0);
  const [isRotating, setIsRotating] = useState(enabled);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 최신 값을 ref에 보관하여 콜백 안정성 확보
  const totalPagesRef = useRef(totalPages);
  const intervalRef = useRef(interval);

  useEffect(() => {
    totalPagesRef.current = totalPages;
  }, [totalPages]);

  useEffect(() => {
    intervalRef.current = interval;
  }, [interval]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRotation = useCallback(() => {
    clearTimer();
    setIsRotating(true);

    timerRef.current = setInterval(() => {
      setCurrentPage((prev) => (prev + 1) % Math.max(totalPagesRef.current, 1));
    }, intervalRef.current);
  }, [clearTimer]);

  const stopRotation = useCallback(() => {
    clearTimer();
    setIsRotating(false);
  }, [clearTimer]);

  const toggleRotation = useCallback(() => {
    setIsRotating((prev) => {
      if (prev) {
        clearTimer();
        return false;
      }
      return true; // effect에서 실제 타이머 시작
    });
  }, [clearTimer]);

  // isRotating 또는 totalPages 변경 시 타이머 관리
  useEffect(() => {
    if (isRotating && totalPages > 1 && !paused) {
      clearTimer();
      timerRef.current = setInterval(() => {
        setCurrentPage((prev) => (prev + 1) % Math.max(totalPages, 1));
      }, interval);
    } else {
      clearTimer();
    }

    return () => {
      clearTimer();
    };
  }, [isRotating, totalPages, interval, paused, clearTimer]);

  // totalPages 변경 시 현재 페이지가 범위를 벗어나면 초기화
  useEffect(() => {
    if (totalPages > 0 && currentPage >= totalPages) {
      setCurrentPage(0);
    }
  }, [totalPages, currentPage]);

  return {
    currentPage,
    setCurrentPage,
    isRotating,
    toggleRotation,
    startRotation,
    stopRotation,
  };
}
