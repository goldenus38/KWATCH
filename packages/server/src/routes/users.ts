import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { getDbClient } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/response';
import { AuthenticatedRequest } from '../types';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/users
 * 전체 사용자 목록 조회 (passwordHash 제외)
 */
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const prisma = getDbClient();
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { id: 'asc' },
    });

    sendSuccess(res, users);
  } catch (error) {
    logger.error(`Get users error: ${error instanceof Error ? error.message : String(error)}`);
    sendError(res, 'GET_USERS_ERROR', '사용자 목록 조회 중 오류가 발생했습니다.', 500);
  }
});

/**
 * POST /api/users
 * 사용자 생성
 */
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { username, password, email, role } = req.body;
    const prisma = getDbClient();

    // 입력 유효성 검사
    if (!username || !password) {
      sendError(res, 'INVALID_INPUT', '사용자명과 비밀번호는 필수입니다.', 400);
      return;
    }

    const trimmedUsername = String(username).trim();
    if (trimmedUsername.length < 1 || trimmedUsername.length > 50) {
      sendError(res, 'INVALID_INPUT', '사용자명은 1~50자여야 합니다.', 400);
      return;
    }

    if (String(password).length < 6 || String(password).length > 128) {
      sendError(res, 'INVALID_INPUT', '비밀번호는 6~128자여야 합니다.', 400);
      return;
    }

    const validRoles: Role[] = [Role.VIEWER, Role.ANALYST, Role.ADMIN];
    const userRole = (role ? String(role).toUpperCase() : 'VIEWER') as Role;
    if (!validRoles.includes(userRole)) {
      sendError(res, 'INVALID_INPUT', '역할은 VIEWER, ANALYST, ADMIN 중 하나여야 합니다.', 400);
      return;
    }

    // 중복 확인
    const existing = await prisma.user.findUnique({
      where: { username: trimmedUsername },
    });
    if (existing) {
      sendError(res, 'DUPLICATE_USERNAME', '이미 존재하는 사용자명입니다.', 409);
      return;
    }

    // 비밀번호 해시
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username: trimmedUsername,
        passwordHash,
        email: email || null,
        role: userRole,
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logger.info(`User created: ${user.username} (id: ${user.id}) by ${(req as AuthenticatedRequest).user?.username}`);
    sendSuccess(res, user, 201);
  } catch (error) {
    logger.error(`Create user error: ${error instanceof Error ? error.message : String(error)}`);
    sendError(res, 'CREATE_USER_ERROR', '사용자 생성 중 오류가 발생했습니다.', 500);
  }
});

/**
 * PUT /api/users/:id
 * 사용자 수정 (email, role, isActive, password 선택)
 */
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      sendError(res, 'INVALID_INPUT', '유효하지 않은 사용자 ID입니다.', 400);
      return;
    }

    const prisma = getDbClient();
    const { email, role, isActive, password } = req.body;

    // 대상 사용자 조회
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) {
      sendError(res, 'NOT_FOUND', '사용자를 찾을 수 없습니다.', 404);
      return;
    }

    // admin 계정 보호
    if (target.username.toLowerCase() === 'admin') {
      sendError(res, 'FORBIDDEN', 'admin 계정은 수정할 수 없습니다.', 403);
      return;
    }

    // 업데이트 데이터 구성
    const updateData: Record<string, unknown> = {};

    if (email !== undefined) {
      updateData.email = email || null;
    }

    if (role !== undefined) {
      const validRoles: Role[] = [Role.VIEWER, Role.ANALYST, Role.ADMIN];
      const userRole = String(role).toUpperCase() as Role;
      if (!validRoles.includes(userRole)) {
        sendError(res, 'INVALID_INPUT', '역할은 VIEWER, ANALYST, ADMIN 중 하나여야 합니다.', 400);
        return;
      }
      updateData.role = userRole;
    }

    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive);
    }

    if (password) {
      if (String(password).length < 6 || String(password).length > 128) {
        sendError(res, 'INVALID_INPUT', '비밀번호는 6~128자여야 합니다.', 400);
        return;
      }
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logger.info(`User updated: ${user.username} (id: ${user.id}) by ${(req as AuthenticatedRequest).user?.username}`);
    sendSuccess(res, user);
  } catch (error) {
    logger.error(`Update user error: ${error instanceof Error ? error.message : String(error)}`);
    sendError(res, 'UPDATE_USER_ERROR', '사용자 수정 중 오류가 발생했습니다.', 500);
  }
});

/**
 * DELETE /api/users/:id
 * 사용자 삭제
 */
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      sendError(res, 'INVALID_INPUT', '유효하지 않은 사용자 ID입니다.', 400);
      return;
    }

    const prisma = getDbClient();

    // 대상 사용자 조회
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) {
      sendError(res, 'NOT_FOUND', '사용자를 찾을 수 없습니다.', 404);
      return;
    }

    // admin 계정 보호
    if (target.username.toLowerCase() === 'admin') {
      sendError(res, 'FORBIDDEN', 'admin 계정은 삭제할 수 없습니다.', 403);
      return;
    }

    await prisma.user.delete({ where: { id: userId } });

    logger.info(`User deleted: ${target.username} (id: ${target.id}) by ${(req as AuthenticatedRequest).user?.username}`);
    res.status(204).send();
  } catch (error) {
    logger.error(`Delete user error: ${error instanceof Error ? error.message : String(error)}`);
    sendError(res, 'DELETE_USER_ERROR', '사용자 삭제 중 오류가 발생했습니다.', 500);
  }
});

export default router;
