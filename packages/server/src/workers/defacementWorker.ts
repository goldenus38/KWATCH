import { Worker, Job } from 'bullmq';
import { getRedisClient } from '../config/redis';
import { getDbClient } from '../config/database';
import { logger } from '../utils/logger';
import { defacementService } from '../services/DefacementService';
import { alertService } from '../services/AlertService';
import { emitDefacementDetected } from '../websocket/socketServer';
import { DefacementJobData, AlertType, Severity } from '../types';

/**
 * 위변조 탐지 큐 워커
 * 베이스라인과 현재 스크린샷을 비교하여 위변조 여부를 판정합니다.
 */
export async function initDefacementWorker(): Promise<Worker<DefacementJobData>> {
  const redis = getRedisClient();
  const prisma = getDbClient();

  const worker = new Worker<DefacementJobData>(
    'defacement-queue',
    async (job: Job<DefacementJobData>) => {
      try {
        logger.debug(
          `[DefacementWorker] Processing job ${job.id} for website ${job.data.websiteId}`,
        );

        // 베이스라인과 현재 스크린샷 비교
        const result = await defacementService.compareWithBaseline(
          job.data.websiteId,
          job.data.screenshotId,
        );

        logger.info(
          `[DefacementWorker] Defacement check completed for website ${job.data.websiteId}: ` +
            `${result.isDefaced ? 'DEFACED' : 'NORMAL'} (similarity: ${result.similarityScore.toFixed(2)}%)`,
        );

        // 위변조 감지 시 알림 발송 및 WebSocket 브로드캐스트
        if (result.isDefaced) {
          try {
            // 웹사이트 정보 조회
            const website = await prisma.website.findUnique({
              where: { id: job.data.websiteId },
              select: { name: true },
            });

            if (website) {
              // 알림 생성
              await alertService.createAlert({
                websiteId: job.data.websiteId,
                alertType: AlertType.DEFACEMENT,
                severity: Severity.CRITICAL,
                message: `위변조 감지됨 (유사도: ${result.similarityScore.toFixed(2)}%)`,
              });

              logger.info(
                `[DefacementWorker] Defacement alert created for website ${job.data.websiteId}`,
              );

              // WebSocket으로 대시보드에 브로드캐스트
              try {
                emitDefacementDetected({
                  websiteId: job.data.websiteId,
                  websiteName: website.name,
                  similarityScore: result.similarityScore,
                  diffImageUrl: result.diffImagePath
                    ? `/api/defacement/diff/${job.data.websiteId}`
                    : null,
                });
              } catch (error) {
                logger.warn(
                  `[DefacementWorker] Failed to emit WebSocket event for website ${job.data.websiteId}:`,
                  error,
                );
              }
            }
          } catch (error) {
            logger.warn(
              `[DefacementWorker] Failed to process defacement alert for website ${job.data.websiteId}:`,
              error,
            );
            // 알림 발송 실패는 경고만 하고 계속 진행
          }
        }

        return {
          websiteId: job.data.websiteId,
          result,
          completedAt: new Date(),
        };
      } catch (error) {
        logger.error(
          `[DefacementWorker] Error processing job ${job.id} for website ${job.data.websiteId}:`,
          error,
        );
        // 개별 위변조 체크 실패가 워커 프로세스를 중단시키지 않도록 격리
        throw error;
      }
    },
    {
      connection: redis as any,
      concurrency: 5, // 동시에 5개의 위변조 체크 작업 처리
    },
  );

  // 워커 이벤트 리스너
  worker.on('completed', (job: Job<DefacementJobData>) => {
    logger.debug(
      `[DefacementWorker] Job ${job.id} completed for website ${job.data.websiteId}`,
    );
  });

  worker.on('failed', (job: Job<DefacementJobData> | undefined, err: Error) => {
    logger.warn(
      `[DefacementWorker] Job ${job?.id} failed for website ${job?.data.websiteId}:`,
      err,
    );
  });

  worker.on('error', (err: Error) => {
    logger.error('[DefacementWorker] Worker error:', err);
  });

  logger.info('[DefacementWorker] Worker initialized and listening');
  return worker;
}
