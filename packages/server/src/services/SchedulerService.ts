import { Queue, QueueEvents } from 'bullmq';
import { getRedisClient } from '../config/redis';
import { getDbClient } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';
import {
  MonitoringJobData,
  ScreenshotJobData,
  DefacementJobData,
} from '../types';

/**
 * Bull Queue를 이용한 작업 스케줄러 서비스
 * 모니터링, 스크린샷, 위변조 체크 작업을 큐에 등록하고 관리합니다.
 */
export class SchedulerService {
  private prisma = getDbClient();
  private redis = getRedisClient();

  private monitoringQueue: Queue<MonitoringJobData> | null = null;
  private screenshotQueue: Queue<ScreenshotJobData> | null = null;
  private defacementQueue: Queue<DefacementJobData> | null = null;

  constructor() {
    // TODO: 큐 초기화 및 워커 설정
  }

  /**
   * Bull Queue를 초기화합니다
   */
  async initQueues(): Promise<void> {
    // TODO: monitoring-queue, screenshot-queue, defacement-queue 생성
    // TODO: 각 큐에 대한 이벤트 리스너 설정
    //   - completed: 작업 완료 시
    //   - failed: 작업 실패 시
    //   - error: 큐 에러 시
    // TODO: 워커 프로세스 시작 (별도 파일로 분리 가능)

    try {
      this.monitoringQueue = new Queue<MonitoringJobData>('monitoring-queue', {
        connection: this.redis as any,
      });

      this.screenshotQueue = new Queue<ScreenshotJobData>('screenshot-queue', {
        connection: this.redis as any,
      });

      this.defacementQueue = new Queue<DefacementJobData>('defacement-queue', {
        connection: this.redis as any,
      });

      // TODO: 이벤트 리스너 설정
      this.setupEventListeners();

      logger.info('Bull Queues initialized');
    } catch (error) {
      logger.error('initQueues failed:', error);
      throw error;
    }
  }

  /**
   * 큐 이벤트 리스너를 설정합니다
   */
  private setupEventListeners(): void {
    const queueNames = ['monitoring-queue', 'screenshot-queue', 'defacement-queue'];

    for (const name of queueNames) {
      const queueEvents = new QueueEvents(name, {
        connection: this.redis as any,
      });

      queueEvents.on('completed', ({ jobId }) => {
        logger.debug(`${name} job completed: ${jobId}`);
      });

      queueEvents.on('failed', ({ jobId, failedReason }) => {
        logger.warn(`${name} job failed: ${jobId} - ${failedReason}`);
      });
    }
  }

