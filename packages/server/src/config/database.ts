import { PrismaClient } from '@prisma/client';
import { config } from './index';
import { logger } from '../utils/logger';

// Prisma Client 싱글턴
let prisma: PrismaClient;

export const getDbClient = (): PrismaClient => {
  if (!prisma) {
    prisma = new PrismaClient({
      log: config.isDev
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
    });

    logger.info('Prisma Client initialized');
  }

  return prisma;
};

export const disconnectDb = async (): Promise<void> => {
  if (prisma) {
    await prisma.$disconnect();
    logger.info('Prisma Client disconnected');
  }
};

export { prisma };
