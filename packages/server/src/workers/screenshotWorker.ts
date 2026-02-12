import { Worker, Job } from 'bullmq';
import { getRedisClient } from '../config/redis';
import { getDbClient } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';
import { screenshotService } from '../services/ScreenshotService';
import { schedulerService } from '../services/SchedulerService';
import { htmlAnalysisService } from '../services/HtmlAnalysisService';
import { ScreenshotJobData } from '../types';

/**
 * 스크린샷 캡처 큐 워커
 * Playwright를 이용하여 웹사이트 스크린샷을 캡처하고 위변조 체크 작업을 트리거합니다.
 */
export async function initScreenshotWorker(): Promise<Worker<ScreenshotJobData>> {
  const redis = getRedisClient();
  const prisma = getDbClient();

  const worker = new Worker<ScreenshotJobData>(
    'screenshot-queue',
    async (job: Job<ScreenshotJobData>) => {
      let screenshotId: bigint | null = null;

      try {
        logger.debug(
          `[ScreenshotWorker] Processing job ${job.id} for website ${job.data.websiteId}`,
        );

        // 스크린샷 캡처
        const screenshot = await screenshotService.captureScreenshot(
          job.data.websiteId,
          job.data.url,
        );

        logger.info(
          `[ScreenshotWorker] Screenshot captured for website ${job.data.websiteId}: ` +
            `${screenshot.filePath} (${screenshot.fileSize} bytes)`,
        );

        // 방금 생성된 스크린샷 ID를 조회
        const screenshotRecord = await prisma.screenshot.findFirst({
          where: { websiteId: job.data.websiteId },
          orderBy: { capturedAt: 'desc' },
        });

        if (!screenshotRecord) {
          throw new Error(`Failed to retrieve screenshot record for website ${job.data.websiteId}`);
        }

        screenshotId = screenshotRecord.id;

        // 베이스라인이 있으면 위변조 체크 작업 큐에 추가
        const baseline = await prisma.defacementBaseline.findFirst({
          where: {
            websiteId: job.data.websiteId,
            isActive: true,
          },
        });

        if (baseline) {
          // 위변조 체크 작업 큐에 추가 (Redis rate limit으로 주기 제한)
          try {
            const defacementInterval = config.monitoring.defacementInterval;
            const rateLimitKey = `defacement:ratelimit:${job.data.websiteId}`;
            const isLimited = await redis.get(rateLimitKey);

            if (!isLimited) {
              await redis.set(rateLimitKey, '1', 'EX', defacementInterval);
              await schedulerService.enqueueDefacementCheck(
                job.data.websiteId,
                screenshotId,
                baseline.id,
                screenshot.htmlContent,
              );
              logger.debug(
                `[ScreenshotWorker] Defacement check job enqueued for website ${job.data.websiteId}`,
              );
            }
          } catch (error) {
            logger.warn(
              `[ScreenshotWorker] Failed to enqueue defacement check for website ${job.data.websiteId}:`,
              error,
            );
          }
        } else {
          // 베이스라인이 없으면 현재 스크린샷을 베이스라인으로 자동 등록
          try {
            // HTML 베이스라인 데이터 생성
            let htmlBaselineData: { htmlHash: string; structuralHash: string; domainWhitelist: string[] } | null = null;
            if (screenshot.htmlContent && config.monitoring.htmlAnalysisEnabled) {
              try {
                const website = await prisma.website.findUnique({
                  where: { id: job.data.websiteId },
                  select: { url: true, ignoreSelectors: true },
                });
                const ignoreSelectors = (website?.ignoreSelectors as string[] | null) || [];
                htmlBaselineData = htmlAnalysisService.createBaselineData(
                  screenshot.htmlContent,
                  website?.url || job.data.url,
                  ignoreSelectors,
                );
              } catch (e) {
                logger.warn(
                  `[ScreenshotWorker] HTML baseline data extraction failed for website ${job.data.websiteId}:`,
                  e,
                );
              }
            }

            await prisma.defacementBaseline.create({
              data: {
                websiteId: job.data.websiteId,
                screenshotId,
                isActive: true,
                hash: null,
                ...(htmlBaselineData && {
                  htmlHash: htmlBaselineData.htmlHash,
                  structuralHash: htmlBaselineData.structuralHash,
                  domainWhitelist: htmlBaselineData.domainWhitelist,
                }),
              },
            });
            logger.info(
              `[ScreenshotWorker] Auto-registered baseline for website ${job.data.websiteId} ` +
                `(screenshot ${screenshotId}${htmlBaselineData ? ', htmlHash: ' + htmlBaselineData.htmlHash.slice(0, 8) + '...' : ''})`,
            );
          } catch (error) {
            logger.warn(
              `[ScreenshotWorker] Failed to auto-register baseline for website ${job.data.websiteId}:`,
              error,
            );
          }
        }

        return {
          websiteId: job.data.websiteId,
          screenshotId: Number(screenshotId),
          filePath: screenshot.filePath,
          fileSize: screenshot.fileSize,
          completedAt: new Date(),
        };
      } catch (error) {
        logger.error(
          `[ScreenshotWorker] Error processing job ${job.id} for website ${job.data.websiteId}:`,
          error,
        );
        // 개별 스크린샷 캡처 실패가 워커 프로세스를 중단시키지 않도록 격리
        throw error;
      }
    },
    {
      connection: redis as any,
      concurrency: 5, // 동시에 5개의 스크린샷 캡처 작업 처리 (리소스 집약적)
    },
  );

  // 워커 이벤트 리스너
  worker.on('completed', (job: Job<ScreenshotJobData>) => {
    logger.debug(`[ScreenshotWorker] Job ${job.id} completed for website ${job.data.websiteId}`);
  });

  worker.on('failed', (job: Job<ScreenshotJobData> | undefined, err: Error) => {
    logger.warn(
      `[ScreenshotWorker] Job ${job?.id} failed for website ${job?.data.websiteId}:`,
      err,
    );
  });

  worker.on('error', (err: Error) => {
    logger.error('[ScreenshotWorker] Worker error:', err);
  });

  logger.info('[ScreenshotWorker] Worker initialized and listening');
  return worker;
}
