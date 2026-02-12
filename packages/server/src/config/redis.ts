import Redis from 'ioredis';
import { config } from './index';
import { logger } from '../utils/logger';

let redisClient: Redis | null = null;
let isInitializing = false;

export const getRedisClient = (): Redis => {
  if (!redisClient) {
    if (isInitializing) {
      throw new Error('Redis client is still initializing');
    }

    isInitializing = true;

    try {
      redisClient = new Redis(config.redisUrl, {
        maxRetriesPerRequest: null, // Bull Queue 요구사항
        enableReadyCheck: false,
        lazyConnect: false,
        retryStrategy: (times: number) => {
          if (times > 10) {
            logger.error('Redis connection failed after 10 retries');
            return null;
          }
          return Math.min(times * 200, 5000);
        },
      });

      redisClient.on('connect', () => {
        logger.info('Redis connected');
      });

      redisClient.on('error', (err) => {
        logger.error('Redis error:', err.message);
      });

      redisClient.on('close', () => {
        logger.warn('Redis connection closed');
      });
    } finally {
      isInitializing = false;
    }
  }

  return redisClient;
};

export const disconnectRedis = async (): Promise<void> => {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch (err) {
      logger.warn('Redis disconnect error, forcing close:', err);
      redisClient.disconnect();
    }
    redisClient = null;
    logger.info('Redis disconnected');
  }
};
