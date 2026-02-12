import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { prismaMock } from '../mocks/prisma';
import { createApp } from '../../app';

const app = createApp();

describe('Monitoring Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/monitoring/status', () => {
    it('should return dashboard summary', async () => {
      const now = new Date();
      prismaMock.website.findMany.mockResolvedValueOnce([
        {
          id: 1, isActive: true,
          monitoringResults: [{ isUp: true, responseTimeMs: 100, checkedAt: now }],
          defacementChecks: [],
        },
        {
          id: 2, isActive: true,
          monitoringResults: [{ isUp: false, responseTimeMs: null, checkedAt: now }],
          defacementChecks: [],
        },
      ]);

      const res = await request(app).get('/api/monitoring/status');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('total', 2);
      expect(res.body.data).toHaveProperty('up', 1);
      expect(res.body.data).toHaveProperty('down', 1);
    });
  });

  describe('GET /api/monitoring/statuses', () => {
    it('should return all active site statuses', async () => {
      const now = new Date();
      prismaMock.website.findMany.mockResolvedValueOnce([
        {
          id: 1, name: 'Site A', url: 'https://a.com', isActive: true,
          monitoringResults: [{ statusCode: 200, responseTimeMs: 50, isUp: true, errorMessage: null, checkedAt: now }],
          screenshots: [],
          defacementChecks: [],
        },
      ]);

      const res = await request(app).get('/api/monitoring/statuses');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].websiteName).toBe('Site A');
    });
  });

  describe('GET /api/monitoring/:websiteId', () => {
    it('should return paginated monitoring history', async () => {
      const now = new Date();
      const mockResults = [
        { id: 1, websiteId: 1, statusCode: 200, responseTimeMs: 50, isUp: true, checkedAt: now },
      ];

      prismaMock.monitoringResult.findMany.mockResolvedValueOnce(mockResults);
      prismaMock.monitoringResult.count.mockResolvedValueOnce(1);

      const res = await request(app).get('/api/monitoring/1?page=1&limit=50');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.meta).toHaveProperty('total', 1);
    });

    it('should return 400 for invalid websiteId', async () => {
      const res = await request(app).get('/api/monitoring/invalid');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/monitoring/:websiteId/latest', () => {
    it('should return latest status for a website', async () => {
      const now = new Date();
      prismaMock.website.findUnique.mockResolvedValueOnce({
        id: 1, name: 'Site A', url: 'https://a.com',
        monitoringResults: [{ statusCode: 200, responseTimeMs: 50, isUp: true, errorMessage: null, checkedAt: now }],
        screenshots: [],
        defacementChecks: [],
      });

      const res = await request(app).get('/api/monitoring/1/latest');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.websiteId).toBe(1);
    });

    it('should return 404 when website not found', async () => {
      prismaMock.website.findUnique.mockResolvedValueOnce(null);

      const res = await request(app).get('/api/monitoring/999/latest');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
