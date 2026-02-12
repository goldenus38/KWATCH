import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from '../mocks/prisma';

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-id' }),
    }),
  },
}));

vi.mock('axios', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { ok: true } }),
  },
}));

import { AlertService } from '../../services/AlertService';
import nodemailer from 'nodemailer';
import axios from 'axios';

describe('AlertService', () => {
  let service: AlertService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AlertService();
  });

  describe('createAlert', () => {
    it('should create an alert record and send notifications', async () => {
      const website = { id: 1, name: 'Test Site', url: 'https://test.com' };
      prismaMock.website.findUnique.mockResolvedValueOnce(website);
      prismaMock.alert.findFirst.mockResolvedValueOnce(null); // no duplicate
      prismaMock.alert.create.mockResolvedValueOnce({
        id: BigInt(1),
        websiteId: 1,
        alertType: 'DOWN',
        severity: 'CRITICAL',
        message: 'Site is down',
        isAcknowledged: false,
        createdAt: new Date(),
      });
      prismaMock.alertChannel.findMany.mockResolvedValueOnce([]); // no channels

      const result = await service.createAlert({
        websiteId: 1,
        alertType: 'DOWN',
        severity: 'CRITICAL',
        message: 'Site is down',
      });

      expect(prismaMock.alert.create).toHaveBeenCalledOnce();
      expect(result.alertType).toBe('DOWN');
    });

    it('should suppress duplicate alerts within 1 hour', async () => {
      const website = { id: 1, name: 'Test Site', url: 'https://test.com' };
      prismaMock.website.findUnique.mockResolvedValueOnce(website);
      const existingAlert = {
        id: BigInt(99),
        websiteId: 1,
        alertType: 'DOWN',
        severity: 'CRITICAL',
        message: 'Already alerted',
        createdAt: new Date(),
      };
      prismaMock.alert.findFirst.mockResolvedValueOnce(existingAlert);

      const result = await service.createAlert({
        websiteId: 1,
        alertType: 'DOWN',
        severity: 'CRITICAL',
        message: 'Site is down again',
      });

      expect(prismaMock.alert.create).not.toHaveBeenCalled();
      expect(result).toBe(existingAlert);
    });

    it('should throw if website not found', async () => {
      prismaMock.website.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.createAlert({
          websiteId: 999,
          alertType: 'DOWN',
          severity: 'CRITICAL',
          message: 'Down',
        }),
      ).rejects.toThrow('Website not found: 999');
    });
  });

  describe('sendEmail', () => {
    it('should call transporter.sendMail with correct options', async () => {
      // Recreate service with email config set so transporter is initialized
      const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'ok' });
      (nodemailer.createTransport as any).mockReturnValue({ sendMail: mockSendMail });

      // Access the private transporter via direct assignment
      const svc = new AlertService();
      (svc as any).emailTransporter = { sendMail: mockSendMail };

      const alert = {
        id: BigInt(1),
        alertType: 'DOWN',
        severity: 'CRITICAL',
        message: 'Connection refused',
        createdAt: new Date(),
      };

      await svc.sendEmail(alert, 'Test Website', {
        to: ['admin@test.com'],
        from: 'kwatch@test.com',
      });

      expect(mockSendMail).toHaveBeenCalledOnce();
      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.to).toBe('admin@test.com');
      expect(callArgs.subject).toContain('Test Website');
    });

    it('should skip if no recipients', async () => {
      const svc = new AlertService();
      (svc as any).emailTransporter = { sendMail: vi.fn() };

      await svc.sendEmail({}, 'Test', { to: [] });

      expect((svc as any).emailTransporter.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('sendSlack', () => {
    it('should call axios.post with webhook URL', async () => {
      const alert = {
        id: BigInt(1),
        alertType: 'DOWN',
        severity: 'CRITICAL',
        message: 'Down',
        createdAt: new Date(),
      };

      await service.sendSlack(alert, 'Test Site', {
        webhookUrl: 'https://hooks.slack.com/test',
      });

      expect(axios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          attachments: expect.any(Array),
        }),
      );
    });

    it('should skip if no webhook URL', async () => {
      await service.sendSlack({}, 'Test', {});

      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  describe('sendTelegram', () => {
    it('should call Telegram Bot API', async () => {
      const alert = {
        id: BigInt(1),
        alertType: 'DEFACEMENT',
        severity: 'CRITICAL',
        message: 'Defaced',
        createdAt: new Date(),
      };

      await service.sendTelegram(alert, 'Test Site', {
        botToken: 'fake-token',
        chatId: '12345',
      });

      expect(axios.post).toHaveBeenCalledWith(
        'https://api.telegram.org/botfake-token/sendMessage',
        expect.objectContaining({
          chat_id: '12345',
          parse_mode: 'Markdown',
        }),
      );
    });

    it('should skip if missing botToken or chatId', async () => {
      await service.sendTelegram({}, 'Test', { botToken: 'tok' });
      expect(axios.post).not.toHaveBeenCalled();

      await service.sendTelegram({}, 'Test', { chatId: '123' });
      expect(axios.post).not.toHaveBeenCalled();
    });
  });
});
