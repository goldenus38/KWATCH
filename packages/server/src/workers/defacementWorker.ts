import { Worker, Job } from 'bullmq';
import { getRedisClient } from '../config/redis';
import { getDbClient } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';
import { defacementService } from '../services/DefacementService';
import { alertService } from '../services/AlertService';
import { emitDefacementDetected } from '../websocket/socketServer';
import { DefacementJobData, HybridDefacementResult, AlertType, Severity } from '../types';

/**
 * 심각도별 연속 감지 임계값
 * - 새 외부 도메인 주입: CRITICAL, 1회 (즉시)
 * - 페이지 구조 변경: CRITICAL, 2회 연속
 * - 픽셀만 변경: WARNING, 3회 연속
 */
const CONSECUTIVE_THRESHOLD_CRITICAL_DOMAIN = 1;
const CONSECUTIVE_THRESHOLD_CRITICAL_STRUCTURE = 2;
const CONSECUTIVE_THRESHOLD_WARNING_PIXEL = 3;

/**
 * 탐지 유형에 따른 심각도와 연속 임계값을 결정합니다
 */
function getAlertConfig(result: HybridDefacementResult): {
  severity: Severity;
  requiredConsecutive: number;
  reason: string;
} {
  if (result.detectionMethod === 'hybrid') {
    // 새 외부 도메인 주입 → CRITICAL, 즉시
    if (result.detectionDetails.newDomains.length > 0) {
      return {
        severity: Severity.CRITICAL,
        requiredConsecutive: CONSECUTIVE_THRESHOLD_CRITICAL_DOMAIN,
        reason: `새 외부 도메인 감지: ${result.detectionDetails.newDomains.join(', ')}`,
      };
    }
    // 구조 대폭 변경 (80% 미만) → CRITICAL, 2회
    if (result.detectionDetails.structuralScore < 80) {
      return {
        severity: Severity.CRITICAL,
        requiredConsecutive: CONSECUTIVE_THRESHOLD_CRITICAL_STRUCTURE,
        reason: `페이지 구조 변경 감지 (구조 유사도: ${result.detectionDetails.structuralScore.toFixed(1)}%)`,
      };
    }
  }
  // 픽셀만 변경 → WARNING, 3회
  return {
    severity: Severity.WARNING,
    requiredConsecutive: CONSECUTIVE_THRESHOLD_WARNING_PIXEL,
    reason: '시각적 변화 감지',
  };
}

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

        // 베이스라인과 현재 스크린샷 비교 (하이브리드)
        const result = await defacementService.compareWithBaseline(
          job.data.websiteId,
          job.data.screenshotId,
          job.data.htmlContent,
        );

        logger.info(
          `[DefacementWorker] Defacement check completed for website ${job.data.websiteId} [${result.detectionMethod}]: ` +
            `${result.isDefaced ? 'DEFACED' : 'NORMAL'} (hybrid=${result.hybridScore.toFixed(1)}%, pixel=${result.similarityScore.toFixed(1)}%)`,
        );

        // 위변조 감지 시: 심각도별 연속 감지 여부 확인 후 알림 발송
        if (result.isDefaced) {
          const alertConfig = getAlertConfig(result);

          // 최근 N회 체크 결과 조회 (방금 저장한 것 포함)
          const recentChecks = await prisma.defacementCheck.findMany({
            where: { websiteId: job.data.websiteId },
            orderBy: { checkedAt: 'desc' },
            take: alertConfig.requiredConsecutive,
            select: { isDefaced: true },
          });

          // 연속 위변조 횟수 계산
          let consecutiveDefaced = 0;
          for (const check of recentChecks) {
            if (check.isDefaced) {
              consecutiveDefaced++;
            } else {
              break;
            }
          }

          logger.debug(
            `[DefacementWorker] Website ${job.data.websiteId}: ${consecutiveDefaced}/${alertConfig.requiredConsecutive} consecutive defaced (${alertConfig.reason})`,
          );

          // 요구 횟수 충족 시 알림 발송
          if (consecutiveDefaced >= alertConfig.requiredConsecutive) {
            try {
              const website = await prisma.website.findUnique({
                where: { id: job.data.websiteId },
                select: { name: true },
              });

              if (website) {
                const scoreDetail = result.detectionMethod === 'hybrid'
                  ? `pixel=${result.similarityScore.toFixed(1)}%, 구조=${result.structuralScore}%, 도메인=${result.criticalElementsScore}%, 종합=${result.hybridScore.toFixed(1)}%`
                  : `유사도=${result.similarityScore.toFixed(1)}%`;

                await alertService.createAlert({
                  websiteId: job.data.websiteId,
                  alertType: AlertType.DEFACEMENT,
                  severity: alertConfig.severity,
                  message: `위변조 감지됨 - ${alertConfig.reason} (${consecutiveDefaced}회 연속, ${scoreDetail})`,
                });

                logger.info(
                  `[DefacementWorker] Defacement alert [${alertConfig.severity}] created for website ${job.data.websiteId} (${consecutiveDefaced} consecutive)`,
                );

                try {
                  emitDefacementDetected({
                    websiteId: job.data.websiteId,
                    websiteName: website.name,
                    similarityScore: result.hybridScore,
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
            }
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
        throw error;
      }
    },
    {
      connection: redis as any,
      concurrency: config.monitoring.defacementConcurrency,
    },
  );

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
