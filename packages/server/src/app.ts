import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer, Server as HTTPServer } from 'http';
import { config } from './config';
import { logger } from './utils/logger';
import { getDbClient, disconnectDb } from './config/database';
import { getRedisClient, disconnectRedis } from './config/redis';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { initSocketServer, closeSocketServer } from './websocket/socketServer';
import { schedulerService } from './services/SchedulerService';
import { screenshotService } from './services/ScreenshotService';
import { initMonitoringWorker } from './workers/monitoringWorker';
import { initScreenshotWorker } from './workers/screenshotWorker';
import { initDefacementWorker } from './workers/defacementWorker';
import apiRouter from './routes';

// BigInt를 JSON으로 직렬화할 수 있도록 설정 (Prisma BIGSERIAL 필드 지원)
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

/**
 * Express 앱을 생성하고 초기화합니다
 */
export function createApp(): Express {
  const app = express();

  // 신뢰할 수 있는 프록시 설정
  app.set('trust proxy', 1);

  // 미들웨어 설정
  app.use(helmet());
  app.use(cors({
    origin: config.isDev
      ? ['http://localhost:3000', 'http://localhost:3001']
      : (process.env.ALLOWED_ORIGINS?.split(',') || []),
    credentials: true,
  }));
  // 로그 포맷: 개발 시 dev, 프로덕션 시 combined
  app.use(morgan(config.isDev ? 'dev' : 'combined', {
    stream: { write: (message: string) => logger.info(message.trim()) },
  }));

  // JSON 파싱 (최대 1MB - 대량 등록 등 고려)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ limit: '1mb', extended: true }));

  // API 라우트 마운트
  app.use('/api', apiRouter);

  // 404 Not Found 핸들러
  app.use(notFoundHandler);

  // 전역 에러 핸들러 (반드시 마지막)
  app.use(errorHandler);

  return app;
}

/**
 * 애플리케이션을 시작합니다
 */
async function startServer(): Promise<void> {
  try {
    logger.info('Initializing KWATCH server...');

    // Express 앱 생성
    const app: Express = createApp();

    // HTTP 서버 생성
    const httpServer: HTTPServer = createServer(app);

    // Socket.IO 서버 초기화
    const io = initSocketServer(httpServer);

    // 데이터베이스 연결 확인
    logger.info('Connecting to database...');
    const prisma = getDbClient();
    await prisma.$queryRaw`SELECT 1`; // 연결 테스트
    logger.info('Database connected');

    // Redis 연결 확인
    logger.info('Connecting to Redis...');
    const redis = getRedisClient();
    await redis.ping();
    logger.info('Redis connected');

    // Bull Queue 초기화
    logger.info('Initializing Bull Queues...');
    await schedulerService.initQueues();

    // 워커 초기화 (별도 프로세스에서 실행되지만, 단일 프로세스 환경에서는 여기서 초기화)
    logger.info('Initializing workers...');
    const monitoringWorker = await initMonitoringWorker();
    const screenshotWorker = await initScreenshotWorker();
    const defacementWorker = await initDefacementWorker();

    // 모든 활성 웹사이트의 모니터링 스케줄
    logger.info('Scheduling monitoring for all active websites...');
    await schedulerService.scheduleAllWebsites();

    // 서버 시작
    const port = config.port;
    httpServer.listen(port, () => {
      logger.info(
        `KWATCH server is running on port ${port} ` +
          `(${config.isDev ? 'development' : 'production'} mode)`,
      );
    });

    // Graceful Shutdown 핸들러
    const gracefulShutdown = async (signal: string) => {
      logger.info(`\nReceived ${signal}, initiating graceful shutdown...`);

      try {
        // 새로운 요청 수락 중지
        httpServer.close(() => {
          logger.info('HTTP server closed');
        });

        // Socket.IO 연결 종료
        await closeSocketServer();

        // 스케줄러 정리
        logger.info('Cleaning up scheduler...');
        await schedulerService.cleanup();

        // 브라우저 종료
        logger.info('Closing Playwright browser...');
        await screenshotService.closeBrowser();

        // Redis 연결 종료
        logger.info('Disconnecting from Redis...');
        await disconnectRedis();

        // 데이터베이스 연결 종료
        logger.info('Disconnecting from database...');
        await disconnectDb();

        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // 예외 처리
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason: unknown) => {
      logger.error('Unhandled rejection:', reason);
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// 서버 시작 (직접 실행 시에만, 테스트에서 import 시 실행 방지)
if (require.main === module) {
  startServer();
}
