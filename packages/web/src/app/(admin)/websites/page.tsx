'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { Website, Category, PaginationMeta } from '@/types';

interface WebsiteFormData {
  url: string;
  name: string;
  organizationName: string;
  categoryId: string;
  description: string;
  checkIntervalSeconds: number;
  timeoutSeconds: number;
}

export default function WebsitesPage() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [pagination, setPagination] = useState<PaginationMeta>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });

  const [showModal, setShowModal] = useState(false);
  const [editingWebsite, setEditingWebsite] = useState<Website | null>(null);
  const [formData, setFormData] = useState<WebsiteFormData>({
    url: '',
    name: '',
    organizationName: '',
    categoryId: '',
    description: '',
    checkIntervalSeconds: 300,
    timeoutSeconds: 30,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 웹사이트 목록 조회
  const fetchWebsites = async (page: number = 1) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '20');
      if (searchQuery) params.append('search', searchQuery);
      if (selectedCategory) params.append('categoryId', selectedCategory);

      const response = await api.get<Website[]>(
        `/api/websites?${params.toString()}`
      );

      if (response.success && response.data) {
        setWebsites(response.data);
        if (response.meta) {
          setPagination(response.meta);
        }
      } else {
        setError('웹사이트 목록을 불러올 수 없습니다.');
      }
    } catch (err) {
      setError('서버 통신 중 오류가 발생했습니다.');
      console.error('Error fetching websites:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 카테고리 목록 조회
  const fetchCategories = async () => {
    try {
      const response = await api.get<Category[]>('/api/categories');
      if (response.success && response.data) {
        setCategories(response.data);
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  // 웹사이트 추가
  const handleAddWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.url.trim() || !formData.name.trim()) {
      setError('URL과 웹사이트명은 필수입니다.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        url: formData.url,
        name: formData.name,
        organizationName: formData.organizationName || null,
        categoryId: formData.categoryId ? parseInt(formData.categoryId) : null,
        description: formData.description || null,
        checkIntervalSeconds: formData.checkIntervalSeconds,
        timeoutSeconds: formData.timeoutSeconds,
      };

      const response = await api.post<Website>('/api/websites', payload);

      if (response.success && response.data) {
        setSuccessMessage('웹사이트가 추가되었습니다.');
        setShowModal(false);
        resetForm();
        fetchWebsites(1);
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError('웹사이트 추가에 실패했습니다.');
      }
    } catch (err) {
      setError('서버 통신 중 오류가 발생했습니다.');
      console.error('Error adding website:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 웹사이트 수정
  const handleEditWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWebsite || !formData.url.trim() || !formData.name.trim()) {
      setError('URL과 웹사이트명은 필수입니다.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        url: formData.url,
        name: formData.name,
        organizationName: formData.organizationName || null,
        categoryId: formData.categoryId ? parseInt(formData.categoryId) : null,
        description: formData.description || null,
        checkIntervalSeconds: formData.checkIntervalSeconds,
        timeoutSeconds: formData.timeoutSeconds,
      };

      const response = await api.put<Website>(
        `/api/websites/${editingWebsite.id}`,
        payload
      );

      if (response.success && response.data) {
        setSuccessMessage('웹사이트가 수정되었습니다.');
        setShowModal(false);
        resetForm();
        fetchWebsites(pagination.page);
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError('웹사이트 수정에 실패했습니다.');
      }
    } catch (err) {
      setError('서버 통신 중 오류가 발생했습니다.');
      console.error('Error editing website:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 웹사이트 삭제
  const handleDeleteWebsite = async (id: number) => {
    if (
      !confirm(
        '이 웹사이트를 삭제하시겠습니까? 관련된 모든 데이터가 삭제됩니다.'
      )
    ) {
      return;
    }

    setError(null);

    try {
      const response = await api.delete(`/api/websites/${id}`);

      if (response.success) {
        setSuccessMessage('웹사이트가 삭제되었습니다.');
        fetchWebsites(pagination.page);
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError('웹사이트 삭제에 실패했습니다.');
      }
    } catch (err) {
      setError('서버 통신 중 오류가 발생했습니다.');
      console.error('Error deleting website:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      url: '',
      name: '',
      organizationName: '',
      categoryId: '',
      description: '',
      checkIntervalSeconds: 300,
      timeoutSeconds: 30,
    });
    setEditingWebsite(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (website: Website) => {
    setEditingWebsite(website);
    setFormData({
      url: website.url,
      name: website.name,
      organizationName: website.organizationName || '',
      categoryId: website.categoryId ? website.categoryId.toString() : '',
      description: website.description || '',
      checkIntervalSeconds: website.checkIntervalSeconds,
      timeoutSeconds: website.timeoutSeconds,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
    setError(null);
  };

  // 초기 로드
  useEffect(() => {
    fetchCategories();
  }, []);

  // 검색/필터 변경 시 첫 페이지부터 조회
  useEffect(() => {
    fetchWebsites(1);
  }, [searchQuery, selectedCategory]);

  const getStatusBadgeColor = (isActive: boolean) => {
    return isActive
      ? 'bg-kwatch-status-normal text-white'
      : 'bg-kwatch-status-unknown text-white';
  };

  const getStatusLabel = (isActive: boolean) => {
    return isActive ? '활성' : '비활성';
  };

  return (
    <div className="space-y-6">
      {/* 페이지 제목 */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">웹사이트 관리</h1>
        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-kwatch-accent hover:bg-kwatch-accent-hover text-white rounded-md font-medium transition-colors"
        >
          + 추가
        </button>
      </div>

      {/* 성공 메시지 */}
      {successMessage && (
        <div className="p-4 bg-kwatch-status-normal bg-opacity-10 border border-kwatch-status-normal rounded-md text-kwatch-status-normal">
          {successMessage}
        </div>
      )}

      {/* 검색 및 필터 */}
      <div className="flex gap-4 flex-wrap">
        <input
          type="text"
          placeholder="웹사이트 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-[200px] px-4 py-2 bg-kwatch-bg-secondary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary placeholder-kwatch-text-muted focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
        />
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-4 py-2 bg-kwatch-bg-secondary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
        >
          <option value="">모든 카테고리</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id.toString()}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="p-4 bg-kwatch-status-critical bg-opacity-10 border border-kwatch-status-critical rounded-md text-kwatch-status-critical">
          {error}
        </div>
      )}

      {/* 웹사이트 테이블 */}
      <div className="bg-kwatch-bg-secondary rounded-lg overflow-hidden border border-kwatch-bg-tertiary">
        <table className="w-full">
          <thead className="border-b border-kwatch-bg-tertiary bg-kwatch-bg-tertiary">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                카테고리
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                기관명
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                사이트명
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                URL
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                점검주기(초)
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                상태
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                액션
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
            ) : websites.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center">
                  <div className="text-kwatch-text-muted">등록된 웹사이트가 없습니다.</div>
                </td>
              </tr>
            ) : (
              websites.map((website) => (
                <tr
                  key={website.id}
                  className="border-b border-kwatch-bg-tertiary hover:bg-kwatch-bg-primary transition-colors"
                >
                  <td className="px-6 py-3 text-sm text-kwatch-text-secondary">
                    {website.category?.name || '-'}
                  </td>
                  <td className="px-6 py-3 text-sm text-kwatch-text-secondary">
                    {website.organizationName || '-'}
                  </td>
                  <td className="px-6 py-3 text-sm font-medium">{website.name}</td>
                  <td className="px-6 py-3 text-sm text-kwatch-text-secondary truncate max-w-xs">
                    {website.url}
                  </td>
                  <td className="px-6 py-3 text-sm text-kwatch-text-secondary">
                    {website.checkIntervalSeconds}
                  </td>
                  <td className="px-6 py-3 text-sm">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(website.isActive)}`}
                    >
                      {getStatusLabel(website.isActive)}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm space-x-2">
                    <button
                      onClick={() => openEditModal(website)}
                      className="text-kwatch-accent hover:text-kwatch-accent-hover transition-colors"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDeleteWebsite(website.id)}
                      className="text-kwatch-status-critical hover:opacity-80 transition-opacity"
                    >
                      삭제
                    </button>
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
            onClick={() => fetchWebsites(pagination.page - 1)}
            disabled={pagination.page === 1}
            className="px-4 py-2 border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary hover:bg-kwatch-bg-tertiary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            이전
          </button>
          <div className="px-4 py-2 text-sm text-kwatch-text-primary">
            {pagination.page} / {pagination.totalPages}
          </div>
          <button
            onClick={() => fetchWebsites(pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages}
            className="px-4 py-2 border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary hover:bg-kwatch-bg-tertiary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            다음
          </button>
        </div>
      </div>

      {/* 웹사이트 추가/수정 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-kwatch-bg-secondary rounded-lg border border-kwatch-bg-tertiary w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-kwatch-bg-tertiary flex items-center justify-between sticky top-0 bg-kwatch-bg-secondary">
              <h2 className="text-2xl font-bold">
                {editingWebsite ? '웹사이트 수정' : '웹사이트 추가'}
              </h2>
              <button
                onClick={closeModal}
                className="p-1 hover:bg-kwatch-bg-tertiary rounded-md transition-colors"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <form
              onSubmit={editingWebsite ? handleEditWebsite : handleAddWebsite}
              className="p-6 space-y-4"
            >
              {error && (
                <div className="p-3 bg-kwatch-status-critical bg-opacity-10 border border-kwatch-status-critical rounded-md text-kwatch-status-critical text-sm">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-kwatch-text-primary mb-1">
                    URL <span className="text-kwatch-status-critical">*</span>
                  </label>
                  <input
                    type="url"
                    value={formData.url}
                    onChange={(e) =>
                      setFormData({ ...formData, url: e.target.value })
                    }
                    disabled={isSubmitting}
                    className="w-full px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary placeholder-kwatch-text-muted focus:outline-none focus:ring-2 focus:ring-kwatch-accent disabled:opacity-50"
                    placeholder="https://example.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-kwatch-text-primary mb-1">
                    웹사이트명 <span className="text-kwatch-status-critical">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    disabled={isSubmitting}
                    className="w-full px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary placeholder-kwatch-text-muted focus:outline-none focus:ring-2 focus:ring-kwatch-accent disabled:opacity-50"
                    placeholder="웹사이트명"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-kwatch-text-primary mb-1">
                    기관명
                  </label>
                  <input
                    type="text"
                    value={formData.organizationName}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        organizationName: e.target.value,
                      })
                    }
                    disabled={isSubmitting}
                    className="w-full px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary placeholder-kwatch-text-muted focus:outline-none focus:ring-2 focus:ring-kwatch-accent disabled:opacity-50"
                    placeholder="기관명"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-kwatch-text-primary mb-1">
                    카테고리
                  </label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) =>
                      setFormData({ ...formData, categoryId: e.target.value })
                    }
                    disabled={isSubmitting}
                    className="w-full px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary focus:outline-none focus:ring-2 focus:ring-kwatch-accent disabled:opacity-50"
                  >
                    <option value="">카테고리 선택</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id.toString()}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-kwatch-text-primary mb-1">
                    점검주기 (초)
                  </label>
                  <input
                    type="number"
                    value={formData.checkIntervalSeconds}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        checkIntervalSeconds: parseInt(e.target.value),
                      })
                    }
                    disabled={isSubmitting}
                    className="w-full px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary placeholder-kwatch-text-muted focus:outline-none focus:ring-2 focus:ring-kwatch-accent disabled:opacity-50"
                    min="1"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-kwatch-text-primary mb-1">
                    타임아웃 (초)
                  </label>
                  <input
                    type="number"
                    value={formData.timeoutSeconds}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        timeoutSeconds: parseInt(e.target.value),
                      })
                    }
                    disabled={isSubmitting}
                    className="w-full px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary placeholder-kwatch-text-muted focus:outline-none focus:ring-2 focus:ring-kwatch-accent disabled:opacity-50"
                    min="1"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-kwatch-text-primary mb-1">
                  설명
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  disabled={isSubmitting}
                  className="w-full px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary placeholder-kwatch-text-muted focus:outline-none focus:ring-2 focus:ring-kwatch-accent disabled:opacity-50"
                  placeholder="웹사이트 설명"
                  rows={4}
                />
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t border-kwatch-bg-tertiary">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isSubmitting}
                  className="px-6 py-2 border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary hover:bg-kwatch-bg-tertiary transition-colors disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-kwatch-accent hover:bg-kwatch-accent-hover text-white rounded-md font-medium transition-colors disabled:opacity-50"
                >
                  {isSubmitting
                    ? '저장 중...'
                    : editingWebsite
                    ? '수정'
                    : '추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