  /**
   * 특정 웹사이트의 모니터링을 스케줄합니다
   * @param website 웹사이트 정보 {id, url, timeoutSeconds, checkIntervalSeconds}
   * @param initialDelayMs 첫 실행까지 지연 시간 (ms, staggered scheduling용)
   */
  async scheduleMonitoring(website: any, initialDelayMs: number = 0): Promise<void> {
    try {
      if (!this.monitoringQueue) {
        throw new Error('Monitoring queue not initialized');
      }

      // 기존 반복 작업 제거
      const existingJobs = await this.monitoringQueue.getRepeatableJobs();
      for (const job of existingJobs) {
        if (job.key.includes(`monitoring:${website.id}`)) {
          await this.monitoringQueue.removeRepeatableByKey(job.key);
        }
      }

      // 새 반복 작업 등록 (staggered start)
      await this.monitoringQueue.add(
        `monitoring:${website.id}`,
        {
          websiteId: website.id,
          url: website.url,
          timeoutSeconds: website.timeoutSeconds,
        },
        {
          repeat: {
            every: website.checkIntervalSeconds * 1000,
          },
          delay: initialDelayMs,
          removeOnComplete: true,
          removeOnFail: false,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );

      logger.info(
        `Monitoring scheduled for website ${website.id}: every ${website.checkIntervalSeconds}s` +
          (initialDelayMs > 0 ? ` (initial delay: ${(initialDelayMs / 1000).toFixed(1)}s)` : ''),
      );
    } catch (error) {
      logger.error(`scheduleMonitoring failed for website ${website.id}:`, error);
      throw error;
    }
  }

  /**
   * 모든 활성 웹사이트의 모니터링을 스케줄합니다
   * 첫 실행을 checkInterval 내에 균등 분산 (thundering herd 방지)
   */
  async scheduleAllWebsites(): Promise<void> {
    try {
      const websites = await this.prisma.website.findMany({
        where: { isActive: true },
      });

      const total = websites.length;
      const staggerWindowMs = config.monitoring.staggerWindowSeconds * 1000;
      logger.info(`Scheduling monitoring for ${total} websites (staggered over ${config.monitoring.staggerWindowSeconds}s window)`);

      for (let i = 0; i < total; i++) {
        const website = websites[i];
        // 첫 실행을 stagger 윈도우 내에 균등 분산 (thundering herd 방지)
        const staggerDelayMs = Math.floor((i / total) * staggerWindowMs);
        await this.scheduleMonitoring(website, staggerDelayMs);
      }

      logger.info(`All ${total} websites scheduled for monitoring (staggered over ${config.monitoring.staggerWindowSeconds}s)`);
    } catch (error) {
      logger.error('scheduleAllWebsites failed:', error);
      throw error;
    }
  }

  /**
   * 웹사이트의 스케줄된 작업을 제거합니다
   * @param websiteId 웹사이트 ID
   */
  async removeSchedule(websiteId: number): Promise<void> {
    // TODO: monitoring-queue, screenshot-queue에서 해당 웹사이트의 반복 작업 제거
    // TODO: 각 큐의 removeRepeatableByKey() 사용

    try {
      const queues = [
        this.monitoringQueue,
        this.screenshotQueue,
        this.defacementQueue,
      ];

      for (const queue of queues) {
        if (!queue) continue;

        const repeatableJobs = await queue.getRepeatableJobs();
        for (const job of repeatableJobs) {
          if (job.key.includes(`${websiteId}`)) {
            await queue.removeRepeatableByKey(job.key);
          }
        }
      }

      logger.info(`Schedule removed for website ${websiteId}`);
    } catch (error) {
      logger.error(`removeSchedule failed for website ${websiteId}:`, error);
      throw error;
    }
  }

  /**
   * 스크린샷 작업을 큐에 추가합니다
   * @param website 웹사이트 정보
   * @param immediate 즉시 실행 여부
   */
  async enqueueScreenshot(website: any, immediate: boolean = false): Promise<void> {
    // TODO: 큐가 초기화되었는지 확인
    // TODO: 작업을 큐에 추가
    //   - immediate=true면 우선순위 높게
    //   - 자동 재시도 설정
    // TODO: 주기적 스크린샷 설정 (선택사항)

    try {
      if (!this.screenshotQueue) {
        throw new Error('Screenshot queue not initialized');
      }

      const jobData: ScreenshotJobData = {
        websiteId: website.id,
        url: website.url,
      };

      await this.screenshotQueue.add('screenshot', jobData, {
        priority: immediate ? 1 : 10, // 낮은 숫자 = 높은 우선순위
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 1, // 재시도 없음 (다음 모니터링 사이클에서 자연 재시도)
      });

      logger.debug(`Screenshot job enqueued for website ${website.id}`);
    } catch (error) {
      logger.error(`enqueueScreenshot failed for website ${website.id}:`, error);
      throw error;
    }
  }

  /**
   * 위변조 체크 작업을 큐에 추가합니다
   * @param websiteId 웹사이트 ID
   * @param screenshotId 스크린샷 ID
   * @param baselineId 베이스라인 ID
   */
  async enqueueDefacementCheck(
    websiteId: number,
    screenshotId: number | bigint,
    baselineId: number,
    htmlContent?: string,
  ): Promise<void> {
    // TODO: 큐가 초기화되었는지 확인
    // TODO: 작업을 큐에 추가

    try {
      if (!this.defacementQueue) {
        throw new Error('Defacement queue not initialized');
      }

      const jobData: DefacementJobData = {
        websiteId,
        screenshotId: Number(screenshotId),
        baselineId,
        htmlContent,
      };

      await this.defacementQueue.add('defacement-check', jobData, {
        removeOnComplete: true,
        removeOnFail: false,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        attempts: 3,
      });

      logger.debug(`Defacement check job enqueued for website ${websiteId}`);
    } catch (error) {
      logger.error(
        `enqueueDefacementCheck failed for website ${websiteId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * 모든 큐의 상태를 조회합니다
   * @returns 큐 상태 정보
   */
  async getQueuesStatus(): Promise<any> {
    // TODO: 각 큐의 jobCounts 조회
    // TODO: 활성 작업, 대기 중인 작업, 완료된 작업, 실패한 작업 개수 반환

    try {
      const queues = [
        { name: 'monitoring', queue: this.monitoringQueue },
        { name: 'screenshot', queue: this.screenshotQueue },
        { name: 'defacement', queue: this.defacementQueue },
      ];

      const status: any = {};

      for (const { name, queue } of queues) {
        if (!queue) {
          status[name] = null;
          continue;
        }

        const counts = await queue.getJobCounts();
        status[name] = counts;
      }

      return status;
    } catch (error) {
      logger.error('getQueuesStatus failed:', error);
      throw error;
    }
  }

  /**
   * 특정 큐의 작업을 조회합니다
   * @param queueName 큐 이름 ('monitoring', 'screenshot', 'defacement')
   * @param limit 최대 개수
   * @returns 작업 배열
   */
  async getQueueJobs(queueName: string, limit: number = 50): Promise<any[]> {
    // TODO: 큐 이름에 따라 해당 큐 선택
    // TODO: 활성 작업, 대기 작업, 실패한 작업 조회
    // TODO: 작업 배열 반환

    try {
      const queue =
        queueName === 'monitoring'
          ? this.monitoringQueue
          : queueName === 'screenshot'
            ? this.screenshotQueue
            : this.defacementQueue;

      if (!queue) {
        return [];
      }

      // TODO: 활성, 대기, 실패한 작업 조회
      const [active, waiting, failed] = await Promise.all([
        queue.getJobs(['active'], 0, limit),
        queue.getJobs(['waiting'], 0, limit),
        queue.getJobs(['failed'], 0, limit),
      ]);

      return [...active, ...waiting, ...failed];
    } catch (error) {
      logger.error(`getQueueJobs failed for queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * 큐를 초기화합니다 (자동 정리)
   */
  async cleanup(): Promise<void> {
    // TODO: 모든 큐 정리
    // TODO: 워커 프로세스 종료
    // TODO: Redis 연결 종료

    try {
      if (this.monitoringQueue) {
        await this.monitoringQueue.close();
      }
      if (this.screenshotQueue) {
        await this.screenshotQueue.close();
      }
      if (this.defacementQueue) {
        await this.defacementQueue.close();
      }

      logger.info('Scheduler cleanup completed');
    } catch (error) {
      logger.error('cleanup failed:', error);
      throw error;
    }
  }
}

// 싱글턴 인스턴스 내보내기
export const schedulerService = new SchedulerService();
