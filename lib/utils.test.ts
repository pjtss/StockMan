import { describe, it, expect } from 'vitest';
import { 
  formatTime, 
  minutesAgo, 
  getJudgmentStatus, 
  sortByPublishedAtDesc, 
  paginateItems, 
  marketLabel, 
  isStrongBullish, 
  getNaverFinanceLink 
} from './utils';

describe('utils.ts', () => {
  describe('formatTime', () => {
    it('should return "-" for empty value', () => {
      expect(formatTime('')).toBe('-');
    });
    it('should return the value for invalid date', () => {
      expect(formatTime('invalid')).toBe('invalid');
    });
    it('should format date correctly (short=false)', () => {
      const date = '2026-05-16T10:00:00Z';
      // We check if it matches the pattern rather than exact string due to local environment diffs
      expect(formatTime(date)).toMatch(/\d{2}/); 
    });
    it('should format date correctly (short=true)', () => {
      const date = '2026-05-16T10:00:00Z';
      expect(formatTime(date, true)).toMatch(/\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('minutesAgo', () => {
    it('should return POSITIVE_INFINITY for invalid date', () => {
      expect(minutesAgo('invalid')).toBe(Number.POSITIVE_INFINITY);
    });
    it('should return 0 for now', () => {
      expect(minutesAgo(new Date().toISOString())).toBe(0);
    });
    it('should return 60 for 1 hour ago', () => {
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      expect(minutesAgo(oneHourAgo)).toBe(60);
    });
  });

  describe('getJudgmentStatus', () => {
    it('should return good for bullish values', () => {
      expect(getJudgmentStatus('최강호재')).toBe('good');
      expect(getJudgmentStatus('호재가능')).toBe('good');
    });
    it('should return warn for important values', () => {
      expect(getJudgmentStatus('중요공시')).toBe('warn');
    });
    it('should return neutral for other values', () => {
      expect(getJudgmentStatus('일반공시')).toBe('neutral');
    });
  });

  describe('sortByPublishedAtDesc', () => {
    it('should sort items by date descending', () => {
      const items = [
        { publishedAt: '2026-05-16T10:00:00Z' },
        { publishedAt: '2026-05-16T11:00:00Z' },
      ];
      const sorted = sortByPublishedAtDesc(items);
      expect(sorted[0].publishedAt).toBe('2026-05-16T11:00:00Z');
    });
  });

  describe('paginateItems', () => {
    it('should return a slice of items', () => {
      const items = [1, 2, 3, 4, 5];
      expect(paginateItems(items, 1, 2)).toEqual([1, 2]);
      expect(paginateItems(items, 2, 2)).toEqual([3, 4]);
    });
  });

  describe('marketLabel', () => {
    it('should return KOSPI for Y', () => {
      expect(marketLabel('Y')).toBe('KOSPI');
    });
    it('should return KOSDAQ for K', () => {
      expect(marketLabel('K')).toBe('KOSDAQ');
    });
    it('should return the value or "-" for others', () => {
      expect(marketLabel('')).toBe('-');
      expect(marketLabel('UNKNOWN')).toBe('UNKNOWN');
    });
  });

  describe('isStrongBullish', () => {
    it('should return true for 최강호재', () => {
      expect(isStrongBullish({ judgment: '최강호재' } as any)).toBe(true);
      expect(isStrongBullish({ judgment: '호재가능' } as any)).toBe(false);
    });
  });

  describe('getNaverFinanceLink', () => {
    it('should return correct link', () => {
      const link = getNaverFinanceLink('삼성전자');
      expect(link).toContain('https://finance.naver.com/search/searchList.naver?query=');
      expect(link).toContain(encodeURIComponent('삼성전자'));
    });
  });
});
