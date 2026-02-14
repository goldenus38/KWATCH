import dotenv from 'dotenv';
import path from 'path';

// 루트 디렉토리에서 .env 파일 로드
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://kwatch:password@localhost:5432/kwatch',

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  // Screenshot
  screenshot: {
    dir: process.env.SCREENSHOT_DIR || './screenshots',
    viewportWidth: parseInt(process.env.SCREENSHOT_VIEWPORT_WIDTH || '1920', 10),
    viewportHeight: parseInt(process.env.SCREENSHOT_VIEWPORT_HEIGHT || '1080', 10),
    timeout: parseInt(process.env.SCREENSHOT_TIMEOUT || '15000', 10),
  },

  // Monitoring
  monitoring: {
    defaultCheckInterval: parseInt(process.env.DEFAULT_CHECK_INTERVAL || '60', 10),
    defaultTimeout: parseInt(process.env.DEFAULT_TIMEOUT || '60', 10),
    defacementThreshold: parseInt(process.env.DEFACEMENT_THRESHOLD || '85', 10),
    screenshotInterval: parseInt(process.env.SCREENSHOT_INTERVAL || '300', 10), // 스크린샷 캡처 주기 (초, 기본 5분)
    defacementInterval: parseInt(process.env.DEFACEMENT_INTERVAL || '600', 10), // 위변조 체크 주기 (초, 기본 10분)
    monitoringConcurrency: parseInt(process.env.MONITORING_CONCURRENCY || '20', 10),
    screenshotConcurrency: parseInt(process.env.SCREENSHOT_CONCURRENCY || '15', 10),
    defacementConcurrency: parseInt(process.env.DEFACEMENT_CONCURRENCY || '8', 10),
    staggerWindowSeconds: parseInt(process.env.STAGGER_WINDOW_SECONDS || '60', 10),
    responseTimeWarningMs: parseInt(process.env.RESPONSE_TIME_WARNING_MS || '10000', 10),
    hybridWeights: {
      pixel: parseFloat(process.env.DEFACEMENT_WEIGHT_PIXEL || '0.3'),
      structural: parseFloat(process.env.DEFACEMENT_WEIGHT_STRUCTURAL || '0.3'),
      critical: parseFloat(process.env.DEFACEMENT_WEIGHT_CRITICAL || '0.4'),
    },
    htmlAnalysisEnabled: process.env.HTML_ANALYSIS_ENABLED !== 'false',
    baselineRefreshIntervalDays: parseInt(process.env.BASELINE_REFRESH_INTERVAL_DAYS || '0', 10),
  },

  // Alert Channels
  alerts: {
    email: {
      smtpHost: process.env.ALERT_EMAIL_SMTP_HOST || '',
      smtpPort: parseInt(process.env.ALERT_EMAIL_SMTP_PORT || '587', 10),
      from: process.env.ALERT_EMAIL_FROM || '',
      user: process.env.ALERT_EMAIL_USER || '',
      pass: process.env.ALERT_EMAIL_PASS || '',
    },
    slack: {
      webhookUrl: process.env.ALERT_SLACK_WEBHOOK_URL || '',
    },
    telegram: {
      botToken: process.env.ALERT_TELEGRAM_BOT_TOKEN || '',
      chatId: process.env.ALERT_TELEGRAM_CHAT_ID || '',
    },
  },

  // Dashboard
  dashboard: {
    token: process.env.DASHBOARD_TOKEN || '',
    autoRotateInterval: parseInt(process.env.DASHBOARD_AUTO_ROTATE_INTERVAL || '15000', 10),
    itemsPerPage: parseInt(process.env.DASHBOARD_ITEMS_PER_PAGE || '35', 10),
  },
} as const;

// Production safety check
if (!config.isDev && config.jwt.secret === 'dev-secret-key') {
  throw new Error('JWT_SECRET must be set in production environment!');
}

export type Config = typeof config;
