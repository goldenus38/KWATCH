'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import type { Alert, AlertType, Severity, PaginationMeta } from '@/types';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<AlertType | ''>('');
  const [filterSeverity, setFilterSeverity] = useState<Severity | ''>('');
  const [filterAcknowledged, setFilterAcknowledged] = useState<'all' | 'unacked' | 'acked'>(
    'all'
  );
  const [pagination, setPagination] = useState<PaginationMeta>({
    total: 0,
    page: 1,
    limit: 50,
    totalPages: 1,
  });

  // 알림 목록 조회
  const fetchAlerts = async (page: number = 1) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '50');
      if (filterType) params.append('type', filterType);
      if (filterSeverity) params.append('severity', filterSeverity);
      if (filterAcknowledged === 'acked') params.append('acknowledged', 'true');
      else if (filterAcknowledged === 'unacked')
        params.append('acknowledged', 'false');

      const response = await api.get<Alert[]>(
        `/api/alerts?${params.toString()}`
      );

      if (response.success && response.data) {
        setAlerts(response.data);
        if (response.meta) {
          setPagination(response.meta);
        }
      } else {
        setError('알림 목록을 불러올 수 없습니다.');
      }
    } catch (err) {
      setError('서버 통신 중 오류가 발생했습니다.');
      console.error('Error fetching alerts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 알림 확인 처리
  const handleAcknowledge = async (alertId: string) => {
    setError(null);

    try {
      const response = await api.put(`/api/alerts/${alertId}/acknowledge`);

      if (response.success) {
        setSuccessMessage('알림이 확인되었습니다.');
        // 로컬 상태 업데이트
        setAlerts(
          alerts.map((alert) =>
            alert.id === alertId
              ? { ...alert, isAcknowledged: true }
              : alert
          )
        );
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError('알림 확인 처리에 실패했습니다.');
      }
    } catch (err) {
      setError('서버 통신 중 오류가 발생했습니다.');
      console.error('Error acknowledging alert:', err);
    }
  };

  // 초기 로드 및 필터 변경 시 새로고침
  useEffect(() => {
    fetchAlerts(1);
  }, [filterType, filterSeverity, filterAcknowledged]);

  const getSeverityBadgeColor = (severity: Severity) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-kwatch-status-critical text-white';
      case 'WARNING':
        return 'bg-kwatch-status-warning text-black';
      case 'INFO':
        return 'bg-kwatch-status-normal text-white';
      default:
        return 'bg-kwatch-status-unknown text-white';
    }
  };

  const getSeverityLabel = (severity: Severity) => {
    const labels: Record<Severity, string> = {
      CRITICAL: '심각',
      WARNING: '경고',
      INFO: '정보',
    };
    return labels[severity] || severity;
  };

  const getAlertTypeLabel = (type: AlertType) => {
    const labels: Record<AlertType, string> = {
      DOWN: '접속불가',
      SLOW: '응답지연',
      DEFACEMENT: '위변조',
      SSL_EXPIRY: 'SSL만료',
      RECOVERED: '복구',
    };
    return labels[type] || type;
  };

  return (
    <div className="space-y-6">
      {/* 페이지 제목 */}
      <h1 className="text-3xl font-bold">알림 이력</h1>

      {/* 성공 메시지 */}
      {successMessage && (
        <div className="p-4 bg-kwatch-status-normal bg-opacity-10 border border-kwatch-status-normal rounded-md text-kwatch-status-normal">
          {successMessage}
        </div>
      )}

      {/* 필터 */}
      <div className="bg-kwatch-bg-secondary rounded-lg border border-kwatch-bg-tertiary p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-sm font-medium text-kwatch-text-primary mb-1">
              알림 유형
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as AlertType | '')}
              className="w-full px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
            >
              <option value="">모든 유형</option>
              <option value="DOWN">접속불가</option>
              <option value="SLOW">응답지연</option>
              <option value="DEFACEMENT">위변조</option>
              <option value="SSL_EXPIRY">SSL만료</option>
              <option value="RECOVERED">복구</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-kwatch-text-primary mb-1">
              심각도
            </label>
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value as Severity | '')}
              className="w-full px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
            >
              <option value="">모든 심각도</option>
              <option value="CRITICAL">심각</option>
              <option value="WARNING">경고</option>
              <option value="INFO">정보</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-kwatch-text-primary mb-1">
              상태
            </label>
            <select
              value={filterAcknowledged}
              onChange={(e) =>
                setFilterAcknowledged(e.target.value as 'all' | 'unacked' | 'acked')
              }
              className="w-full px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
            >
              <option value="all">전체</option>
              <option value="unacked">미확인</option>
              <option value="acked">확인됨</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-kwatch-text-primary mb-1">
              &nbsp;
            </label>
            <button
              onClick={() => {
                setFilterType('');
                setFilterSeverity('');
                setFilterAcknowledged('all');
              }}
              className="w-full px-4 py-2 border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary hover:bg-kwatch-bg-tertiary transition-colors"
            >
              필터 초기화
            </button>
          </div>
        </div>
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="p-4 bg-kwatch-status-critical bg-opacity-10 border border-kwatch-status-critical rounded-md text-kwatch-status-critical">
          {error}
        </div>
      )}

      {/* 알림 테이블 */}
      <div className="bg-kwatch-bg-secondary rounded-lg overflow-hidden border border-kwatch-bg-tertiary">
        <table className="w-full">
          <thead className="border-b border-kwatch-bg-tertiary bg-kwatch-bg-tertiary">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                시간
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                기관명
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                사이트명
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                유형
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                심각도
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                메시지
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                관리
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center">
                  <div className="text-kwatch-text-muted">로딩 중...</div>
                </td>
              </tr>
            ) : alerts.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center">
                  <div className="text-kwatch-text-muted">알림이 없습니다.</div>
                </td>
              </tr>
            ) : (
              alerts.map((alert) => (
                <tr
                  key={alert.id}
                  className={`border-b border-kwatch-bg-tertiary hover:bg-kwatch-bg-primary transition-colors ${
                    alert.isAcknowledged ? 'opacity-60' : ''
                  }`}
                >
                  <td className="px-6 py-3 text-sm text-kwatch-text-secondary whitespace-nowrap">
                    {formatDateTime(alert.createdAt)}
                  </td>
                  <td className="px-6 py-3 text-sm text-kwatch-text-secondary max-w-[150px] truncate">
                    {alert.organizationName || '-'}
                  </td>
                  <td className="px-6 py-3 text-sm font-medium text-kwatch-text-primary max-w-xs truncate">
                    {alert.url ? (
                      <a
                        href={alert.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-kwatch-accent hover:text-kwatch-accent-hover hover:underline"
                      >
                        {alert.websiteName || '-'}
                      </a>
                    ) : (
                      alert.websiteName || '-'
                    )}
                  </td>
                  <td className="px-6 py-3 text-sm">
                    {getAlertTypeLabel(alert.alertType)}
                  </td>
                  <td className="px-6 py-3 text-sm">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${getSeverityBadgeColor(alert.severity)}`}
                    >
                      {getSeverityLabel(alert.severity)}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm text-kwatch-text-secondary truncate max-w-xs">
                    {alert.message}
                  </td>
                  <td className="px-6 py-3 text-sm">
                    {alert.isAcknowledged ? (
                      <span className="text-kwatch-text-muted">확인됨</span>
                    ) : (
                      <button
                        onClick={() => handleAcknowledge(alert.id)}
                        className="text-kwatch-accent hover:text-kwatch-accent-hover transition-colors font-medium"
                      >
                        확인
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-kwatch-text-muted">
          총 {pagination.total}개 중{' '}
          {(pagination.page - 1) * pagination.limit + 1}-
          {Math.min(pagination.page * pagination.limit, pagination.total)}개 표시
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fetchAlerts(pagination.page - 1)}
            disabled={pagination.page === 1}
            className="px-4 py-2 border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary hover:bg-kwatch-bg-tertiary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            이전
          </button>
          <div className="px-4 py-2 text-sm text-kwatch-text-primary">
            {pagination.page} / {pagination.totalPages}
          </div>
          <button
            onClick={() => fetchAlerts(pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages}
            className="px-4 py-2 border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary hover:bg-kwatch-bg-tertiary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            다음
          </button>
        </div>
      </div>
    </div>
  );
}
