import { afterEach, describe, it, expect, vi } from 'vitest';
import { parseDartItems } from './rss';
import * as rss from './rss';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('RSS Parsing', () => {
  it('should parse DART XML correctly', () => {
    const mockXml = `
      <rss version="2.0">
        <channel>
          <item>
            <title><![CDATA[삼성전자 - 제3자 배정 유상증자 결정]]></title>
            <link>https://dart.fss.or.kr/link1</link>
            <pubDate>Sat, 16 May 2026 10:00:00 +0900</pubDate>
          </item>
        </channel>
      </rss>
    `;
    const today = '2026-05-16';
    const items = parseDartItems(mockXml, today);
    
    expect(items).toHaveLength(1);
    expect(items[0].company).toBe('삼성전자');
    expect(items[0].judgment).toBe('최강호재');
  });

  it('should filter out items from other days', () => {
    const mockXml = `
      <rss version="2.0">
        <channel>
          <item>
            <title><![CDATA[삼성전자 - 대규모 수주]]></title>
            <link>https://dart.fss.or.kr/link1</link>
            <pubDate>Fri, 15 May 2026 10:00:00 +0900</pubDate>
          </item>
        </channel>
      </rss>
    `;
    const today = '2026-05-16';
    const items = parseDartItems(mockXml, today);
    expect(items).toHaveLength(0);
  });
});

describe('RSS Fetching', () => {
  it('fetchDartFeed should handle successful response', async () => {
    const mockXml = '<rss><channel><item><title>Test</title></item></channel></rss>';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockXml),
    }));

    const result = await rss.fetchDartFeed();
    expect(result.source).toBe('DART');
    expect(result.items).toBeDefined();
  });

  it('fetchDartFeed should throw on error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }));

    await expect(rss.fetchDartFeed()).rejects.toThrow('DART RSS 요청 실패: 500');
  });
});
