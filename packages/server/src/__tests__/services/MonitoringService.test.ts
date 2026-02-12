import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from '../mocks/prisma';

// Must import after mocks are set up via setup.ts
import { MonitoringService } from '../../services/MonitoringService';

describe('MonitoringService', () => {
  let service: MonitoringService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MonitoringService();
  });

  describe('checkWebsite', () => {
    it('should return success for a normal response', async () => {
      const mockResponse = {
        status: 200,
        ok: true,
      };
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse as any);

      const result = await service.checkWebsite('https://example.com', 10);

      expect(result.isUp).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.errorMessage).toBeNull();
    });

    it('should return down on timeout', async () => {
      vi.spyOn(global, 'fetch').mockImplementationOnce(() => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const result = await service.checkWebsite('https://example.com', 1);

      expect(result.isUp).toBe(false);
      expect(result.statusCode).toBeNull();
      expect(result.errorMessage).toContain('timeout');
    });

    it('should return down on network error', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(
        new Error('fetch failed: ECONNREFUSED'),
      );

      const result = await service.checkWebsite('https://example.com', 10);

      expect(result.isUp).toBe(false);
      expect(result.statusCode).toBeNull();
      expect(result.errorMessage).toContain('ECONNREFUSED');
    });

    it('should return not up for 5xx status codes', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({ status: 500 } as any);

      const result = await service.checkWebsite('https://example.com', 10);

      expect(result.isUp).toBe(false);
      expect(result.statusCode).toBe(500);
    });
  });

  describe('getDashboardSummary', () => {
    it('should correctly count up/down/warning/defaced/unknown', async () => {
      const now = new Date();
      prismaMock.website.findMany.mockResolvedValueOnce([
        // up site
        {
          id: 1, isActive: true,
          monitoringResults: [{ isUp: true, responseTimeMs: 100, checkedAt: now }],
          defacementChecks: [],
        },
        // down site
        {
          id: 2, isActive: true,
          monitoringResults: [{ isUp: false, responseTimeMs: null, checkedAt: now }],
          defacementChecks: [],
        },
        // warning (slow) site
        {
          id: 3, isActive: true,
          monitoringResults: [{ isUp: true, responseTimeMs: 5000, checkedAt: now }],
          defacementChecks: [],
        },
        // defaced site
        {
          id: 4, isActive: true,
          monitoringResults: [{ isUp: true, responseTimeMs: 200, checkedAt: now }],
          defacementChecks: [{ isDefaced: true }],
        },
        // unknown site (no results)
        {
          id: 5, isActive: true,
          monitoringResults: [],
          defacementChecks: [],
        },
      ]);

      const summary = await service.getDashboardSummary();

      expect(summary.total).toBe(5);
      expect(summary.up).toBe(2); // site 1 + site 4 (defaced counts separately)
      expect(summary.down).toBe(1);
      expect(summary.warning).toBe(1);
      expect(summary.defaced).toBe(1);
      expect(summary.unknown).toBe(1);
      expect(summary.lastScanAt).toEqual(now);
    });

    it('should return zero counts when no websites', async () => {
      prismaMock.website.findMany.mockResolvedValueOnce([]);

      const summary = await service.getDashboardSummary();

      expect(summary.total).toBe(0);
      expect(summary.up).toBe(0);
      expect(summary.down).toBe(0);
      expect(summary.lastScanAt).toBeNull();
    });
  });

  describe('getAllStatuses', () => {
    it('should return statuses for all active websites', async () => {
      const now = new Date();
      prismaMock.website.findMany.mockResolvedValueOnce([
        {
          id: 1, name: 'Site A', url: 'https://a.com', isActive: true,
          monitoringResults: [{ statusCode: 200, responseTimeMs: 50, isUp: true, errorMessage: null, checkedAt: now }],
          screenshots: [{ id: BigInt(10), capturedAt: now }],
          defacementChecks: [],
        },
        {
          id: 2, name: 'Site B', url: 'https://b.com', isActive: true,
          monitoringResults: [],
          screenshots: [],
          defacementChecks: [],
        },
      ]);

      const statuses = await service.getAllStatuses();

      expect(statuses).toHaveLength(2);
      expect(statuses[0].websiteId).toBe(1);
      expect(statuses[0].websiteName).toBe('Site A');
      expect(statuses[0].isUp).toBe(true);
      expect(statuses[0].screenshotUrl).toBe('/api/screenshots/image/10');
      expect(statuses[1].isUp).toBe(false);
      expect(statuses[1].screenshotUrl).toBeNull();
    });
  });
});
