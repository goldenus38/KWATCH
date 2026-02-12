import { vi } from 'vitest';

/**
 * Prisma Client mock
 * 각 모델에 대해 기본 메서드를 vi.fn()으로 제공합니다.
 */
function createModelMock() {
  return {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    count: vi.fn().mockResolvedValue(0),
    upsert: vi.fn().mockResolvedValue({}),
  };
}

export const prismaMock = {
  website: createModelMock(),
  monitoringResult: createModelMock(),
  screenshot: createModelMock(),
  defacementBaseline: createModelMock(),
  defacementCheck: createModelMock(),
  alert: createModelMock(),
  alertChannel: createModelMock(),
  user: createModelMock(),
  category: createModelMock(),
  $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  $disconnect: vi.fn().mockResolvedValue(undefined),
};
