import { vi } from 'vitest';
import { prismaMock } from './mocks/prisma';

// Mock Prisma database module
vi.mock('../config/database', () => ({
  getDbClient: () => prismaMock,
  disconnectDb: vi.fn(),
  prisma: prismaMock,
}));

// Mock Redis module
vi.mock('../config/redis', () => ({
  getRedisClient: () => ({
    ping: vi.fn().mockResolvedValue('PONG'),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    quit: vi.fn().mockResolvedValue('OK'),
    disconnect: vi.fn(),
  }),
  disconnectRedis: vi.fn(),
}));

// Mock WebSocket module
vi.mock('../websocket/socketServer', () => ({
  initSocketServer: vi.fn(),
  closeSocketServer: vi.fn(),
  emitStatusUpdate: vi.fn(),
  emitAlertNew: vi.fn(),
  emitDefacementDetected: vi.fn(),
  emitScreenshotUpdated: vi.fn(),
  emitStatusBulk: vi.fn(),
}));

// Mock logger to suppress output during tests
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock SchedulerService
vi.mock('../services/SchedulerService', () => ({
  schedulerService: {
    initQueues: vi.fn(),
    scheduleAllWebsites: vi.fn(),
    cleanup: vi.fn(),
  },
}));

// Mock ScreenshotService
vi.mock('../services/ScreenshotService', () => ({
  screenshotService: {
    closeBrowser: vi.fn(),
  },
}));

// Mock workers
vi.mock('../workers/monitoringWorker', () => ({
  initMonitoringWorker: vi.fn(),
}));
vi.mock('../workers/screenshotWorker', () => ({
  initScreenshotWorker: vi.fn(),
}));
vi.mock('../workers/defacementWorker', () => ({
  initDefacementWorker: vi.fn(),
}));
