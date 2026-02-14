'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { Category } from '@/types';

interface CategoryFormData {
  name: string;
  description: string;
  sortOrder: number;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState<CategoryFormData>({
    name: '',
    description: '',
    sortOrder: 0,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 카테고리 목록 조회
  const fetchCategories = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.get<Category[]>('/api/categories');

      if (response.success && response.data) {
        setCategories(response.data);
      } else {
        setError('분류 목록을 불러올 수 없습니다.');
      }
    } catch (err) {
      setError('서버 통신 중 오류가 발생했습니다.');
      console.error('Error fetching categories:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 카테고리 추가
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('분류명은 필수입니다.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        name: formData.name,
        description: formData.description || null,
        sortOrder: formData.sortOrder,
      };

      const response = await api.post<Category>('/api/categories', payload);

      if (response.success && response.data) {
        setSuccessMessage('분류가 추가되었습니다.');
        setShowModal(false);
        resetForm();
        fetchCategories();
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError('분류 추가에 실패했습니다.');
      }
    } catch (err) {
      setError('서버 통신 중 오류가 발생했습니다.');
      console.error('Error adding category:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 카테고리 수정
  const handleEditCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !formData.name.trim()) {
      setError('분류명은 필수입니다.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        name: formData.name,
        description: formData.description || null,
        sortOrder: formData.sortOrder,
      };

      const response = await api.put<Category>(
        `/api/categories/${editingCategory.id}`,
        payload
      );

      if (response.success && response.data) {
        setSuccessMessage('분류가 수정되었습니다.');
        setShowModal(false);
        resetForm();
        fetchCategories();
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError('분류 수정에 실패했습니다.');
      }
    } catch (err) {
      setError('서버 통신 중 오류가 발생했습니다.');
      console.error('Error editing category:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 카테고리 삭제
  const handleDeleteCategory = async (id: number) => {
    if (!confirm('이 분류를 삭제하시겠습니까?')) {
      return;
    }

    setError(null);

    try {
      const response = await api.delete(`/api/categories/${id}`);

      if (response.success) {
        setSuccessMessage('분류가 삭제되었습니다.');
        fetchCategories();
        setTimeout(() => setSuccessMessage(null), 3000);
      } else if (response.error?.code === 'CATEGORY_HAS_WEBSITES') {
        setError(
          '이 분류에 속한 웹사이트가 있어서 삭제할 수 없습니다. 먼저 웹사이트를 다른 분류로 이동하세요.'
        );
      } else {
        setError('분류 삭제에 실패했습니다.');
      }
    } catch (err) {
      setError('서버 통신 중 오류가 발생했습니다.');
      console.error('Error deleting category:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      sortOrder: 0,
    });
    setEditingCategory(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || '',
      sortOrder: category.sortOrder,
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

  return (
    <div className="space-y-6">
      {/* 페이지 제목 */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">분류 관리</h1>
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

      {/* 에러 메시지 */}
      {error && (
        <div className="p-4 bg-kwatch-status-critical bg-opacity-10 border border-kwatch-status-critical rounded-md text-kwatch-status-critical">
          {error}
        </div>
      )}

      {/* 카테고리 테이블 */}
      <div className="bg-kwatch-bg-secondary rounded-lg overflow-hidden border border-kwatch-bg-tertiary">
        <table className="w-full">
          <thead className="border-b border-kwatch-bg-tertiary bg-kwatch-bg-tertiary">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                이름
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                설명
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                정렬순서
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                웹사이트 수
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary">
                액션
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center">
                  <div className="text-kwatch-text-muted">로딩 중...</div>
                </td>
              </tr>
            ) : categories.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center">
                  <div className="text-kwatch-text-muted">
                    등록된 분류가 없습니다.
                  </div>
                </td>
              </tr>
            ) : (
              categories.map((category) => (
                <tr
                  key={category.id}
                  className="border-b border-kwatch-bg-tertiary hover:bg-kwatch-bg-primary transition-colors"
                >
                  <td className="px-6 py-3 text-sm font-medium">
                    {category.name}
                  </td>
                  <td className="px-6 py-3 text-sm text-kwatch-text-secondary max-w-xs truncate">
                    {category.description || '-'}
                  </td>
                  <td className="px-6 py-3 text-sm text-kwatch-text-secondary">
                    {category.sortOrder}
                  </td>
                  <td className="px-6 py-3 text-sm text-kwatch-text-secondary">
                    {category.websiteCount || 0}
                  </td>
                  <td className="px-6 py-3 text-sm space-x-2">
                    <button
                      onClick={() => openEditModal(category)}
                      className="text-kwatch-accent hover:text-kwatch-accent-hover transition-colors"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(category.id)}
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

      {/* 카테고리 추가/수정 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-kwatch-bg-secondary rounded-lg border border-kwatch-bg-tertiary w-full max-w-md">
            <div className="p-6 border-b border-kwatch-bg-tertiary flex items-center justify-between">
              <h2 className="text-2xl font-bold">
                {editingCategory ? '분류 수정' : '분류 추가'}
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
              onSubmit={editingCategory ? handleEditCategory : handleAddCategory}
              className="p-6 space-y-4"
            >
              {error && (
                <div className="p-3 bg-kwatch-status-critical bg-opacity-10 border border-kwatch-status-critical rounded-md text-kwatch-status-critical text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-kwatch-text-primary mb-1">
                  분류명 <span className="text-kwatch-status-critical">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  disabled={isSubmitting}
                  className="w-full px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary placeholder-kwatch-text-muted focus:outline-none focus:ring-2 focus:ring-kwatch-accent disabled:opacity-50"
                  placeholder="예: 정부기관"
                  required
                />
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
                  placeholder="분류 설명"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-kwatch-text-primary mb-1">
                  정렬순서
                </label>
                <input
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      sortOrder: parseInt(e.target.value),
                    })
                  }
                  disabled={isSubmitting}
                  className="w-full px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary placeholder-kwatch-text-muted focus:outline-none focus:ring-2 focus:ring-kwatch-accent disabled:opacity-50"
                  placeholder="0"
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
                    : editingCategory
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
