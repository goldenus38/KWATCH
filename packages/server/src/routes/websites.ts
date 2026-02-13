import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { getDbClient } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError, createPaginationMeta } from '../utils/response';
import { AuthenticatedRequest, WebsiteCreateInput, WebsiteUpdateInput } from '../types';
import { logger } from '../utils/logger';
import { schedulerService } from '../services/SchedulerService';

const router = Router();

/**
 * HTML 엔티티를 디코딩합니다 (&amp; → &, &lt; → < 등)
 * 엑셀/HTML 소스에서 복사한 데이터의 엔티티 오염 방지
 */
const decodeHtmlEntities = (str: string): string => {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_match, dec) => String.fromCharCode(dec));
};

/**
 * URL 형식 검증 (http:// 또는 https:// 필수)
 */
const isValidUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * GET /api/websites/export
 * 전체 웹사이트 목록 내보내기 (admin only, pagination 없음)
 */
router.get('/export', authenticate, authorize('admin'), async (req, res) => {
  try {
    const prisma = getDbClient();

    const websites = await prisma.website.findMany({
      include: {
        category: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    sendSuccess(res, websites);
  } catch (error) {
    logger.error('웹사이트 목록 내보내기 오류:', error);
    sendError(res, 'EXPORT_ERROR', '웹사이트 목록 내보내기 중 오류가 발생했습니다.', 500);
  }
});

/**
 * GET /api/websites
 * 웹사이트 목록 조회 (검색, 필터, 페이지네이션)
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { categoryId, isActive, search, page = 1, limit = 20 } = req.query as any;
    const prisma = getDbClient();

    // 페이지네이션 파라미터 파싱
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Prisma where 절 동적 구성
    const where: Prisma.WebsiteWhereInput = {};

    // 카테고리 필터
    if (categoryId) {
      const catId = parseInt(categoryId);
      if (!isNaN(catId)) {
        where.categoryId = catId;
      }
    }

    // 활성/비활성 필터
    if (isActive !== undefined) {
      where.isActive = isActive === 'true' ? true : isActive === 'false' ? false : undefined;
      if (where.isActive === undefined) {
        delete where.isActive;
      }
    }

    // 검색 필터 (url, name, organizationName)
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = search.trim();
      where.OR = [
        { url: { contains: searchTerm, mode: 'insensitive' } },
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { organizationName: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    // 총 개수 조회
    const totalCount = await prisma.website.count({ where });

    // 데이터 조회
    const websites = await prisma.website.findMany({
      where,
      include: {
        category: true,
      },
      orderBy: {
        name: 'asc',
      },
      skip,
      take: limitNum,
    });

    const meta = createPaginationMeta(totalCount, pageNum, limitNum);
    sendSuccess(res, websites, 200, meta);
  } catch (error) {
    logger.error('웹사이트 목록 조회 오류:', error);
    sendError(res, 'LIST_ERROR', '웹사이트 목록 조회 중 오류가 발생했습니다.', 500);
  }
});

/**
 * POST /api/websites
 * 웹사이트 등록 (admin/analyst)
 */
router.post('/', authenticate, authorize('admin', 'analyst'), async (req, res) => {
  try {
    let {
      url,
      name,
      organizationName,
      categoryId,
      description,
      checkIntervalSeconds,
      timeoutSeconds,
      ignoreSelectors,
    } = req.body as WebsiteCreateInput;
    const prisma = getDbClient();

    // HTML 엔티티 디코딩
    if (name) name = decodeHtmlEntities(name);
    if (organizationName) organizationName = decodeHtmlEntities(organizationName);
    if (description) description = decodeHtmlEntities(description);

    // 입력 유효성 검사
    if (!url || !name) {
      sendError(res, 'INVALID_INPUT', 'URL과 웹사이트명은 필수입니다.', 400);
      return;
    }

    // URL 형식 검증
    if (!isValidUrl(url)) {
      sendError(res, 'INVALID_URL', 'URL은 http:// 또는 https://로 시작해야 합니다.', 400);
      return;
    }

    // 숫자 범위 검증
    if (checkIntervalSeconds !== undefined && (checkIntervalSeconds < 10 || checkIntervalSeconds > 86400)) {
      sendError(res, 'INVALID_INPUT', '점검 주기는 10초~86400초(24시간) 사이여야 합니다.', 400);
      return;
    }
    if (timeoutSeconds !== undefined && (timeoutSeconds < 5 || timeoutSeconds > 120)) {
      sendError(res, 'INVALID_INPUT', '타임아웃은 5초~120초 사이여야 합니다.', 400);
      return;
    }

    // URL 중복 검사
    const existingWebsite = await prisma.website.findUnique({
      where: { url },
    });

    if (existingWebsite) {
      sendError(res, 'DUPLICATE_URL', '이미 등록된 URL입니다.', 409);
      return;
    }

    // 카테고리 검증 (제공된 경우)
    if (categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: categoryId },
      });

      if (!category) {
        sendError(res, 'CATEGORY_NOT_FOUND', '존재하지 않는 카테고리입니다.', 404);
        return;
      }
    }

    // ignoreSelectors 검증
    if (ignoreSelectors !== undefined) {
      if (!Array.isArray(ignoreSelectors) || !ignoreSelectors.every((s: unknown) => typeof s === 'string')) {
        sendError(res, 'INVALID_INPUT', 'ignoreSelectors는 문자열 배열이어야 합니다.', 400);
        return;
      }
    }

    // 웹사이트 등록
    const newWebsite = await prisma.website.create({
      data: {
        url,
        name,
        organizationName: organizationName || null,
        categoryId: categoryId || null,
        description: description || null,
        checkIntervalSeconds: checkIntervalSeconds || 60,
        timeoutSeconds: timeoutSeconds || 60,
        isActive: true,
        ...(ignoreSelectors && { ignoreSelectors }),
      },
      include: {
        category: true,
      },
    });

    logger.info(`웹사이트 등록 완료: ${newWebsite.id} - ${newWebsite.url}`);

    // 등록 즉시 모니터링 스케줄 시작
    schedulerService.scheduleMonitoring(newWebsite).catch((err) => {
      logger.error(`웹사이트 ${newWebsite.id} 스케줄링 실패:`, err);
    });

    sendSuccess(res, newWebsite, 201);
  } catch (error) {
    logger.error('웹사이트 등록 오류:', error);
    sendError(res, 'CREATE_ERROR', '웹사이트 등록 중 오류가 발생했습니다.', 500);
  }
});

