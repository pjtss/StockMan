import { describe, it, expect, vi } from 'vitest';
import { filterNewItems, syncDartAlerts } from './alerts';
import * as rss from './rss';

describe('alerts.ts', () => {
  describe('filterNewItems', () => {
    it('should filter items within the time window', () => {
      const now = new Date().toISOString();
      const longAgo = new Date(Date.now() - 600000).toISOString(); // 10 mins ago
      
      const items = [
        { publishedAt: now },
        { publishedAt: longAgo },
      ];
      
      const result = filterNewItems(items, 1);
      expect(result).toHaveLength(1);
      expect(result[0].publishedAt).toBe(now);
    });
  });

  describe('sync functions', () => {
    it('syncDartAlerts should fetch and return payload with newAlerts', async () => {
      const mockPayload = {
        source: 'DART',
        items: [
          { 
            source: 'DART', 
            company: 'Test Co', 
            title: 'Test Title', 
            publishedAt: new Date().toISOString(),
            judgment: '최강호재',
            link: 'https://link',
            keywords: ['key']
          }
        ]
      };
      
      vi.spyOn(rss, 'fetchDartFeed').mockResolvedValue(mockPayload as any);
      
      const result = await syncDartAlerts();
      expect(result.newAlerts).toHaveLength(1);
      expect(result.newAlerts![0].company).toBe('Test Co');
    });
  });
});
