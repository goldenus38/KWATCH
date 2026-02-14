'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { Website, Category, PaginationMeta } from '@/types';
import * as XLSX from 'xlsx';

type SortKey = 'category' | 'organizationName' | 'name' | 'url' | 'checkIntervalSeconds' | 'isActive';
type SortDir = 'asc' | 'desc';

interface WebsiteFormData {
  url: string;
  name: string;
  organizationName: string;
  categoryId: string;
  description: string;
  checkIntervalSeconds: number;
  timeoutSeconds: number;
  defacementMode: string;
  useCustomWeights: boolean;
  customWeightPixel: number;
  customWeightStructural: number;
  customWeightCritical: number;
}

interface BulkRow {
  url: string;
  name: string;
  organizationName: string;
  categoryName: string;
  categoryId: number | null;
}

interface BulkResult {
  totalRows: number;
  successCount: number;
  failureCount: number;
  failures: { rowIndex: number; url: string; error: string }[];
}

export default function WebsitesPage() {
  const searchParams = useSearchParams();
  const [websites, setWebsites] = useState<Website[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
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
    timeoutSeconds: 60,
    defacementMode: 'auto',
    useCustomWeights: false,
    customWeightPixel: 0.6,
    customWeightStructural: 0.2,
    customWeightCritical: 0.2,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 일괄 등록 상태
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkFileName, setBulkFileName] = useState<string>('');
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 내려받기 상태
  const [isExporting, setIsExporting] = useState(false);

  // 정렬 상태
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedWebsites = useMemo(() => {
    const sorted = [...websites].sort((a, b) => {
      let aVal: string | number | boolean;
      let bVal: string | number | boolean;

      switch (sortKey) {
        case 'category':
          aVal = a.category?.name || '';
          bVal = b.category?.name || '';
          break;
        case 'organizationName':
          aVal = a.organizationName || '';
          bVal = b.organizationName || '';
          break;
        case 'name':
          aVal = a.name;
          bVal = b.name;
          break;
        case 'url':
          aVal = a.url;
          bVal = b.url;
          break;
        case 'checkIntervalSeconds':
          aVal = a.checkIntervalSeconds;
          bVal = b.checkIntervalSeconds;
          break;
        case 'isActive':
          aVal = a.isActive ? 1 : 0;
          bVal = b.isActive ? 1 : 0;
          break;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const cmp = aVal.localeCompare(bVal, 'ko');
        return sortDir === 'asc' ? cmp : -cmp;
      }
      const diff = (aVal as number) - (bVal as number);
      return sortDir === 'asc' ? diff : -diff;
    });
    return sorted;
  }, [websites, sortKey, sortDir]);

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) {
      return (
        <svg className="w-3 h-3 ml-1 inline-block opacity-30" fill="currentColor" viewBox="0 0 20 20">
          <path d="M5 8l5-5 5 5H5zM5 12l5 5 5-5H5z" />
        </svg>
      );
    }
    return sortDir === 'asc' ? (
      <svg className="w-3 h-3 ml-1 inline-block" fill="currentColor" viewBox="0 0 20 20">
        <path d="M5 12l5-5 5 5H5z" />
      </svg>
    ) : (
      <svg className="w-3 h-3 ml-1 inline-block" fill="currentColor" viewBox="0 0 20 20">
        <path d="M5 8l5 5 5-5H5z" />
      </svg>
    );
  };

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
  const isValidHttpUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleAddWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.categoryId || !formData.organizationName.trim() || !formData.name.trim() || !formData.url.trim()) {
      setError('분류, 기관명, 사이트명, URL은 필수입니다.');
      return;
    }
    if (!isValidHttpUrl(formData.url.trim())) {
      setError('URL은 http:// 또는 https://로 시작해야 합니다.');
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
        defacementMode: formData.defacementMode,
        ...(formData.useCustomWeights && {
          useCustomWeights: true,
          customWeightPixel: formData.customWeightPixel,
          customWeightStructural: formData.customWeightStructural,
          customWeightCritical: formData.customWeightCritical,
        }),
        ...(!formData.useCustomWeights && { useCustomWeights: false }),
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
    if (!editingWebsite || !formData.categoryId || !formData.organizationName.trim() || !formData.name.trim() || !formData.url.trim()) {
      setError('분류, 기관명, 사이트명, URL은 필수입니다.');
      return;
    }
    if (!isValidHttpUrl(formData.url.trim())) {
      setError('URL은 http:// 또는 https://로 시작해야 합니다.');
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
        defacementMode: formData.defacementMode,
        ...(formData.useCustomWeights && {
          useCustomWeights: true,
          customWeightPixel: formData.customWeightPixel,
          customWeightStructural: formData.customWeightStructural,
          customWeightCritical: formData.customWeightCritical,
        }),
        ...(!formData.useCustomWeights && { useCustomWeights: false }),
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
      timeoutSeconds: 60,
      defacementMode: 'auto',
      useCustomWeights: false,
      customWeightPixel: 0.6,
      customWeightStructural: 0.2,
      customWeightCritical: 0.2,
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
      defacementMode: website.defacementMode || 'auto',
      useCustomWeights: website.useCustomWeights || false,
      customWeightPixel: website.customWeightPixel ?? 0.6,
      customWeightStructural: website.customWeightStructural ?? 0.2,
      customWeightCritical: website.customWeightCritical ?? 0.2,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
    setError(null);
  };

  // ========== 일괄 등록 (Import) ==========

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBulkFileName(file.name);
    setBulkResult(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });

        if (json.length === 0) {
          setError('파일에 데이터가 없습니다.');
          setBulkRows([]);
          return;
        }

        // 컬럼 매핑 (유연하게: 한글/영문 모두 지원)
        const rows: BulkRow[] = json.map((row) => {
          const url = (row['URL'] || row['url'] || row['주소'] || '').toString().trim();
          const name = (row['사이트명'] || row['name'] || row['웹사이트명'] || row['이름'] || '').toString().trim();
          const orgName = (row['기관명'] || row['organizationName'] || row['기관'] || '').toString().trim();
          const catName = (row['카테고리'] || row['카테고리명'] || row['category'] || row['categoryName'] || '').toString().trim();

          // 카테고리명 → ID 변환
          let categoryId: number | null = null;
          if (catName) {
            const found = categories.find(
              (c) => c.name.toLowerCase() === catName.toLowerCase()
            );
            if (found) categoryId = found.id;
          }

          return { url, name, organizationName: orgName, categoryName: catName, categoryId };
        });

        // 파일 내 중복 URL 제거 (먼저 등장한 행 우선)
        const seen = new Set<string>();
        let dupCount = 0;
        const deduplicated = rows.filter((row) => {
          if (!row.url) return true; // 빈 URL은 서버에서 필수 필드 오류 처리
          if (seen.has(row.url)) {
            dupCount++;
            return false;
          }
          seen.add(row.url);
          return true;
        });

        if (dupCount > 0) {
          setError(`파일 내 중복 URL ${dupCount}건이 제거되었습니다.`);
        } else {
          setError(null);
        }

        setBulkRows(deduplicated);
      } catch {
        setError('파일을 읽을 수 없습니다. 올바른 엑셀(.xlsx, .xls) 또는 CSV 파일인지 확인해주세요.');
        setBulkRows([]);
      }
    };
    reader.readAsArrayBuffer(file);

    // input 초기화 (같은 파일 재선택 허용)
    e.target.value = '';
  };

  const handleBulkSubmit = async () => {
    if (bulkRows.length === 0) return;

    setIsBulkSubmitting(true);
    setError(null);

    try {
      const payload = {
        websites: bulkRows.map((row) => ({
          url: row.url,
          name: row.name,
          organizationName: row.organizationName || null,
          categoryId: row.categoryId,
        })),
      };

      const response = await api.post<BulkResult>('/api/websites/bulk', payload);

      if (response.success && response.data) {
        setBulkResult(response.data);
        if (response.data.successCount > 0) {
          fetchWebsites(1);
        }
      } else {
        setError(response.error?.message || '일괄 등록에 실패했습니다.');
      }
    } catch (err) {
      setError('서버 통신 중 오류가 발생했습니다.');
      console.error('Error bulk importing:', err);
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const closeBulkModal = () => {
    setShowBulkModal(false);
    setBulkRows([]);
    setBulkFileName('');
    setBulkResult(null);
    setError(null);
  };

  // ========== 리스트 내려받기 (Export) ==========

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);

    try {
      const response = await api.get<Website[]>('/api/websites/export');

      if (response.success && response.data) {
        const rows = response.data.map((w) => ({
          '카테고리': w.category?.name || '',
          '기관명': w.organizationName || '',
          '사이트명': w.name,
          'URL': w.url,
          '점검주기(초)': w.checkIntervalSeconds,
          '타임아웃(초)': w.timeoutSeconds,
          '상태': w.isActive ? '활성' : '비활성',
        }));

        const ws = XLSX.utils.json_to_sheet(rows);

        // 컬럼 너비 설정
        ws['!cols'] = [
          { wch: 15 }, // 카테고리
          { wch: 20 }, // 기관명
          { wch: 25 }, // 사이트명
          { wch: 50 }, // URL
          { wch: 12 }, // 점검주기
          { wch: 12 }, // 타임아웃
          { wch: 8 },  // 상태
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '웹사이트목록');

        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        XLSX.writeFile(wb, `KWATCH_웹사이트목록_${today}.xlsx`);
      } else {
        setError(response.error?.message || '내려받기에 실패했습니다.');
      }
    } catch (err) {
      setError('서버 통신 중 오류가 발생했습니다.');
      console.error('Error exporting:', err);
    } finally {
      setIsExporting(false);
    }
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
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-4 py-2 border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary hover:bg-kwatch-bg-tertiary transition-colors disabled:opacity-50"
          >
            {isExporting ? '내려받는 중...' : '내려받기'}
          </button>
          <button
            onClick={() => { setBulkResult(null); setBulkRows([]); setBulkFileName(''); setShowBulkModal(true); }}
            className="px-4 py-2 border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary hover:bg-kwatch-bg-tertiary transition-colors"
          >
            일괄 등록
          </button>
          <button
            onClick={openAddModal}
            className="px-4 py-2 bg-kwatch-accent hover:bg-kwatch-accent-hover text-white rounded-md font-medium transition-colors"
          >
            + 추가
          </button>
        </div>
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
          placeholder="기관명, 사이트명, URL 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-[200px] px-4 py-2 bg-kwatch-bg-secondary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary placeholder-kwatch-text-muted focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
        />
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-4 py-2 bg-kwatch-bg-secondary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary focus:outline-none focus:ring-2 focus:ring-kwatch-accent"
        >
          <option value="">모든 분류</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id.toString()}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {/* 에러 메시지 */}
      {error && !showBulkModal && (
        <div className="p-4 bg-kwatch-status-critical bg-opacity-10 border border-kwatch-status-critical rounded-md text-kwatch-status-critical">
          {error}
        </div>
      )}

      {/* 웹사이트 테이블 */}
      <div className="bg-kwatch-bg-secondary rounded-lg overflow-hidden border border-kwatch-bg-tertiary">
        <table className="w-full">
          <thead className="border-b border-kwatch-bg-tertiary bg-kwatch-bg-tertiary">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary cursor-pointer select-none hover:text-kwatch-accent transition-colors" onClick={() => handleSort('category')}>
                분류<SortIcon columnKey="category" />
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary cursor-pointer select-none hover:text-kwatch-accent transition-colors" onClick={() => handleSort('organizationName')}>
                기관명<SortIcon columnKey="organizationName" />
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary cursor-pointer select-none hover:text-kwatch-accent transition-colors" onClick={() => handleSort('name')}>
                사이트명<SortIcon columnKey="name" />
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary cursor-pointer select-none hover:text-kwatch-accent transition-colors" onClick={() => handleSort('url')}>
                URL<SortIcon columnKey="url" />
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary cursor-pointer select-none hover:text-kwatch-accent transition-colors" onClick={() => handleSort('checkIntervalSeconds')}>
                점검주기<SortIcon columnKey="checkIntervalSeconds" />
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-kwatch-text-primary cursor-pointer select-none hover:text-kwatch-accent transition-colors" onClick={() => handleSort('isActive')}>
                상태<SortIcon columnKey="isActive" />
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
            ) : websites.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center">
                  <div className="text-kwatch-text-muted">등록된 웹사이트가 없습니다.</div>
                </td>
              </tr>
            ) : (
              sortedWebsites.map((website) => (
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
                  <td className="px-6 py-3 text-sm whitespace-nowrap">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(website.isActive)}`}
                    >
                      {getStatusLabel(website.isActive)}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(website)}
                        className="p-1.5 rounded hover:bg-kwatch-bg-tertiary text-kwatch-accent hover:text-kwatch-accent-hover transition-colors"
                        title="수정"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteWebsite(website.id)}
                        className="p-1.5 rounded hover:bg-kwatch-bg-tertiary text-kwatch-status-critical hover:opacity-80 transition-colors"
                        title="삭제"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
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
                    분류 <span className="text-kwatch-status-critical">*</span>
                  </label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) =>
                      setFormData({ ...formData, categoryId: e.target.value })
                    }
                    disabled={isSubmitting}
                    className="w-full px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary focus:outline-none focus:ring-2 focus:ring-kwatch-accent disabled:opacity-50"
                    required
                  >
                    <option value="">분류 선택</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id.toString()}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-kwatch-text-primary mb-1">
                    기관명 <span className="text-kwatch-status-critical">*</span>
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
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-kwatch-text-primary mb-1">
                    사이트명 <span className="text-kwatch-status-critical">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    disabled={isSubmitting}
                    className="w-full px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary placeholder-kwatch-text-muted focus:outline-none focus:ring-2 focus:ring-kwatch-accent disabled:opacity-50"
                    placeholder="사이트명"
                    required
                  />
                </div>

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

                <div>
                  <label className="block text-sm font-medium text-kwatch-text-primary mb-1">
                    위변조 탐지 모드
                  </label>
                  <select
                    value={formData.defacementMode}
                    onChange={(e) =>
                      setFormData({ ...formData, defacementMode: e.target.value })
                    }
                    disabled={isSubmitting}
                    className="w-full px-4 py-2 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary focus:outline-none focus:ring-2 focus:ring-kwatch-accent disabled:opacity-50"
                  >
                    <option value="auto">자동 (하이브리드)</option>
                    <option value="pixel_only">픽셀 전용</option>
                  </select>
                  <p className="mt-1 text-xs text-kwatch-text-muted">
                    SNS/SPA 사이트는 &apos;픽셀 전용&apos; 권장
                  </p>
                </div>
              </div>

              {/* 사이트별 가중치 설정 */}
              {formData.defacementMode !== 'pixel_only' && (
                <div className="border border-kwatch-bg-tertiary rounded-md p-4 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.useCustomWeights}
                      onChange={(e) =>
                        setFormData({ ...formData, useCustomWeights: e.target.checked })
                      }
                      disabled={isSubmitting}
                      className="rounded border-kwatch-bg-tertiary"
                    />
                    <span className="text-sm font-medium text-kwatch-text-primary">
                      사이트별 가중치 설정 사용
                    </span>
                  </label>

                  {formData.useCustomWeights && (
                    <div className="space-y-3 pt-2">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-kwatch-text-secondary mb-1">
                            픽셀 비교
                          </label>
                          <input
                            type="number"
                            value={formData.customWeightPixel}
                            onChange={(e) =>
                              setFormData({ ...formData, customWeightPixel: parseFloat(e.target.value) || 0 })
                            }
                            disabled={isSubmitting}
                            className="w-full px-3 py-1.5 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-kwatch-accent disabled:opacity-50"
                            min="0"
                            max="1"
                            step="0.1"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-kwatch-text-secondary mb-1">
                            HTML 구조
                          </label>
                          <input
                            type="number"
                            value={formData.customWeightStructural}
                            onChange={(e) =>
                              setFormData({ ...formData, customWeightStructural: parseFloat(e.target.value) || 0 })
                            }
                            disabled={isSubmitting}
                            className="w-full px-3 py-1.5 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-kwatch-accent disabled:opacity-50"
                            min="0"
                            max="1"
                            step="0.1"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-kwatch-text-secondary mb-1">
                            도메인 감사
                          </label>
                          <input
                            type="number"
                            value={formData.customWeightCritical}
                            onChange={(e) =>
                              setFormData({ ...formData, customWeightCritical: parseFloat(e.target.value) || 0 })
                            }
                            disabled={isSubmitting}
                            className="w-full px-3 py-1.5 bg-kwatch-bg-primary border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-kwatch-accent disabled:opacity-50"
                            min="0"
                            max="1"
                            step="0.1"
                          />
                        </div>
                      </div>

                      {/* 합계 표시 */}
                      {(() => {
                        const sum = formData.customWeightPixel + formData.customWeightStructural + formData.customWeightCritical;
                        const isValid = Math.abs(sum - 1.0) <= 0.01;
                        return (
                          <div className={`text-xs ${isValid ? 'text-kwatch-status-normal' : 'text-kwatch-status-critical'}`}>
                            합계: {sum.toFixed(1)} {isValid ? '\u2713' : '\u2717 (1.0이어야 합니다)'}
                          </div>
                        );
                      })()}

                      {/* 프리셋 버튼 */}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, customWeightPixel: 0.6, customWeightStructural: 0.2, customWeightCritical: 0.2 })}
                          className="px-2 py-1 text-xs border border-kwatch-bg-tertiary rounded text-kwatch-text-secondary hover:bg-kwatch-bg-tertiary transition-colors"
                        >
                          기본값
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, customWeightPixel: 0.0, customWeightStructural: 0.5, customWeightCritical: 0.5 })}
                          className="px-2 py-1 text-xs border border-kwatch-bg-tertiary rounded text-kwatch-text-secondary hover:bg-kwatch-bg-tertiary transition-colors"
                        >
                          동영상 사이트
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, customWeightPixel: 0.8, customWeightStructural: 0.1, customWeightCritical: 0.1 })}
                          className="px-2 py-1 text-xs border border-kwatch-bg-tertiary rounded text-kwatch-text-secondary hover:bg-kwatch-bg-tertiary transition-colors"
                        >
                          정적 사이트
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

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

      {/* 일괄 등록 모달 */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-kwatch-bg-secondary rounded-lg border border-kwatch-bg-tertiary w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-kwatch-bg-tertiary flex items-center justify-between sticky top-0 bg-kwatch-bg-secondary">
              <h2 className="text-2xl font-bold">웹사이트 일괄 등록</h2>
              <button
                onClick={closeBulkModal}
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

            <div className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-kwatch-status-critical bg-opacity-10 border border-kwatch-status-critical rounded-md text-kwatch-status-critical text-sm">
                  {error}
                </div>
              )}

              {/* 파일 선택 */}
              <div>
                <p className="text-sm text-kwatch-text-secondary mb-2">
                  엑셀(.xlsx, .xls) 또는 CSV 파일을 선택하세요. 컬럼: URL, 사이트명, 기관명, 카테고리
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isBulkSubmitting}
                  className="px-4 py-2 border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary hover:bg-kwatch-bg-tertiary transition-colors disabled:opacity-50"
                >
                  파일 선택
                </button>
                {bulkFileName && (
                  <span className="ml-3 text-sm text-kwatch-text-secondary">{bulkFileName}</span>
                )}
              </div>

              {/* 미리보기 */}
              {bulkRows.length > 0 && !bulkResult && (
                <div>
                  <p className="text-sm font-medium text-kwatch-text-primary mb-2">
                    총 {bulkRows.length}건 파싱됨 (처음 5행 미리보기)
                  </p>
                  <div className="overflow-x-auto border border-kwatch-bg-tertiary rounded-md">
                    <table className="w-full text-sm">
                      <thead className="bg-kwatch-bg-tertiary">
                        <tr>
                          <th className="px-3 py-2 text-left text-kwatch-text-primary">#</th>
                          <th className="px-3 py-2 text-left text-kwatch-text-primary">URL</th>
                          <th className="px-3 py-2 text-left text-kwatch-text-primary">사이트명</th>
                          <th className="px-3 py-2 text-left text-kwatch-text-primary">기관명</th>
                          <th className="px-3 py-2 text-left text-kwatch-text-primary">카테고리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkRows.slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-t border-kwatch-bg-tertiary">
                            <td className="px-3 py-2 text-kwatch-text-muted">{i + 1}</td>
                            <td className="px-3 py-2 text-kwatch-text-secondary truncate max-w-[200px]">{row.url || <span className="text-kwatch-status-critical">(없음)</span>}</td>
                            <td className="px-3 py-2 text-kwatch-text-secondary">{row.name || <span className="text-kwatch-status-critical">(없음)</span>}</td>
                            <td className="px-3 py-2 text-kwatch-text-secondary">{row.organizationName || '-'}</td>
                            <td className="px-3 py-2 text-kwatch-text-secondary">
                              {row.categoryName ? (
                                row.categoryId ? (
                                  row.categoryName
                                ) : (
                                  <span className="text-kwatch-status-warning">{row.categoryName} (미매칭)</span>
                                )
                              ) : '-'}
                            </td>
                          </tr>
                        ))}
                        {bulkRows.length > 5 && (
                          <tr className="border-t border-kwatch-bg-tertiary">
                            <td colSpan={5} className="px-3 py-2 text-center text-kwatch-text-muted">
                              ... 외 {bulkRows.length - 5}건
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 등록 결과 */}
              {bulkResult && (
                <div className="space-y-3">
                  <div className="flex gap-4">
                    <div className="flex-1 p-3 bg-kwatch-status-normal bg-opacity-10 border border-kwatch-status-normal rounded-md text-center">
                      <div className="text-2xl font-bold text-kwatch-status-normal">{bulkResult.successCount}</div>
                      <div className="text-sm text-kwatch-text-secondary">성공</div>
                    </div>
                    <div className="flex-1 p-3 bg-kwatch-status-critical bg-opacity-10 border border-kwatch-status-critical rounded-md text-center">
                      <div className="text-2xl font-bold text-kwatch-status-critical">{bulkResult.failureCount}</div>
                      <div className="text-sm text-kwatch-text-secondary">실패</div>
                    </div>
                    <div className="flex-1 p-3 bg-kwatch-bg-tertiary rounded-md text-center">
                      <div className="text-2xl font-bold text-kwatch-text-primary">{bulkResult.totalRows}</div>
                      <div className="text-sm text-kwatch-text-secondary">전체</div>
                    </div>
                  </div>

                  {bulkResult.failures.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-kwatch-status-critical mb-2">실패 상세</p>
                      <div className="overflow-x-auto border border-kwatch-bg-tertiary rounded-md max-h-40 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-kwatch-bg-tertiary sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left text-kwatch-text-primary">행</th>
                              <th className="px-3 py-2 text-left text-kwatch-text-primary">URL</th>
                              <th className="px-3 py-2 text-left text-kwatch-text-primary">사유</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bulkResult.failures.map((f, i) => (
                              <tr key={i} className="border-t border-kwatch-bg-tertiary">
                                <td className="px-3 py-2 text-kwatch-text-muted">{f.rowIndex}</td>
                                <td className="px-3 py-2 text-kwatch-text-secondary truncate max-w-[200px]">{f.url}</td>
                                <td className="px-3 py-2 text-kwatch-status-critical">{f.error}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 버튼 */}
              <div className="flex gap-2 justify-end pt-4 border-t border-kwatch-bg-tertiary">
                <button
                  type="button"
                  onClick={closeBulkModal}
                  disabled={isBulkSubmitting}
                  className="px-6 py-2 border border-kwatch-bg-tertiary rounded-md text-kwatch-text-primary hover:bg-kwatch-bg-tertiary transition-colors disabled:opacity-50"
                >
                  {bulkResult ? '닫기' : '취소'}
                </button>
                {!bulkResult && (
                  <button
                    type="button"
                    onClick={handleBulkSubmit}
                    disabled={isBulkSubmitting || bulkRows.length === 0}
                    className="px-6 py-2 bg-kwatch-accent hover:bg-kwatch-accent-hover text-white rounded-md font-medium transition-colors disabled:opacity-50"
                  >
                    {isBulkSubmitting ? '등록 중...' : `${bulkRows.length}건 등록`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