/**
 * GET /api/websites/:id
 * 웹사이트 상세 조회
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const websiteId = parseInt(id);

    if (isNaN(websiteId)) {
      sendError(res, 'INVALID_ID', '유효하지 않은 웹사이트 ID입니다.', 400);
      return;
    }

    const prisma = getDbClient();

    // 웹사이트 상세 조회 (최신 모니터링 결과, 최신 스크린샷 포함)
    const website = await prisma.website.findUnique({
      where: { id: websiteId },
      include: {
        category: true,
        monitoringResults: {
          take: 1,
          orderBy: { checkedAt: 'desc' },
        },
        screenshots: {
          take: 1,
          orderBy: { capturedAt: 'desc' },
        },
      },
    });

    if (!website) {
      sendError(res, 'NOT_FOUND', '웹사이트를 찾을 수 없습니다.', 404);
      return;
    }

    sendSuccess(res, website);
  } catch (error) {
    logger.error('웹사이트 조회 오류:', error);
    sendError(res, 'GET_ERROR', '웹사이트 조회 중 오류가 발생했습니다.', 500);
  }
});

/**
 * PUT /api/websites/:id
 * 웹사이트 수정 (admin/analyst)
 */
router.put('/:id', authenticate, authorize('admin', 'analyst'), async (req, res) => {
  try {
    const { id } = req.params;
    const websiteId = parseInt(id);
    const updates = req.body as WebsiteUpdateInput;
    const prisma = getDbClient();

    // HTML 엔티티 디코딩
    if (updates.name) updates.name = decodeHtmlEntities(updates.name);
    if (updates.organizationName) updates.organizationName = decodeHtmlEntities(updates.organizationName);
    if (updates.description) updates.description = decodeHtmlEntities(updates.description);

    if (isNaN(websiteId)) {
      sendError(res, 'INVALID_ID', '유효하지 않은 웹사이트 ID입니다.', 400);
      return;
    }

    // 웹사이트 존재 여부 확인
    const existingWebsite = await prisma.website.findUnique({
      where: { id: websiteId },
    });

    if (!existingWebsite) {
      sendError(res, 'NOT_FOUND', '웹사이트를 찾을 수 없습니다.', 404);
      return;
    }

    // URL 변경 시 중복 검사
    if (updates.url && updates.url !== existingWebsite.url) {
      if (!isValidUrl(updates.url)) {
        sendError(res, 'INVALID_URL', 'URL은 http:// 또는 https://로 시작해야 합니다.', 400);
        return;
      }

      const duplicateUrl = await prisma.website.findUnique({
        where: { url: updates.url },
      });

      if (duplicateUrl) {
        sendError(res, 'DUPLICATE_URL', '이미 등록된 URL입니다.', 409);
        return;
      }
    }

    // 카테고리 변경 시 검증
    if (updates.categoryId !== undefined && updates.categoryId !== null) {
      const category = await prisma.category.findUnique({
        where: { id: updates.categoryId },
      });

      if (!category) {
        sendError(res, 'CATEGORY_NOT_FOUND', '존재하지 않는 카테고리입니다.', 404);
        return;
      }
    }

    // ignoreSelectors 검증
    if (updates.ignoreSelectors !== undefined) {
      if (!Array.isArray(updates.ignoreSelectors) || !updates.ignoreSelectors.every((s: unknown) => typeof s === 'string')) {
        sendError(res, 'INVALID_INPUT', 'ignoreSelectors는 문자열 배열이어야 합니다.', 400);
        return;
      }
    }

    // 웹사이트 수정
    const updatedWebsite = await prisma.website.update({
      where: { id: websiteId },
      data: {
        ...(updates.url && { url: updates.url }),
        ...(updates.name && { name: updates.name }),
        ...(updates.organizationName !== undefined && { organizationName: updates.organizationName }),
        ...(updates.categoryId !== undefined && { categoryId: updates.categoryId }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.checkIntervalSeconds !== undefined && { checkIntervalSeconds: updates.checkIntervalSeconds }),
        ...(updates.timeoutSeconds !== undefined && { timeoutSeconds: updates.timeoutSeconds }),
        ...(updates.isActive !== undefined && { isActive: updates.isActive }),
        ...(updates.ignoreSelectors !== undefined && { ignoreSelectors: updates.ignoreSelectors }),
      },
      include: {
        category: true,
      },
    });

    logger.info(`웹사이트 수정 완료: ${websiteId}`);

    // 스케줄 갱신 (활성 상태 변경 또는 체크 주기 변경 반영)
    if (updatedWebsite.isActive) {
      schedulerService.scheduleMonitoring(updatedWebsite).catch((err) => {
        logger.error(`웹사이트 ${websiteId} 스케줄 갱신 실패:`, err);
      });
    } else {
      schedulerService.removeSchedule(websiteId).catch((err) => {
        logger.error(`웹사이트 ${websiteId} 스케줄 제거 실패:`, err);
      });
    }

    sendSuccess(res, updatedWebsite);
  } catch (error) {
    logger.error('웹사이트 수정 오류:', error);
    sendError(res, 'UPDATE_ERROR', '웹사이트 수정 중 오류가 발생했습니다.', 500);
  }
});

