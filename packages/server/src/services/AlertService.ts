import nodemailer, { Transporter } from 'nodemailer';
import axios from 'axios';
import { getDbClient } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AlertCreateInput } from '../types';
import { AlertType, Severity } from '@prisma/client';
import { emitAlertNew } from '../websocket/socketServer';

/**
 * 알림 서비스
 * 이메일, Slack, Telegram을 통해 모니터링 이상 사항을 알립니다.
 */
export class AlertService {
  private prisma = getDbClient();
  private emailTransporter: Transporter | null = null;

  constructor() {
    // TODO: 메일 전송기 초기화 (설정이 있을 경우)
    this.initEmailTransporter();
  }

  /**
   * 메일 전송기를 초기화합니다
   */
  private initEmailTransporter(): void {
    // TODO: SMTP 설정 확인
    if (config.alerts.email.smtpHost && config.alerts.email.from) {
      this.emailTransporter = nodemailer.createTransport({
        host: config.alerts.email.smtpHost,
        port: config.alerts.email.smtpPort,
        secure: config.alerts.email.smtpPort === 465,
        auth: config.alerts.email.user
          ? {
              user: config.alerts.email.user,
              pass: config.alerts.email.pass,
            }
          : undefined,
      });

      logger.info('Email transporter initialized');
    } else {
      logger.warn('Email configuration not set, email notifications disabled');
    }
  }

