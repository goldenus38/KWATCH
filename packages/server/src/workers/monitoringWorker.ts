import { Worker, Job } from 'bullmq';
import { getRedisClient } from '../config/redis';
import { getDbClient } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';
import { monitoringService } from '../services/MonitoringService';
import { alertService } from '../services/AlertService';
import { schedulerService } from '../services/SchedulerService';
import { emitStatusUpdate } from '../websocket/socketServer';
import { MonitoringJobData } from '../types';

/**
 * 모니터링 큐 워커
 * HTTP 상태 확인 작업을 처리하고 스크린샷 작업을 트리거합니다.
 */
export async function initMonitoringWorker(): Promise<Worker<MonitoringJobData>> {
  const redis = getRedisClient();

  const worker = new Worker<MonitoringJobData>(
    'monitoring-queue',
    async (job: Job<MonitoringJobData>) => {
      try {
        logger.debug(`[MonitoringWorker] Processing job ${job.id} for website ${job.data.websiteId}`);

        // HTTP 상태 확인
        const result = await monitoringService.checkWebsite(
          job.data.url,
          job.data.timeoutSeconds,
        );

        logger.info(
          `[MonitoringWorker] Health check completed for website ${job.data.websiteId}: ` +
            `${result.isUp ? 'UP' : 'DOWN'} (${result.responseTimeMs}ms)`,
        );

        // DB에 결과 저장
        const prisma = getDbClient();

        const previousResult = await prisma.monitoringResult.findFirst({
          where: { websiteId: job.data.websiteId },
          orderBy: { checkedAt: 'desc' },
        });

        await prisma.monitoringResult.create({
          data: {
            websiteId: job.data.websiteId,
            statusCode: result.statusCode,
            responseTimeMs: result.responseTimeMs,
            isUp: result.isUp,
            errorMessage: result.errorMessage,
          },
        });

        // WebSocket 상태 업데이트
        const status = await monitoringService.getStatus(job.data.websiteId);
        if (status) {
          emitStatusUpdate(job.data.websiteId, status);
        }

        // 알림 처리
        if (!result.isUp) {
          await alertService.createAlert({
            websiteId: job.data.websiteId,
            alertType: 'DOWN',
            severity: 'CRITICAL',
            message: `웹사이트 접속 불가 - ${result.errorMessage || `HTTP ${result.statusCode}`}`,
          });
        } else if (result.responseTimeMs > 3000) {
          await alertService.createAlert({
            websiteId: job.data.websiteId,
            alertType: 'SLOW',
            severity: 'WARNING',
            message: `응답 시간 지연 - ${result.responseTimeMs}ms`,
          });
        }

        // 이전에 DOWN이었다가 복구된 경우
        if (result.isUp && previousResult && !previousResult.isUp) {
          await alertService.createAlert({
            websiteId: job.data.websiteId,
            alertType: 'RECOVERED',
            severity: 'INFO',
            message: `웹사이트 복구 완료 - 응답 시간 ${result.responseTimeMs}ms`,
          });
        }

        // 스크린샷 작업 큐에 추가 (Redis rate limit으로 주기 제한)
        // DOWN 사이트는 스크린샷도 실패할 것이 확실하므로 스킵
        if (!result.isUp) {
          logger.debug(`[MonitoringWorker] Skipping screenshot for DOWN website ${job.data.websiteId}`);
        } else {
          try {
            const redis = getRedisClient();
            const screenshotInterval = config.monitoring.screenshotInterval;
            const rateLimitKey = `screenshot:ratelimit:${job.data.websiteId}`;
            const isLimited = await redis.get(rateLimitKey);

            if (!isLimited) {
              await redis.set(rateLimitKey, '1', 'EX', screenshotInterval);
              await schedulerService.enqueueScreenshot(
                {
                  id: job.data.websiteId,
                  url: job.data.url,
                },
                false,
              );
              logger.debug(`[MonitoringWorker] Screenshot job enqueued for website ${job.data.websiteId}`);
            }
          } catch (error) {
            logger.warn(
              `[MonitoringWorker] Failed to enqueue screenshot for website ${job.data.websiteId}:`,
              error,
            );
            // 스크린샷 큐 등록 실패는 경고만 하고 계속 진행
          }
        }

        return {
          websiteId: job.data.websiteId,
          result,
          completedAt: new Date(),
        };
      } catch (error) {
        logger.error(
          `[MonitoringWorker] Error processing job ${job.id} for website ${job.data.websiteId}:`,
          error,
        );
        // 개별 웹사이트 체크 실패가 워커 프로세스를 중단시키지 않도록 격리
        throw error;
      }
    },
    {
      connection: redis as any,
      concurrency: config.monitoring.monitoringConcurrency,
    },
  );

  // 워커 이벤트 리스너
  worker.on('completed', (job: Job<MonitoringJobData>) => {
    logger.debug(`[MonitoringWorker] Job ${job.id} completed for website ${job.data.websiteId}`);
  });

  worker.on('failed', (job: Job<MonitoringJobData> | undefined, err: Error) => {
    logger.warn(
      `[MonitoringWorker] Job ${job?.id} failed for website ${job?.data.websiteId}:`,
      err,
    );
  });

  worker.on('error', (err: Error) => {
    logger.error('[MonitoringWorker] Worker error:', err);
  });

  logger.info('[MonitoringWorker] Worker initialized and listening');
  return worker;
}