/**
 * DELETE /api/websites/:id
 * 웹사이트 삭제 (admin only)
 */
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const websiteId = parseInt(id);

    if (isNaN(websiteId)) {
      sendError(res, 'INVALID_ID', '유효하지 않은 웹사이트 ID입니다.', 400);
      return;
    }

    const prisma = getDbClient();

    // 웹사이트 존재 여부 확인
    const website = await prisma.website.findUnique({
      where: { id: websiteId },
    });

    if (!website) {
      sendError(res, 'NOT_FOUND', '웹사이트를 찾을 수 없습니다.', 404);
      return;
    }

    // 스케줄 제거
    await schedulerService.removeSchedule(websiteId);

    // 웹사이트 삭제 (CASCADE로 인해 관련 데이터 자동 삭제)
    await prisma.website.delete({
      where: { id: websiteId },
    });

    logger.info(`웹사이트 삭제 완료: ${websiteId} - ${website.url}`);
    sendSuccess(res, { message: '웹사이트가 삭제되었습니다.' });
  } catch (error) {
    logger.error('웹사이트 삭제 오류:', error);
    sendError(res, 'DELETE_ERROR', '웹사이트 삭제 중 오류가 발생했습니다.', 500);
  }
});

/**
 * POST /api/websites/bulk
 * 웹사이트 대량 등록
 * Request body: { websites: [{ url, name, organizationName?, categoryId? }, ...] }
 */