  /**
   * 새 알림을 생성합니다
   * @param data 알림 생성 정보 {websiteId, alertType, severity, message}
   * @returns 생성된 Alert 레코드
   */
  async createAlert(data: AlertCreateInput): Promise<any> {
    // TODO: 중복 알림 방지 (최근 1시간 이내 같은 유형의 알림이 있으면 스킵)
    // TODO: Alert 레코드 생성
    // TODO: sendNotification() 호출하여 알림 채널별 발송
    // TODO: WebSocket으로 대시보드에 alert:new 이벤트 전송
    // TODO: 생성된 Alert 반환

    try {
      // TODO: 웹사이트 정보 조회 (이름 등)
      const website = await this.prisma.website.findUnique({
        where: { id: data.websiteId },
      });

      if (!website) {
        throw new Error(`Website not found: ${data.websiteId}`);
      }

      // TODO: 중복 알림 방지 로직
      const recentAlert = await this.prisma.alert.findFirst({
        where: {
          websiteId: data.websiteId,
          alertType: data.alertType,
          createdAt: {
            gte: new Date(Date.now() - 60 * 60 * 1000), // 1시간 이내
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (recentAlert) {
        logger.debug(`Duplicate alert suppressed for website ${data.websiteId}`);
        return recentAlert;
      }

      // TODO: Alert 레코드 생성
      const alert = await this.prisma.alert.create({
        data: {
          websiteId: data.websiteId,
          alertType: data.alertType,
          severity: data.severity,
          message: data.message,
          isAcknowledged: false,
        },
      });

      logger.info(
        `Alert created for website ${data.websiteId}: ${data.alertType} (${data.severity})`,
      );

      await this.sendNotification(alert, website.name);

      emitAlertNew({
        id: alert.id,
        websiteId: alert.websiteId,
        websiteName: website.name,
        alertType: alert.alertType,
        severity: alert.severity,
        message: alert.message,
        createdAt: alert.createdAt,
      });

      return alert;
    } catch (error) {
      logger.error('createAlert failed:', error);
      throw error;
    }
  }

  /**
   * 알림을 발송합니다 (등록된 모든 채널을 통해)
   * @param alert Alert 레코드
   * @param websiteName 웹사이트 이름
   */
  async sendNotification(alert: any, websiteName: string): Promise<void> {
    // TODO: 설정된 알림 채널 조회 (EMAIL, SLACK, TELEGRAM)
    // TODO: 각 채널별로 해당 발송 함수 호출
    // TODO: 발송 실패는 로그만 하고 계속 진행 (한 채널 실패가 다른 채널에 영향 없음)

    try {
      // TODO: 활성화된 알림 채널 조회
      const channels = await this.prisma.alertChannel.findMany({
        where: { isActive: true },
      });

      for (const channel of channels) {
        try {
          // TODO: 채널 유형별로 발송
          switch (channel.channelType) {
            case 'EMAIL':
              await this.sendEmail(alert, websiteName, channel.config);
              break;
            case 'SLACK':
              await this.sendSlack(alert, websiteName, channel.config);
              break;
            case 'TELEGRAM':
              await this.sendTelegram(alert, websiteName, channel.config);
              break;
          }
        } catch (error) {
          logger.warn(`Failed to send ${channel.channelType} notification:`, error);
          // 계속 진행
        }
      }
    } catch (error) {
      logger.error('sendNotification failed:', error);
      // 알림 발송 실패가 메인 플로우를 막지 않도록 에러만 로그
    }
  }

  /**
   * 이메일로 알림을 발송합니다
   * @param alert Alert 레코드
   * @param websiteName 웹사이트 이름
   * @param config 이메일 채널 설정
   */
  async sendEmail(alert: any, websiteName: string, config: any): Promise<void> {
    // TODO: 이메일 설정 확인
    // TODO: 메일 제목 및 본문 작성
    // TODO: 심각도에 따른 표시 (INFO, WARNING, CRITICAL)
    // TODO: 알림 타입별 설명 추가 (DOWN, SLOW, DEFACEMENT 등)
    // TODO: nodemailer로 발송

    if (!this.emailTransporter || !config.to || config.to.length === 0) {
      logger.debug('Email notification skipped (no recipients)');
      return;
    }

    try {
      // TODO: 심각도별 제목 prefix
      const severityPrefix = {
        INFO: '[정보]',
        WARNING: '[경고]',
        CRITICAL: '[긴급]',
      };

      const subjectPrefix = severityPrefix[alert.severity as Severity] || '[알림]';

      const alertTypeDesc: Record<AlertType, string> = {
        DOWN: '웹사이트 접속 불가',
        SLOW: '응답 시간 지연',
        DEFACEMENT: '위변조 감지',
        SSL_EXPIRY: 'SSL 인증서 만료',
        RECOVERED: '복구 완료',
      };

      const mailOptions = {
        from: config.from || config.email,
        to: config.to.join(','),
        subject: `${subjectPrefix} ${websiteName} - ${alertTypeDesc[alert.alertType as AlertType]}`,
        html: `
          <h2>${alertTypeDesc[alert.alertType as AlertType]}</h2>
          <p><strong>웹사이트:</strong> ${websiteName}</p>
          <p><strong>심각도:</strong> ${alert.severity}</p>
          <p><strong>메시지:</strong> ${alert.message}</p>
          <p><strong>시간:</strong> ${alert.createdAt}</p>
        `,
      };

      await this.emailTransporter.sendMail(mailOptions);

      logger.info(`Email notification sent for alert ${alert.id}`);
    } catch (error) {
      logger.error('sendEmail failed:', error);
      throw error;
    }
  }

  /**
   * Slack으로 알림을 발송합니다
   * @param alert Alert 레코드
   * @param websiteName 웹사이트 이름
   * @param config Slack 채널 설정
   */
  async sendSlack(alert: any, websiteName: string, config: any): Promise<void> {
    // TODO: Slack 웹훅 URL 확인
    // TODO: 심각도별 색상 설정 (red, yellow, blue 등)
    // TODO: Slack 메시지 포맷 작성 (attachments 사용)
    // TODO: axios로 웹훅 호출

    if (!config.webhookUrl) {
      logger.debug('Slack notification skipped (no webhook URL)');
      return;
    }

    try {
      // TODO: 심각도별 색상
      const colorMap: Record<Severity, string> = {
        INFO: '#42A5F5',
        WARNING: '#FFB300',
        CRITICAL: '#FF1744',
      };

      const payload = {
        attachments: [
          {
            color: colorMap[alert.severity as Severity],
            title: `${websiteName} - ${alert.alertType}`,
            text: alert.message,
            fields: [
              {
                title: 'Severity',
                value: alert.severity,
                short: true,
              },
              {
                title: 'Type',
                value: alert.alertType,
                short: true,
              },
              {
                title: 'Time',
                value: alert.createdAt.toISOString(),
                short: false,
              },
            ],
          },
        ],
      };

      await axios.post(config.webhookUrl, payload);

      logger.info(`Slack notification sent for alert ${alert.id}`);
    } catch (error) {
      logger.error('sendSlack failed:', error);
      throw error;
    }
  }

  /**
   * Telegram으로 알림을 발송합니다
   * @param alert Alert 레코드
   * @param websiteName 웹사이트 이름
   * @param config Telegram 채널 설정
   */
  async sendTelegram(alert: any, websiteName: string, config: any): Promise<void> {
    // TODO: Telegram 봇 토큰 및 채팅 ID 확인
    // TODO: 메시지 텍스트 작성 (마크다운 사용 가능)
    // TODO: Telegram Bot API 호출

    if (!config.botToken || !config.chatId) {
      logger.debug('Telegram notification skipped (missing config)');
      return;
    }

    try {
      const message = `
🚨 *KWATCH 알림*

*웹사이트:* ${websiteName}
*유형:* ${alert.alertType}
*심각도:* ${alert.severity}
*메시지:* ${alert.message}
*시간:* ${alert.createdAt.toISOString()}
      `.trim();

      const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
      await axios.post(url, {
        chat_id: config.chatId,
        text: message,
        parse_mode: 'Markdown',
      });

      logger.info(`Telegram notification sent for alert ${alert.id}`);
    } catch (error) {
      logger.error('sendTelegram failed:', error);
      throw error;
    }
  }

  /**
   * 알림을 확인 처리합니다 (acknowledged)
   * @param alertId 알림 ID
   * @param userId 확인한 사용자 ID
   */
  async acknowledgeAlert(alertId: bigint, userId: number): Promise<void> {
    // TODO: Alert 레코드 업데이트
    // TODO: isAcknowledged=true, acknowledgedBy=userId, acknowledgedAt=now()로 설정

    try {
      await this.prisma.alert.update({
        where: { id: alertId },
        data: {
          isAcknowledged: true,
          acknowledgedBy: userId,
          acknowledgedAt: new Date(),
        },
      });

      logger.info(`Alert ${alertId} acknowledged by user ${userId}`);
    } catch (error) {
      logger.error(`acknowledgeAlert failed for alert ${alertId}:`, error);
      throw error;
    }
  }

  /**
   * 알림 목록을 조회합니다
   * @param filters 필터 옵션 {alertType, severity, isAcknowledged, websiteId, page, limit}
   * @returns 알림 배열 및 총 개수
   */
  async getAlerts(filters: any): Promise<{ alerts: any[]; total: number }> {
    // TODO: 필터 조건 구성
    // TODO: Alert 레코드 조회 (페이지네이션 포함)
    // TODO: 총 개수 조회
    // TODO: alerts와 total 반환

    try {
      const where: any = {};

      if (filters.alertType) {
        where.alertType = filters.alertType;
      }
      if (filters.severity) {
        where.severity = filters.severity;
      }
      if (filters.isAcknowledged !== undefined) {
        where.isAcknowledged = filters.isAcknowledged;
      }
      if (filters.websiteId) {
        where.websiteId = filters.websiteId;
      }

      const page = filters.page || 1;
      const limit = filters.limit || 50;
      const skip = (page - 1) * limit;

      const [alerts, total] = await Promise.all([
        this.prisma.alert.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip,
          include: {
            website: { select: { id: true, name: true } },
            acknowledger: { select: { id: true, username: true } },
          },
        }),
        this.prisma.alert.count({ where }),
      ]);

      return { alerts, total };
    } catch (error) {
      logger.error('getAlerts failed:', error);
      throw error;
    }
  }

  /**
   * 확인되지 않은 알림의 개수를 조회합니다
   * @returns 확인 안 된 알림 개수
   */
  async getUnacknowledgedCount(): Promise<number> {
    // TODO: isAcknowledged=false인 Alert 개수 조회

    try {
      const count = await this.prisma.alert.count({
        where: { isAcknowledged: false },
      });

      return count;
    } catch (error) {
      logger.error('getUnacknowledgedCount failed:', error);
      throw error;
    }
  }
}

// 싱글턴 인스턴스 내보내기
export const alertService = new AlertService();
