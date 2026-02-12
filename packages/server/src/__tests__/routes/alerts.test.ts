import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { prismaMock } from '../mocks/prisma';
import { createApp } from '../../app';
import { config } from '../../config';

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test' }),
    }),
  },
}));

vi.mock('axios', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { ok: true } }),
  },
}));

const app = createApp();

function makeAdminToken(): string {
  return jwt.sign(
    { userId: 1, username: 'admin', role: 'admin' },
    config.jwt.secret,
    { expiresIn: '1h' },
  );
}

describe('Alert Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/alerts', () => {
    it('should return alert list', async () => {
      const now = new Date();
      prismaMock.alert.findMany.mockResolvedValueOnce([
        {
          id: 1,
          websiteId: 1,
          alertType: 'DOWN',
          severity: 'CRITICAL',
          message: 'Down',
          isAcknowledged: false,
          createdAt: now,
          website: { id: 1, name: 'Test' },
          acknowledger: null,
        },
      ]);
      prismaMock.alert.count.mockResolvedValueOnce(1);

      const res = await request(app).get('/api/alerts');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.total).toBe(1);
    });

    it('should filter by alertType', async () => {
      prismaMock.alert.findMany.mockResolvedValueOnce([]);
      prismaMock.alert.count.mockResolvedValueOnce(0);

      const res = await request(app).get('/api/alerts?alertType=DOWN');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/alerts/test', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/alerts/test')
        .send({});

      expect(res.status).toBe(401);
    });

    it('should test all active channels for admin', async () => {
      const token = makeAdminToken();

      prismaMock.alertChannel.findMany.mockResolvedValueOnce([
        {
          id: 1,
          channelType: 'SLACK',
          config: { webhookUrl: 'https://hooks.slack.com/test' },
          isActive: true,
        },
      ]);

      const res = await request(app)
        .post('/api/alerts/test')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.results).toHaveLength(1);
      expect(res.body.data.results[0].channel).toBe('SLACK');
      expect(res.body.data.results[0].success).toBe(true);
    });

    it('should handle no active channels', async () => {
      const token = makeAdminToken();
      prismaMock.alertChannel.findMany.mockResolvedValueOnce([]);

      const res = await request(app)
        .post('/api/alerts/test')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.results).toHaveLength(0);
    });

    it('should test specific channel type', async () => {
      const token = makeAdminToken();

      prismaMock.alertChannel.findMany.mockResolvedValueOnce([
        {
          id: 2,
          channelType: 'TELEGRAM',
          config: { botToken: 'tok', chatId: '123' },
          isActive: true,
        },
      ]);

      const res = await request(app)
        .post('/api/alerts/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ channelType: 'TELEGRAM' });

      expect(res.status).toBe(200);
      expect(res.body.data.results[0].channel).toBe('TELEGRAM');
    });
  });
});
