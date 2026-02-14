import { getDbClient } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';
import {
  MonitoringStatus,
  DashboardSummary,
} from '../types';

/**
 * 연속 실패 판정 임계값
 * 최근 N회 체크가 모두 실패(isUp=false)인 경우에만 장애로 판정
 * 일시적 네트워크 장애, 서버 재시작 등으로 인한 오탐 방지
 */
const CONSECUTIVE_FAILURE_THRESHOLD = 5;
const CONSECUTIVE_DEFACEMENT_THRESHOLD = 3;

/**
 * 최근 체크 결과에서 연속 실패 횟수를 계산합니다
 * @param results 최신순으로 정렬된 모니터링 결과 배열
 * @returns 최근 연속 실패 횟수
 */
function getConsecutiveFailures(results: { isUp: boolean }[]): number {
  let count = 0;
  for (const result of results) {
    if (!result.isUp) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * 웹사이트 HTTP 상태 체크 서비스
 * 각 웹사이트의 상태 코드, 응답 시간, 정상 여부 등을 모니터링합니다.
 *
 * 장애 판정 로직:
 * - 개별 체크 결과는 그대로 DB에 저장 (isUp = HTTP 2xx 여부)
 * - 대시보드 표시 상태는 최근 5회 연속 실패 시에만 장애(down)로 판정
 * - 1~4회 실패는 정상으로 유지 (일시적 장애 무시)
 */
export class MonitoringService {
  private prisma = getDbClient();

  /**
   * 단일 웹사이트의 HTTP 상태를 확인합니다
   * @param url 확인할 웹사이트 URL
   * @param timeoutSeconds 타임아웃 시간 (초)
   * @returns 상태 정보 {statusCode, responseTimeMs, isUp, errorMessage}
   */
  async checkWebsite(
    url: string,
    timeoutSeconds: number = config.monitoring.defaultTimeout,
  ): Promise<{
    statusCode: number | null;
    responseTimeMs: number;
    isUp: boolean;
    errorMessage: string | null;
    finalUrl: string | null;
  }> {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

      let response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'KWATCH/1.0 (+http://example.com)',
        },
      });

      // HEAD 요청이 비-2xx면 GET으로 fallback (많은 서버가 HEAD를 차단)
      if (response.status >= 400) {
        const fallbackController = new AbortController();
        const fallbackTimeoutId = setTimeout(
          () => fallbackController.abort(),
          timeoutSeconds * 1000,
        );

        response = await fetch(url, {
          method: 'GET',
          signal: fallbackController.signal,
          redirect: 'follow',
          headers: {
            'User-Agent': 'KWATCH/1.0 (+http://example.com)',
          },
        });

        clearTimeout(fallbackTimeoutId);
      }

      clearTimeout(timeoutId);

      const responseTimeMs = Date.now() - startTime;
      // 서버가 응답하면 정상 (4xx도 서버 작동 중), 5xx만 장애로 판정
      const isUp = response.status < 500;

      return {
        statusCode: response.status,
        responseTimeMs,
        isUp,
        errorMessage: null,
        finalUrl: response.url || null,
      };
    } catch (error: unknown) {
      const responseTimeMs = Date.now() - startTime;
      let errorMessage = 'Unknown error';

      if (error instanceof Error) {
        const cause = (error as any).cause;
        errorMessage = cause?.message || cause?.code || error.message;
        if (error.name === 'AbortError') {
          errorMessage = `Request timeout (${timeoutSeconds}s)`;
        }
      }

      logger.warn(`Health check failed for ${url}: ${errorMessage}`);

      return {
        statusCode: null,
        responseTimeMs,
        isUp: false,
        errorMessage,
        finalUrl: null,
      };
    }
  }

  /**
   * 특정 웹사이트의 최신 상태를 조회합니다
   * 최근 5회 연속 실패 시에만 장애(isUp=false)로 판정
   * @param websiteId 웹사이트 ID
   * @returns MonitoringStatus 객체
   */
  async getStatus(websiteId: number): Promise<MonitoringStatus | null> {
    try {
      const website = await this.prisma.website.findUnique({
        where: { id: websiteId },
        include: {
          monitoringResults: {
            orderBy: { checkedAt: 'desc' },
            take: CONSECUTIVE_FAILURE_THRESHOLD,
          },
          screenshots: {
            orderBy: { capturedAt: 'desc' },
            take: 1,
          },
          defacementChecks: {
            orderBy: { checkedAt: 'desc' },
            take: CONSECUTIVE_DEFACEMENT_THRESHOLD,
          },
        },
      });

      if (!website) {
        return null;
      }

      const results = website.monitoringResults;
      const latestResult = results[0];
      const latestScreenshot = website.screenshots[0];
      const defacementChecks = website.defacementChecks;
      const latestDefacement = defacementChecks[0];

      // 연속 실패 판정: 최근 5회가 모두 실패해야 장애
      const consecutiveFailures = getConsecutiveFailures(results);
      const isDown = consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD;

      // 연속 위변조 판정: 최근 3회가 모두 위변조여야 위변조
      let consecutiveDefaced = 0;
      for (const check of defacementChecks) {
        if (check.isDefaced) consecutiveDefaced++;
        else break;
      }
      const isDefaced = consecutiveDefaced >= CONSECUTIVE_DEFACEMENT_THRESHOLD;

      return {
        websiteId: website.id,
        websiteName: website.name,
        organizationName: website.organizationName,
        url: website.url,
        finalUrl: latestResult?.finalUrl ?? null,
        statusCode: latestResult?.statusCode ?? null,
        responseTimeMs: latestResult?.responseTimeMs ?? null,
        isUp: latestResult ? !isDown : false,
        errorMessage: latestResult?.errorMessage ?? null,
        checkedAt: latestResult?.checkedAt ?? new Date(),
        screenshotUrl: latestScreenshot ? `/api/screenshots/image/${latestScreenshot.id}` : null,
        thumbnailUrl: latestScreenshot ? `/api/screenshots/thumbnail/${latestScreenshot.id}` : null,
        defacementStatus: latestDefacement
          ? {
              isDefaced,
              similarityScore: latestDefacement.similarityScore
                ? Number(latestDefacement.similarityScore)
                : null,
              htmlSimilarityScore: latestDefacement.htmlSimilarityScore
                ? Number(latestDefacement.htmlSimilarityScore)
                : null,
              detectionMethod: latestDefacement.htmlSimilarityScore != null
                ? 'hybrid' : 'pixel_only',
            }
          : null,
      };
    } catch (error) {
      logger.error(`getStatus failed for website ${websiteId}:`, error);
      throw error;
    }
  }

  /**
   * 모든 활성 웹사이트의 상태를 조회합니다
   * 최근 5회 연속 실패 시에만 장애로 판정
   * @returns MonitoringStatus 배열
   */
  async getAllStatuses(): Promise<MonitoringStatus[]> {
    try {
      const websites = await this.prisma.website.findMany({
        where: { isActive: true },
        include: {
          monitoringResults: {
            orderBy: { checkedAt: 'desc' },
            take: CONSECUTIVE_FAILURE_THRESHOLD,
          },
          screenshots: {
            orderBy: { capturedAt: 'desc' },
            take: 1,
          },
          defacementChecks: {
            orderBy: { checkedAt: 'desc' },
            take: CONSECUTIVE_DEFACEMENT_THRESHOLD,
          },
        },
      });

      return websites.map((website) => {
        const results = website.monitoringResults;
        const latestResult = results[0];
        const latestScreenshot = website.screenshots[0];
        const defacementChecks = website.defacementChecks;
        const latestDefacement = defacementChecks[0];

        const consecutiveFailures = getConsecutiveFailures(results);
        const isDown = consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD;

        // 연속 위변조 판정
        let consecutiveDefaced = 0;
        for (const check of defacementChecks) {
          if (check.isDefaced) consecutiveDefaced++;
          else break;
        }
        const isDefaced = consecutiveDefaced >= CONSECUTIVE_DEFACEMENT_THRESHOLD;

        return {
          websiteId: website.id,
          websiteName: website.name,
          organizationName: website.organizationName,
          url: website.url,
          finalUrl: latestResult?.finalUrl ?? null,
          statusCode: latestResult?.statusCode ?? null,
          responseTimeMs: latestResult?.responseTimeMs ?? null,
          isUp: latestResult ? !isDown : false,
          errorMessage: latestResult?.errorMessage ?? null,
          checkedAt: latestResult?.checkedAt ?? new Date(),
          screenshotUrl: latestScreenshot ? `/api/screenshots/image/${latestScreenshot.id}` : null,
          thumbnailUrl: latestScreenshot ? `/api/screenshots/thumbnail/${latestScreenshot.id}` : null,
          defacementStatus: latestDefacement
            ? {
                isDefaced,
                similarityScore: latestDefacement.similarityScore
                  ? Number(latestDefacement.similarityScore)
                  : null,
                htmlSimilarityScore: latestDefacement.htmlSimilarityScore
                  ? Number(latestDefacement.htmlSimilarityScore)
                  : null,
                detectionMethod: latestDefacement.htmlSimilarityScore != null
                  ? 'hybrid' : 'pixel_only',
              }
            : null,
        };
      });
    } catch (error) {
      logger.error('getAllStatuses failed:', error);
      throw error;
    }
  }

  /**
   * 대시보드용 전체 상태 요약을 조회합니다
   * 최근 5회 연속 실패 시에만 장애(down)로 카운트
   * @returns DashboardSummary {total, up, down, warning, defaced, unknown, lastScanAt}
   */
  async getDashboardSummary(): Promise<DashboardSummary> {
    try {
      const websites = await this.prisma.website.findMany({
        where: { isActive: true },
        include: {
          monitoringResults: {
            orderBy: { checkedAt: 'desc' },
            take: CONSECUTIVE_FAILURE_THRESHOLD,
          },
          defacementChecks: {
            orderBy: { checkedAt: 'desc' },
            take: CONSECUTIVE_DEFACEMENT_THRESHOLD,
          },
        },
      });

      let up = 0;
      let down = 0;
      let warning = 0;
      let defaced = 0;
      let unknown = 0;
      let lastScanAt: Date | null = null;

      for (const website of websites) {
        const results = website.monitoringResults;
        const latestResult = results[0];
        const defacementChecks = website.defacementChecks;

        // 연속 위변조 판정
        let consecutiveDefaced = 0;
        for (const check of defacementChecks) {
          if (check.isDefaced) consecutiveDefaced++;
          else break;
        }
        if (consecutiveDefaced >= CONSECUTIVE_DEFACEMENT_THRESHOLD) {
          defaced++;
        }

        if (!latestResult) {
          unknown++;
          continue;
        }

        if (!lastScanAt || latestResult.checkedAt > lastScanAt) {
          lastScanAt = latestResult.checkedAt;
        }

        const consecutiveFailures = getConsecutiveFailures(results);
        const isDown = consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD;

        if (isDown) {
          down++;
        } else if (latestResult.isUp && latestResult.responseTimeMs && latestResult.responseTimeMs > config.monitoring.responseTimeWarningMs) {
          // 정상 응답이지만 느린 경우만 경고 (실패 시 responseTimeMs는 타임아웃 소요시간이므로 제외)
          warning++;
        } else {
          up++;
        }
      }

      const summary: DashboardSummary = {
        total: websites.length,
        up,
        down,
        warning,
        defaced,
        unknown,
        lastScanAt,
      };

      return summary;
    } catch (error) {
      logger.error('getDashboardSummary failed:', error);
      throw error;
    }
  }

  /**
   * 오래된 모니터링 결과를 정리합니다
   * @param daysToKeep 보관할 일 수 (기본 90일)
   * @returns 삭제된 레코드 수
   */
  async cleanupOldResults(daysToKeep: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await this.prisma.monitoringResult.deleteMany({
        where: {
          checkedAt: { lt: cutoffDate },
        },
      });

      if (result.count > 0) {
        logger.info(`Cleaned up ${result.count} old monitoring results (older than ${daysToKeep} days)`);
      }

      return result.count;
    } catch (error) {
      logger.error('cleanupOldResults failed:', error);
      throw error;
    }
  }

  /**
   * 오래된 위변조 체크 결과를 정리합니다
   * @param daysToKeep 보관할 일 수 (기본 90일)
   * @returns 삭제된 레코드 수
   */
  async cleanupOldDefacementChecks(daysToKeep: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await this.prisma.defacementCheck.deleteMany({
        where: {
          checkedAt: { lt: cutoffDate },
        },
      });

      if (result.count > 0) {
        logger.info(`Cleaned up ${result.count} old defacement checks (older than ${daysToKeep} days)`);
      }

      return result.count;
    } catch (error) {
      logger.error('cleanupOldDefacementChecks failed:', error);
      throw error;
    }
  }

  /**
   * 웹사이트의 모니터링 이력을 조회합니다
   * @param websiteId 웹사이트 ID
   * @param limit 최대 개수
   * @param offset 오프셋
   * @returns MonitoringResult 배열
   */
  async getHistory(
    websiteId: number,
    limit: number = 100,
    offset: number = 0,
  ): Promise<any[]> {
    try {
      const results = await this.prisma.monitoringResult.findMany({
        where: { websiteId },
        orderBy: { checkedAt: 'desc' },
        take: limit,
        skip: offset,
      });

      return results;
    } catch (error) {
      logger.error(`getHistory failed for website ${websiteId}:`, error);
      throw error;
    }
  }
}

// 싱글턴 인스턴스 내보내기
export const monitoringService = new MonitoringService();
