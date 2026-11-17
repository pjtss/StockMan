import { describe, it, expect, vi, beforeEach } from 'vitest';
import webpush from 'web-push';
import { sendPushAlerts, savePushSubscription } from './push';
import * as db from './db';

// Mock web-push
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue({}),
  },
}));

// Mock db
vi.mock('./db', () => ({
  getPool: vi.fn().mockReturnValue({
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: vi.fn(),
    }),
  }),
}));

describe('push.ts', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
      VAPID_SUBJECT: 'mailto:test@example.com',
    };
  });

  describe('savePushSubscription', () => {
    it('should call database query with subscription data', async () => {
      const mockSub = {
        endpoint: 'https://test',
        p256dh: 'p256',
        auth: 'auth',
        enabled: true,
        dartEnabled: true,
        secEnabled: true,
      };

      await savePushSubscription(mockSub);
      
      const pool = db.getPool();
      const client = await pool.connect();
      expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO push_subscriptions'), expect.any(Array));
    });
  });

  describe('sendPushAlerts', () => {
    it('should do nothing if alerts array is empty', async () => {
      await sendPushAlerts([]);
      expect(webpush.sendNotification).not.toHaveBeenCalled();
    });

    it('should send notification for each allowed subscription', async () => {
      const mockAlerts = [
        {
          source: 'DART' as const,
          company: 'Test Co',
          title: 'Bullish',
          level: '최강호재',
          link: 'https://link',
          publishedAt: new Date().toISOString(),
        },
      ];

      // Mock subscriptions in DB
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          rows: [
            {
              endpoint: 'https://sub1',
              p256dh: 'p1',
              auth: 'a1',
              enabled: true,
              dart_enabled: true,
              preview_mode: "GENERIC",
              preference_revision: 1,
            },
          ],
        }),
        release: vi.fn(),
      };
      vi.mocked(db.getPool().connect).mockResolvedValue(mockClient as any);

      await sendPushAlerts(mockAlerts);

      expect(webpush.setVapidDetails).toHaveBeenCalled();
      expect(webpush.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'https://sub1' }),
        expect.any(String)
      );
    });
  });
});
