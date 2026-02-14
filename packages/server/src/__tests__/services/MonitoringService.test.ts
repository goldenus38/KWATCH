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
      expect(result.errorMessage).toContain('시간 초과');
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
      // HEAD returns 500, GET fallback also returns 500
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce({ status: 500 } as any)
        .mockResolvedValueOnce({ status: 500 } as any);

      const result = await service.checkWebsite('https://example.com', 10);

      expect(result.isUp).toBe(false);
      expect(result.statusCode).toBe(500);
    });
  });

  describe('getDashboardSummary', () => {
    it('should correctly count up/down/warning/defaced/unknown', async () => {
      const now = new Date();
      // Raw SQL returns snake_case columns with json_agg sub-arrays
      prismaMock.$queryRaw.mockResolvedValueOnce([
        // up site
        {
          id: 1, name: 'Site A', url: 'https://a.com', organization_name: '테스트기관A', defacement_mode: 'auto',
          monitoring_results: [{ is_up: true, response_time_ms: 100, checked_at: now.toISOString(), final_url: 'https://a.com' }],
          screenshots: null,
          defacement_checks: null,
        },
        // down site (5 consecutive failures required)
        {
          id: 2, name: 'Site B', url: 'https://b.com', organization_name: '테스트기관B', defacement_mode: 'auto',
          monitoring_results: [
            { is_up: false, response_time_ms: null, checked_at: now.toISOString(), final_url: null },
            { is_up: false, response_time_ms: null, checked_at: now.toISOString(), final_url: null },
            { is_up: false, response_time_ms: null, checked_at: now.toISOString(), final_url: null },
            { is_up: false, response_time_ms: null, checked_at: now.toISOString(), final_url: null },
            { is_up: false, response_time_ms: null, checked_at: now.toISOString(), final_url: null },
          ],
          screenshots: null,
          defacement_checks: null,
        },
        // warning (slow) site — response time exceeds 100000ms threshold
        {
          id: 3, name: 'Site C', url: 'https://c.com', organization_name: null, defacement_mode: 'pixel_only',
          monitoring_results: [{ is_up: true, response_time_ms: 150000, checked_at: now.toISOString(), final_url: 'https://c.com/redirected' }],
          screenshots: null,
          defacement_checks: null,
        },
        // defaced site (3 consecutive detections required)
        {
          id: 4, name: 'Site D', url: 'https://d.com', organization_name: '테스트기관D', defacement_mode: 'auto',
          monitoring_results: [{ is_up: true, response_time_ms: 200, checked_at: now.toISOString(), final_url: 'https://d.com' }],
          screenshots: null,
          defacement_checks: [
            { is_defaced: true, similarity_score: null, html_similarity_score: null, checked_at: now.toISOString() },
            { is_defaced: true, similarity_score: null, html_similarity_score: null, checked_at: now.toISOString() },
            { is_defaced: true, similarity_score: null, html_similarity_score: null, checked_at: now.toISOString() },
          ],
        },
        // unknown site (no results)
        {
          id: 5, name: 'Site E', url: 'https://e.com', organization_name: null, defacement_mode: 'auto',
          monitoring_results: null,
          screenshots: null,
          defacement_checks: null,
        },
      ]);

      const summary = await service.getDashboardSummary();

      expect(summary.total).toBe(5);
      expect(summary.up).toBe(2); // site 1 + site 4 (defaced counts separately)
      expect(summary.down).toBe(1);
      expect(summary.warning).toBe(1);
      expect(summary.defaced).toBe(1);
      expect(summary.unknown).toBe(1);
    });

    it('should return zero counts when no websites', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([]);

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
      // Raw SQL returns snake_case columns with json_agg sub-arrays
      prismaMock.$queryRaw.mockResolvedValueOnce([
        {
          id: 1, name: 'Site A', url: 'https://a.com', organization_name: '기관A', defacement_mode: 'auto',
          monitoring_results: [{ status_code: 200, response_time_ms: 50, is_up: true, error_message: null, checked_at: now.toISOString(), final_url: 'https://a.com/' }],
          screenshots: [{ id: 10, capturedAt: now.toISOString() }],
          defacement_checks: null,
        },
        {
          id: 2, name: 'Site B', url: 'https://b.com', organization_name: null, defacement_mode: 'pixel_only',
          monitoring_results: null,
          screenshots: null,
          defacement_checks: null,
        },
      ]);

      const statuses = await service.getAllStatuses();

      expect(statuses).toHaveLength(2);
      expect(statuses[0].websiteId).toBe(1);
      expect(statuses[0].websiteName).toBe('Site A');
      expect(statuses[0].organizationName).toBe('기관A');
      expect(statuses[0].isUp).toBe(true);
      expect(statuses[0].finalUrl).toBe('https://a.com/');
      expect(statuses[0].screenshotUrl).toBe('/api/screenshots/image/10');
      expect(statuses[0].thumbnailUrl).toBe('/api/screenshots/thumbnail/10');
      expect(statuses[0].screenshotCapturedAt).toBeTruthy();
      expect(statuses[0].defacementMode).toBe('auto');
      expect(statuses[1].isUp).toBe(false);
      expect(statuses[1].organizationName).toBeNull();
      expect(statuses[1].finalUrl).toBeNull();
      expect(statuses[1].screenshotUrl).toBeNull();
      expect(statuses[1].thumbnailUrl).toBeNull();
      expect(statuses[1].screenshotCapturedAt).toBeNull();
      expect(statuses[1].defacementMode).toBe('pixel_only');
    });
  });
});
