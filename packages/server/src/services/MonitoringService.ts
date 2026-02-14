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

  private static readonly BROWSER_HEADERS: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate',
  };

  private static readonly MAX_REDIRECTS = 10;

  /**
   * 리다이렉트를 수동 추적하며 HTTP 요청을 수행합니다
   * @returns { response, finalUrl, redirectCount }
   */
  private async fetchWithManualRedirect(
    url: string,
    method: 'HEAD' | 'GET',
    controller: AbortController,
  ): Promise<{ response: Response; finalUrl: string; redirectCount: number }> {
    let currentUrl = url;
    let redirectCount = 0;
    let response: Response | null = null;

    while (redirectCount <= MonitoringService.MAX_REDIRECTS) {
      response = await fetch(currentUrl, {
        method,
        signal: controller.signal,
        redirect: 'manual',
        headers: MonitoringService.BROWSER_HEADERS,
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) break;
        try {
          currentUrl = new URL(location, currentUrl).href;
        } catch {
          break; // 잘못된 Location 헤더 — 리다이렉트 중단
        }
        redirectCount++;
        continue;
      }
      break;
    }

    return { response: response!, finalUrl: currentUrl, redirectCount };
  }

  /**
   * 단일 웹사이트의 HTTP 상태를 확인합니다
   * - 리다이렉트를 수동 추적 (최대 10회)하여 finalUrl 정확 기록
   * - 브라우저 유사 헤더로 WAF/방화벽 호환성 향상
   * - DNS/네트워크 일시 오류 시 1회 재시도
   * @param url 확인할 웹사이트 URL
   * @param timeoutSeconds 타임아웃 시간 (초)
   * @param isRetry 재시도 여부 (내부용)
   * @returns 상태 정보 {statusCode, responseTimeMs, isUp, errorMessage, finalUrl}
   */
  async checkWebsite(
    url: string,
    timeoutSeconds: number = config.monitoring.defaultTimeout,
    isRetry: boolean = false,
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

      try {
        // HEAD 요청 + 수동 리다이렉트 추적
        let { response, finalUrl, redirectCount } = await this.fetchWithManualRedirect(
          url, 'HEAD', controller,
        );

        // 리다이렉트 횟수 초과
        if (redirectCount > MonitoringService.MAX_REDIRECTS) {
          return {
            statusCode: null,
            responseTimeMs: Date.now() - startTime,
            isUp: false,
            errorMessage: `리다이렉트 횟수 초과 (${MonitoringService.MAX_REDIRECTS}회)`,
            finalUrl,
          };
        }

        // HEAD 4xx → GET fallback (많은 서버가 HEAD를 차단)
        if (response.status >= 400) {
          const fallbackController = new AbortController();
          const fallbackTimeoutId = setTimeout(
            () => fallbackController.abort(),
            timeoutSeconds * 1000,
          );

          try {
            const getResult = await this.fetchWithManualRedirect(
              url, 'GET', fallbackController,
            );
            response = getResult.response;
            finalUrl = getResult.finalUrl;

            if (getResult.redirectCount > MonitoringService.MAX_REDIRECTS) {
              return {
                statusCode: null,
                responseTimeMs: Date.now() - startTime,
                isUp: false,
                errorMessage: `리다이렉트 횟수 초과 (${MonitoringService.MAX_REDIRECTS}회)`,
                finalUrl,
              };
            }
          } finally {
            clearTimeout(fallbackTimeoutId);
          }
        }

        const responseTimeMs = Date.now() - startTime;
        // 서버가 응답하면 정상 (4xx도 서버 작동 중), 5xx만 장애로 판정
        const isUp = response.status < 500;

        return {
          statusCode: response.status,
          responseTimeMs,
          isUp,
          errorMessage: null,
          finalUrl,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error: unknown) {
      const responseTimeMs = Date.now() - startTime;

      // DNS/네트워크 일시 오류 시 1회 재시도
      const cause = (error as any)?.cause;
      const causeCode = cause?.code as string | undefined;
      const isTransient = causeCode === 'ENOTFOUND'
        || causeCode === 'ECONNRESET'
        || causeCode === 'UND_ERR_CONNECT_TIMEOUT';

      if (isTransient && !isRetry) {
        logger.info(`Transient error for ${url} (${causeCode}), retrying once...`);
        await new Promise(r => setTimeout(r, 2000));
        return this.checkWebsite(url, timeoutSeconds, true);
      }

      let errorMessage = 'Unknown error';

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = `요청 시간 초과 (${timeoutSeconds}초)`;
        } else if (causeCode === 'ENOTFOUND') {
          const hostname = cause?.hostname || new URL(url).hostname;
          errorMessage = `DNS 해석 실패 (${hostname})`;
        } else if (causeCode === 'UND_ERR_CONNECT_TIMEOUT') {
          const address = cause?.address || '';
          errorMessage = address
            ? `연결 시간 초과 (${address})`
            : '연결 시간 초과';
        } else {
          errorMessage = cause?.message || cause?.code || error.message;
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
        screenshotCapturedAt: latestScreenshot?.capturedAt ?? null,
        defacementMode: website.defacementMode,
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
    const result = await this.getAllStatusesWithSummary();
    return result.statuses;
  }

  /**
   * 모든 활성 웹사이트의 상태 + 대시보드 요약을 1회 Raw SQL로 조회합니다.
   * Prisma include + take 조합이 499개 사이트에서 100초+ 걸리는 문제를
   * Raw SQL correlated subquery로 해결 (~18ms).
   */
  async getAllStatusesWithSummary(): Promise<{ statuses: MonitoringStatus[]; summary: DashboardSummary }> {
    try {
      const rows: any[] = await this.prisma.$queryRaw`
        SELECT
          w.id,
          w.name,
          w.url,
          w.organization_name,
          w.defacement_mode,
          (SELECT json_agg(sub) FROM (
            SELECT status_code, response_time_ms, is_up, error_message, checked_at, final_url
            FROM monitoring_results WHERE website_id = w.id ORDER BY checked_at DESC LIMIT ${CONSECUTIVE_FAILURE_THRESHOLD}
          ) sub) as monitoring_results,
          (SELECT json_agg(sub) FROM (
            SELECT id, captured_at AS "capturedAt" FROM screenshots WHERE website_id = w.id ORDER BY captured_at DESC LIMIT 1
          ) sub) as screenshots,
          (SELECT json_agg(sub) FROM (
            SELECT is_defaced, similarity_score, html_similarity_score, checked_at
            FROM defacement_checks WHERE website_id = w.id ORDER BY checked_at DESC LIMIT ${CONSECUTIVE_DEFACEMENT_THRESHOLD}
          ) sub) as defacement_checks
        FROM websites w
        WHERE w.is_active = true
      `;

      let summaryUp = 0;
      let summaryDown = 0;
      let summaryWarning = 0;
      let summaryDefaced = 0;
      let summaryUnknown = 0;
      let lastScanAt: Date | null = null;

      const statuses = rows.map((row) => {
        const results: any[] = row.monitoring_results || [];
        const latestResult = results[0];
        const screenshots: any[] = row.screenshots || [];
        const latestScreenshot = screenshots[0];
        const defacementChecks: any[] = row.defacement_checks || [];
        const latestDefacement = defacementChecks[0];

        const consecutiveFailures = getConsecutiveFailures(
          results.map((r: any) => ({ isUp: r.is_up })),
        );
        const isDown = consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD;

        // 연속 위변조 판정
        let consecutiveDefaced = 0;
        for (const check of defacementChecks) {
          if (check.is_defaced) consecutiveDefaced++;
          else break;
        }
        const isDefaced = consecutiveDefaced >= CONSECUTIVE_DEFACEMENT_THRESHOLD;

        // summary 집계
        if (isDefaced) summaryDefaced++;
        if (!latestResult) {
          summaryUnknown++;
        } else {
          const checkedAt = new Date(latestResult.checked_at);
          if (!lastScanAt || checkedAt > lastScanAt) {
            lastScanAt = checkedAt;
          }
          if (isDown) {
            summaryDown++;
          } else if (latestResult.is_up && latestResult.response_time_ms && latestResult.response_time_ms > config.monitoring.responseTimeWarningMs) {
            summaryWarning++;
          } else {
            summaryUp++;
          }
        }

        return {
          websiteId: row.id,
          websiteName: row.name,
          organizationName: row.organization_name,
          url: row.url,
          finalUrl: latestResult?.final_url ?? null,
          statusCode: latestResult?.status_code ?? null,
          responseTimeMs: latestResult?.response_time_ms ?? null,
          isUp: latestResult ? !isDown : false,
          errorMessage: latestResult?.error_message ?? null,
          checkedAt: latestResult ? new Date(latestResult.checked_at) : new Date(),
          screenshotUrl: latestScreenshot ? `/api/screenshots/image/${latestScreenshot.id}` : null,
          thumbnailUrl: latestScreenshot ? `/api/screenshots/thumbnail/${latestScreenshot.id}` : null,
          screenshotCapturedAt: latestScreenshot?.capturedAt ? new Date(latestScreenshot.capturedAt) : null,
          defacementMode: row.defacement_mode,
          defacementStatus: latestDefacement
            ? {
                isDefaced,
                similarityScore: latestDefacement.similarity_score
                  ? Number(latestDefacement.similarity_score)
                  : null,
                htmlSimilarityScore: latestDefacement.html_similarity_score
                  ? Number(latestDefacement.html_similarity_score)
                  : null,
                detectionMethod: (latestDefacement.html_similarity_score != null
                  ? 'hybrid' : 'pixel_only') as 'hybrid' | 'pixel_only',
              }
            : null,
        };
      });

      const summary: DashboardSummary = {
        total: rows.length,
        up: summaryUp,
        down: summaryDown,
        warning: summaryWarning,
        defaced: summaryDefaced,
        unknown: summaryUnknown,
        lastScanAt,
      };

      return { statuses, summary };
    } catch (error) {
      logger.error('getAllStatusesWithSummary failed:', error);
      throw error;
    }
  }

  /**
   * 대시보드용 전체 상태 요약을 조회합니다
   * getAllStatusesWithSummary()를 재사용
   */
  async getDashboardSummary(): Promise<DashboardSummary> {
    const result = await this.getAllStatusesWithSummary();
    return result.summary;
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
  /**
   * 웹사이트의 모니터링 이력 총 개수를 조회합니다
   */
  async getHistoryCount(websiteId: number): Promise<number> {
    return this.prisma.monitoringResult.count({ where: { websiteId } });
  }

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
