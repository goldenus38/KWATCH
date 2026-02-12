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
    timeout: parseInt(process.env.SCREENSHOT_TIMEOUT || '30000', 10),
  },

  // Monitoring
  monitoring: {
    defaultCheckInterval: parseInt(process.env.DEFAULT_CHECK_INTERVAL || '300', 10),
    defaultTimeout: parseInt(process.env.DEFAULT_TIMEOUT || '30', 10),
    defacementThreshold: parseInt(process.env.DEFACEMENT_THRESHOLD || '85', 10),
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
