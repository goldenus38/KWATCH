import { getDbClient } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';
import {
  MonitoringStatus,
  DashboardSummary,
  MonitoringJobData,
} from '../types';
import { emitStatusUpdate } from '../websocket/socketServer';

/**
 * 웹사이트 HTTP 상태 체크 서비스
 * 각 웹사이트의 상태 코드, 응답 시간, 정상 여부 등을 모니터링합니다.
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
  }> {
    // TODO: URL 유효성 검증
    // TODO: fetch 또는 axios를 이용한 HTTP 요청 수행
    // TODO: 응답 시간 측정
    // TODO: 상태 코드 확인 (200~299는 정상)
    // TODO: 타임아웃 처리
    // TODO: 네트워크 에러 처리 (ECONNREFUSED, ENOTFOUND 등)
    // TODO: DNS 에러, SSL 에러 등 상세 에러 메시지 기록
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'KWATCH/1.0 (+http://example.com)',
        },
      });

      clearTimeout(timeoutId);

      const responseTimeMs = Date.now() - startTime;
      const isUp = response.status >= 200 && response.status < 300;

      return {
        statusCode: response.status,
        responseTimeMs,
        isUp,
        errorMessage: null,
      };
    } catch (error: unknown) {
      const responseTimeMs = Date.now() - startTime;
      let errorMessage = 'Unknown error';

      if (error instanceof Error) {
        errorMessage = error.message;
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
      };
    }
  }

  /**
   * 모든 활성 웹사이트를 체크하고 결과를 데이터베이스에 저장합니다
   * @returns 체크된 웹사이트 수
   */
  async checkAllWebsites(): Promise<number> {
    // TODO: 모든 활성 웹사이트(is_active=true) 조회
    // TODO: 각 웹사이트별 checkWebsite() 호출 (병렬 처리, 동시 10~20개)
    // TODO: 개별 웹사이트 체크 실패가 전체 프로세스를 중단시키지 않도록 격리
    // TODO: MonitoringResult 테이블에 결과 저장
    // TODO: 이상 감지 시 AlertService와 연동
    // TODO: 체크 완료 후 WebSocket으로 대시보드 업데이트 신호 전송
    // TODO: 총 체크된 웹사이트 수 반환

    try {
      const websites = await this.prisma.website.findMany({
        where: { isActive: true },
        select: {
          id: true,
          url: true,
          timeoutSeconds: true,
        },
      });

      const CONCURRENCY = 20;
      let checkedCount = 0;
      let running = 0;
      let idx = 0;

      await new Promise<void>((resolve, reject) => {
        if (websites.length === 0) {
          resolve();
          return;
        }

        const runNext = () => {
          while (running < CONCURRENCY && idx < websites.length) {
            const website = websites[idx++];
            running++;

            this.checkWebsite(website.url, website.timeoutSeconds)
              .then(async (result) => {
                try {
                  await this.prisma.monitoringResult.create({
                    data: {
                      websiteId: website.id,
                      statusCode: result.statusCode,
                      responseTimeMs: result.responseTimeMs,
                      isUp: result.isUp,
                      errorMessage: result.errorMessage,
                    },
                  });

                  const status = await this.getStatus(website.id);
                  if (status) {
                    emitStatusUpdate(website.id, status);
                  }

                  checkedCount++;
                } catch (saveError) {
                  logger.warn(`Failed to save result for website ${website.id}:`, saveError);
                }
              })
              .catch((err) => {
                logger.warn(`Check failed for website ${website.id}:`, err);
              })
              .finally(() => {
                running--;
                if (running === 0 && idx >= websites.length) {
                  resolve();
                } else {
                  runNext();
                }
              });
          }
        };

        runNext();
      });

      logger.info(`Health check completed for ${checkedCount} websites`);
      return checkedCount;
    } catch (error) {
      logger.error('checkAllWebsites failed:', error);
      throw error;
    }
  }

  /**
   * 특정 웹사이트의 최신 상태를 조회합니다
   * @param websiteId 웹사이트 ID
   * @returns MonitoringStatus 객체
   */
  async getStatus(websiteId: number): Promise<MonitoringStatus | null> {
    // TODO: 웹사이트 정보 조회
    // TODO: 최신 MonitoringResult 조회
    // TODO: 최신 Screenshot 조회
    // TODO: 최신 DefacementCheck 조회
    // TODO: MonitoringStatus 형태로 조합하여 반환
    // TODO: 웹사이트가 없으면 null 반환

    try {
      const website = await this.prisma.website.findUnique({
        where: { id: websiteId },
        include: {
          monitoringResults: {
            orderBy: { checkedAt: 'desc' },
            take: 1,
          },
          screenshots: {
            orderBy: { capturedAt: 'desc' },
            take: 1,
          },
          defacementChecks: {
            orderBy: { checkedAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!website) {
        return null;
      }

      const latestResult = website.monitoringResults[0];
      const latestScreenshot = website.screenshots[0];
      const latestDefacement = website.defacementChecks[0];

      // TODO: 스크린샷 URL 생성 로직

      return {
        websiteId: website.id,
        websiteName: website.name,
        url: website.url,
        statusCode: latestResult?.statusCode ?? null,
        responseTimeMs: latestResult?.responseTimeMs ?? null,
        isUp: latestResult?.isUp ?? false,
        errorMessage: latestResult?.errorMessage ?? null,
        checkedAt: latestResult?.checkedAt ?? new Date(),
        screenshotUrl: latestScreenshot ? `/api/screenshots/image/${latestScreenshot.id}` : null,
        defacementStatus: latestDefacement
          ? {
              isDefaced: latestDefacement.isDefaced,
              similarityScore: latestDefacement.similarityScore
                ? Number(latestDefacement.similarityScore)
                : null,
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
   * @returns MonitoringStatus 배열
   */
  async getAllStatuses(): Promise<MonitoringStatus[]> {
    try {
      const websites = await this.prisma.website.findMany({
        where: { isActive: true },
        include: {
          monitoringResults: {
            orderBy: { checkedAt: 'desc' },
            take: 1,
          },
          screenshots: {
            orderBy: { capturedAt: 'desc' },
            take: 1,
          },
          defacementChecks: {
            orderBy: { checkedAt: 'desc' },
            take: 1,
          },
        },
      });

      return websites.map((website) => {
        const latestResult = website.monitoringResults[0];
        const latestScreenshot = website.screenshots[0];
        const latestDefacement = website.defacementChecks[0];

        return {
          websiteId: website.id,
          websiteName: website.name,
          url: website.url,
          statusCode: latestResult?.statusCode ?? null,
          responseTimeMs: latestResult?.responseTimeMs ?? null,
          isUp: latestResult?.isUp ?? false,
          errorMessage: latestResult?.errorMessage ?? null,
          checkedAt: latestResult?.checkedAt ?? new Date(),
          screenshotUrl: latestScreenshot ? `/api/screenshots/image/${latestScreenshot.id}` : null,
          defacementStatus: latestDefacement
            ? {
                isDefaced: latestDefacement.isDefaced,
                similarityScore: latestDefacement.similarityScore
                  ? Number(latestDefacement.similarityScore)
                  : null,
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
   * @returns DashboardSummary {total, up, down, warning, defaced, unknown, lastScanAt}
   */
  async getDashboardSummary(): Promise<DashboardSummary> {
    // TODO: 모든 활성 웹사이트 총 개수
    // TODO: 각 상태별 웹사이트 수 계산
    //   - up: 최신 결과가 statusCode 200~299 and isUp=true
    //   - down: 최신 결과가 isUp=false
    //   - warning: isUp=true but responseTimeMs > threshold (예: 1000ms)
    //   - defaced: 최신 defacementCheck에서 isDefaced=true
    //   - unknown: 아직 체크 결과가 없는 웹사이트
    // TODO: 전체 마지막 스캔 시간 (최신 monitoringResult의 checkedAt)
    // TODO: DashboardSummary 형태로 반환

    try {
      const websites = await this.prisma.website.findMany({
        where: { isActive: true },
        include: {
          monitoringResults: {
            orderBy: { checkedAt: 'desc' },
            take: 1,
          },
          defacementChecks: {
            orderBy: { checkedAt: 'desc' },
            take: 1,
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
        const latestResult = website.monitoringResults[0];
        const latestDefacement = website.defacementChecks[0];

        if (latestDefacement?.isDefaced) {
          defaced++;
        }

        if (!latestResult) {
          unknown++;
          continue;
        }

        if (!lastScanAt || latestResult.checkedAt > lastScanAt) {
          lastScanAt = latestResult.checkedAt;
        }

        if (!latestResult.isUp) {
          down++;
        } else if (latestResult.responseTimeMs && latestResult.responseTimeMs > 3000) {
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
    // TODO: 특정 웹사이트의 MonitoringResult를 시간순으로 조회
    // TODO: limit, offset을 이용한 페이지네이션
    // TODO: 최신 순서로 반환

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
