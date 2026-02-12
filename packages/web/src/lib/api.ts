import { API_BASE_URL } from './constants';
import type { ApiResponse } from '@/types';

const DEFAULT_TIMEOUT = 30000; // 30초

/**
 * API 클라이언트 - fetch 래퍼
 * - 요청 타임아웃 (기본 30초)
 * - 401 응답 시 자동 로그아웃 처리
 * - 통일된 에러 포맷 반환
 */
class ApiClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string, timeout = DEFAULT_TIMEOUT) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    // 클라이언트 사이드에서만 토큰 접근
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('kwatch_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  /**
   * 401 Unauthorized 응답 처리
   * 토큰이 만료되었거나 유효하지 않으면 로그아웃 후 로그인 페이지로 리다이렉트
   */
  private handleUnauthorized(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('kwatch_token');
      localStorage.removeItem('kwatch_user');

      // 이미 로그인 페이지면 리다이렉트 하지 않음
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
  }

  /**
   * 공통 fetch 래퍼 (타임아웃 + 에러 처리)
   */
  private async request<T>(
    path: string,
    options: RequestInit,
  ): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // 401 Unauthorized 처리
      if (response.status === 401) {
        // 로그인 API는 제외 (잘못된 비밀번호 등)
        if (!path.includes('/auth/login')) {
          this.handleUnauthorized();
        }
      }

      if (!response.ok) {
        try {
          return await response.json();
        } catch {
          return {
            success: false,
            error: { code: 'HTTP_ERROR', message: `HTTP ${response.status}` },
          };
        }
      }

      return response.json();
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof DOMException && err.name === 'AbortError') {
        return {
          success: false,
          error: { code: 'TIMEOUT', message: '요청 시간이 초과되었습니다.' },
        };
      }

      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : '네트워크 오류가 발생했습니다.',
        },
      };
    }
  }

  async get<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>(path, { method: 'GET' });
  }

  async post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

// 싱글턴 API 클라이언트 인스턴스
export const api = new ApiClient(API_BASE_URL);
