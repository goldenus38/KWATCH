import { Router } from 'express';
import { getDbClient } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/response';
import { CategoryCreateInput, CategoryUpdateInput } from '../types';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/categories
 * 카테고리 목록 조회 (정렬 순서대로)
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const prisma = getDbClient();
    const categories = await prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: { websites: true },
        },
      },
    });

    // 응답에 websiteCount 추가
    const categoriesWithCount = categories.map((category: any) => ({
      ...category,
      websiteCount: category._count.websites,
      _count: undefined,
    }));

    sendSuccess(res, categoriesWithCount);
  } catch (error) {
    logger.error('카테고리 목록 조회 오류:', error);
    sendError(res, 'LIST_ERROR', '카테고리 목록 조회 중 오류가 발생했습니다.', 500);
  }
});

/**
 * POST /api/categories
 * 카테고리 등록 (admin only)
 */
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, description, sortOrder } = req.body as CategoryCreateInput;
    const prisma = getDbClient();

    // 입력 유효성 검사
    if (!name || typeof name !== 'string' || name.trim() === '') {
      sendError(res, 'INVALID_INPUT', '카테고리명은 필수입니다.', 400);
      return;
    }

    const trimmedName = name.trim();

    // 카테고리명 길이 제한
    if (trimmedName.length > 100) {
      sendError(res, 'INVALID_INPUT', '카테고리명은 100자 이내여야 합니다.', 400);
      return;
    }

    // sortOrder 범위 검증
    if (sortOrder !== undefined && (typeof sortOrder !== 'number' || sortOrder < 0 || sortOrder > 9999)) {
      sendError(res, 'INVALID_INPUT', '정렬 순서는 0~9999 사이의 숫자여야 합니다.', 400);
      return;
    }

    // 카테고리명 중복 검사
    const existingCategory = await prisma.category.findUnique({
      where: { name: trimmedName },
    });

    if (existingCategory) {
      sendError(res, 'DUPLICATE_NAME', '이미 존재하는 카테고리명입니다.', 409);
      return;
    }

    // 새로운 카테고리 등록
    const newCategory = await prisma.category.create({
      data: {
        name: trimmedName,
        description: description || null,
        sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
      },
    });

    logger.info(`카테고리 등록: ${newCategory.name} (ID: ${newCategory.id})`);
    sendSuccess(res, newCategory, 201);
  } catch (error) {
    logger.error('카테고리 등록 오류:', error);
    sendError(res, 'CREATE_ERROR', '카테고리 등록 중 오류가 발생했습니다.', 500);
  }
});

/**
 * PUT /api/categories/:id
 * 카테고리 수정 (admin only)
 */
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const categoryId = parseInt(id);
    const updates = req.body as CategoryUpdateInput;
    const prisma = getDbClient();

    // ID 유효성 검사
    if (isNaN(categoryId) || categoryId <= 0) {
      sendError(res, 'INVALID_ID', '유효하지 않은 카테고리 ID입니다.', 400);
      return;
    }

    // 카테고리 존재 여부 확인
    const existingCategory = await prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!existingCategory) {
      sendError(res, 'NOT_FOUND', '존재하지 않는 카테고리입니다.', 404);
      return;
    }

    // 업데이트 데이터 구성
    const updateData: any = {};

    // name 업데이트 처리
    if (updates.name !== undefined) {
      if (typeof updates.name !== 'string' || updates.name.trim() === '') {
        sendError(res, 'INVALID_INPUT', '카테고리명은 필수입니다.', 400);
        return;
      }

      const trimmedName = updates.name.trim();

      // 다른 카테고리와의 중복 검사
      if (trimmedName !== existingCategory.name) {
        const duplicateCategory = await prisma.category.findUnique({
          where: { name: trimmedName },
        });

        if (duplicateCategory) {
          sendError(res, 'DUPLICATE_NAME', '이미 존재하는 카테고리명입니다.', 409);
          return;
        }
      }

      updateData.name = trimmedName;
    }

    // description 업데이트
    if (updates.description !== undefined) {
      updateData.description = updates.description || null;
    }

    // sortOrder 업데이트
    if (updates.sortOrder !== undefined) {
      if (typeof updates.sortOrder !== 'number' || updates.sortOrder < 0 || updates.sortOrder > 9999) {
        sendError(res, 'INVALID_INPUT', '정렬 순서는 0~9999 사이의 숫자여야 합니다.', 400);
        return;
      }
      updateData.sortOrder = updates.sortOrder;
    }

    // 업데이트된 카테고리 저장
    const updatedCategory = await prisma.category.update({
      where: { id: categoryId },
      data: updateData,
    });

    logger.info(`카테고리 수정: ${updatedCategory.name} (ID: ${categoryId})`);
    sendSuccess(res, updatedCategory);
  } catch (error) {
    logger.error('카테고리 수정 오류:', error);
    sendError(res, 'UPDATE_ERROR', '카테고리 수정 중 오류가 발생했습니다.', 500);
  }
});

/**
 * DELETE /api/categories/:id
 * 카테고리 삭제 (admin only)
 */
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const categoryId = parseInt(id);
    const prisma = getDbClient();

    // ID 유효성 검사
    if (isNaN(categoryId) || categoryId <= 0) {
      sendError(res, 'INVALID_ID', '유효하지 않은 카테고리 ID입니다.', 400);
      return;
    }

    // 카테고리 존재 여부 확인
    const existingCategory = await prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!existingCategory) {
      sendError(res, 'NOT_FOUND', '존재하지 않는 카테고리입니다.', 404);
      return;
    }

    // 해당 카테고리에 속한 웹사이트 개수 확인
    const websiteCount = await prisma.website.count({
      where: { categoryId: categoryId },
    });

    if (websiteCount > 0) {
      sendError(
        res,
        'CONFLICT',
        `이 카테고리에 속한 웹사이트가 ${websiteCount}개 있습니다. 먼저 웹사이트를 다른 카테고리로 이동하거나 삭제한 후에 카테고리를 삭제할 수 있습니다.`,
        409
      );
      return;
    }

    // 카테고리 삭제
    await prisma.category.delete({
      where: { id: categoryId },
    });

    logger.info(`카테고리 삭제: ${existingCategory.name} (ID: ${categoryId})`);
    sendSuccess(res, { message: '카테고리가 삭제되었습니다.' });
  } catch (error) {
    logger.error('카테고리 삭제 오류:', error);
    sendError(res, 'DELETE_ERROR', '카테고리 삭제 중 오류가 발생했습니다.', 500);
  }
});

export default router;
