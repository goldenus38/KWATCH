import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDbClient } from '../config/database';
import { config } from '../config';
import { loginLimiter } from '../middleware/rateLimiter';
import { authenticate } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/response';
import { AuthenticatedRequest, LoginRequest, LoginResponse, JwtPayload } from '../types';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/auth/login
 * 사용자 로그인 (JWT 토큰 발급)
 */
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body as LoginRequest;
    const prisma = getDbClient();

    // 입력 유효성 검사
    if (!username || !password) {
      sendError(res, 'INVALID_INPUT', '사용자명과 비밀번호를 입력해주세요.', 400);
      return;
    }

    // 입력값 정제 및 길이 제한
    const trimmedUsername = String(username).trim();
    if (trimmedUsername.length === 0 || trimmedUsername.length > 50) {
      sendError(res, 'INVALID_INPUT', '사용자명은 1~50자여야 합니다.', 400);
      return;
    }
    if (String(password).length > 128) {
      sendError(res, 'INVALID_INPUT', '비밀번호가 너무 깁니다.', 400);
      return;
    }

    // 데이터베이스에서 사용자 조회
    const user = await prisma.user.findUnique({
      where: { username: trimmedUsername },
    });

    if (!user) {
      // 보안: 로그에 사용자 입력 원문 노출 방지
      logger.warn('Login attempt failed: user not found');
      sendError(res, 'INVALID_CREDENTIALS', '사용자명 또는 비밀번호가 올바르지 않습니다.', 401);
      return;
    }

    // 사용자 활성 상태 확인
    if (!user.isActive) {
      logger.warn(`Login attempt failed: inactive user (userId: ${user.id})`);
      // 보안: 비활성 사용자도 동일한 에러 메시지 반환 (계정 존재 여부 추측 방지)
      sendError(res, 'INVALID_CREDENTIALS', '사용자명 또는 비밀번호가 올바르지 않습니다.', 401);
      return;
    }

    // 비밀번호 검증 (bcrypt)
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      logger.warn(`Login attempt failed: invalid password (userId: ${user.id})`);
      sendError(res, 'INVALID_CREDENTIALS', '사용자명 또는 비밀번호가 올바르지 않습니다.', 401);
      return;
    }

    // JWT 토큰 생성
    const jwtPayload: JwtPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
    };

    const token = jwt.sign(jwtPayload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn as string | number,
    } as jwt.SignOptions);

    logger.info(`User logged in successfully (userId: ${user.id}, username: ${user.username})`);

    // 응답 생성
    const loginResponse: LoginResponse = {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    };

    sendSuccess(res, loginResponse, 200);
  } catch (error) {
    logger.error(`Login error: ${error instanceof Error ? error.message : String(error)}`);
    sendError(res, 'LOGIN_ERROR', '로그인 중 오류가 발생했습니다.', 500);
  }
});

/**
 * POST /api/auth/logout
 * 사용자 로그아웃
 */
router.post('/logout', authenticate, (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.userId;
    const username = authReq.user?.username;

    logger.info(`User logged out (userId: ${userId}, username: ${username})`);

    // JWT는 stateless이므로 서버 쪽에서 추가 처리 불필요
    // 클라이언트에서 토큰 삭제 권장
    sendSuccess(res, { message: '로그아웃되었습니다.' });
  } catch (error) {
    logger.error(`Logout error: ${error instanceof Error ? error.message : String(error)}`);
    sendError(res, 'LOGOUT_ERROR', '로그아웃 중 오류가 발생했습니다.', 500);
  }
});

/**
 * GET /api/auth/me
 * 현재 로그인한 사용자 정보 조회
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.userId;
    const prisma = getDbClient();

    if (!userId) {
      sendError(res, 'UNAUTHORIZED', '인증 정보를 확인할 수 없습니다.', 401);
      return;
    }

    // 데이터베이스에서 사용자 정보 조회
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      logger.warn(`User not found in database (userId: ${userId})`);
      sendError(res, 'USER_NOT_FOUND', '사용자 정보를 조회할 수 없습니다.', 404);
      return;
    }

    // 응답 (passwordHash는 제외)
    const userInfo = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    sendSuccess(res, userInfo);
  } catch (error) {
    logger.error(`Get user error: ${error instanceof Error ? error.message : String(error)}`);
    sendError(res, 'GET_USER_ERROR', '사용자 정보 조회 중 오류가 발생했습니다.', 500);
  }
});

export default router;