router.post('/bulk', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { websites: websitesData } = req.body as { websites: WebsiteCreateInput[] };
    const prisma = getDbClient();

    if (!Array.isArray(websitesData) || websitesData.length === 0) {
      sendError(res, 'INVALID_INPUT', '등록할 웹사이트 목록이 필요합니다.', 400);
      return;
    }

    const result = {
      totalRows: websitesData.length,
      successCount: 0,
      failureCount: 0,
      failures: [] as any[],
    };

    // 검증 및 필터링
    const validatedWebsites: (WebsiteCreateInput & { rowIndex: number })[] = [];

    for (let i = 0; i < websitesData.length; i++) {
      const website = websitesData[i];

      // HTML 엔티티 디코딩
      if (website.name) website.name = decodeHtmlEntities(website.name);
      if (website.organizationName) website.organizationName = decodeHtmlEntities(website.organizationName);
      if (website.description) website.description = decodeHtmlEntities(website.description);

      // 필수 필드 검사
      if (!website.url || !website.name) {
        result.failures.push({
          rowIndex: i + 1,
          url: website.url || '(없음)',
          error: 'URL과 웹사이트명은 필수입니다.',
        });
        result.failureCount++;
        continue;
      }

      // URL 형식 검증
      if (!isValidUrl(website.url)) {
        result.failures.push({
          rowIndex: i + 1,
          url: website.url,
          error: 'URL은 http:// 또는 https://로 시작해야 합니다.',
        });
        result.failureCount++;
        continue;
      }

      validatedWebsites.push({ ...website, rowIndex: i + 1 });
    }

    // 파일 내 중복 URL 제거 (먼저 등장한 행 우선)
    const seenUrls = new Set<string>();
    const deduplicatedWebsites: typeof validatedWebsites = [];
    for (const website of validatedWebsites) {
      if (seenUrls.has(website.url)) {
        result.failures.push({
          rowIndex: website.rowIndex,
          url: website.url,
          error: '파일 내 중복 URL입니다.',
        });
        result.failureCount++;
      } else {
        seenUrls.add(website.url);
        deduplicatedWebsites.push(website);
      }
    }

    // DB 기존 URL 중복 검사
    const urls = deduplicatedWebsites.map((w) => w.url);
    const existingUrls = await prisma.website.findMany({
      where: { url: { in: urls } },
      select: { url: true },
    });

    const existingUrlSet = new Set(existingUrls.map((w) => w.url));

    const finalWebsites: (WebsiteCreateInput & { rowIndex: number })[] = [];
    for (const website of deduplicatedWebsites) {
      if (existingUrlSet.has(website.url)) {
        result.failures.push({
          rowIndex: website.rowIndex,
          url: website.url,
          error: '이미 등록된 URL입니다.',
        });
        result.failureCount++;
      } else {
        finalWebsites.push(website);
      }
    }

    // 카테고리 검증 (유효한 ID만)
    const categoryIds = finalWebsites
      .map((w) => w.categoryId)
      .filter((id): id is number => id !== undefined && id !== null);

    const validCategories = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true },
    });

    const validCategorySet = new Set(validCategories.map((c) => c.id));

    // 카테고리 유효성 재검사
    const categorizedWebsites: (WebsiteCreateInput & { rowIndex: number })[] = [];
    for (const website of finalWebsites) {
      if (website.categoryId && !validCategorySet.has(website.categoryId)) {
        result.failures.push({
          rowIndex: website.rowIndex,
          url: website.url,
          error: '존재하지 않는 카테고리입니다.',
        });
        result.failureCount++;
      } else {
        categorizedWebsites.push(website);
      }
    }

    // 배치 삽입 (트랜잭션)
    if (categorizedWebsites.length > 0) {
      try {
        await prisma.$transaction(
          categorizedWebsites.map((website) =>
            prisma.website.create({
              data: {
                url: website.url,
                name: website.name,
                organizationName: website.organizationName || null,
                categoryId: website.categoryId || null,
                description: website.description || null,
                checkIntervalSeconds: website.checkIntervalSeconds || 60,
                timeoutSeconds: website.timeoutSeconds || 60,
                isActive: true,
              },
            }),
          ),
        );
        result.successCount = categorizedWebsites.length;

        // 새로 등록된 사이트들 스케줄 시작
        schedulerService.scheduleAllWebsites().catch((err) => {
          logger.error('대량 등록 후 스케줄링 실패:', err);
        });
      } catch (error) {
        logger.error('웹사이트 배치 삽입 오류:', error);
        sendError(res, 'BATCH_ERROR', '웹사이트 일괄 등록 중 오류가 발생했습니다.', 500);
        return;
      }
    }

    logger.info(`웹사이트 대량 등록 완료: 성공 ${result.successCount}, 실패 ${result.failureCount}`);
    sendSuccess(res, result, 201);
  } catch (error) {
    logger.error('웹사이트 대량 등록 오류:', error);
    sendError(res, 'BULK_ERROR', '대량 등록 중 오류가 발생했습니다.', 500);
  }
});

export default router;
