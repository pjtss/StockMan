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
            <link>https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260516000001</link>
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
    expect(items[0].link).toBe('https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260516000001');
    expect(items[0].rceptNo).toBe('20260516000001');
  });

  it('should filter out items from other days', () => {
    const mockXml = `
      <rss version="2.0">
        <channel>
          <item>
            <title><![CDATA[삼성전자 - 대규모 수주]]></title>
            <link>https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260515000001</link>
            <pubDate>Fri, 15 May 2026 10:00:00 +0900</pubDate>
          </item>
        </channel>
      </rss>
    `;
    const today = '2026-05-16';
    const items = parseDartItems(mockXml, today);
    expect(items).toHaveLength(0);
  });

  it('canonicalizes only an exact official DART viewer link with one matching receipt number', () => {
    const makeXml = (link: string) => `<rss><channel><item><title>삼성전자 - 제3자 배정 유상증자 결정</title><link>${link.replaceAll('&', '&amp;')}</link><pubDate>Sat, 16 May 2026 10:00:00 +0900</pubDate></item></channel></rss>`;
    const officialLink = 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260516000001';
    const [valid] = parseDartItems(makeXml(officialLink), '2026-05-16');
    expect(valid.link).toBe(officialLink);
    expect(valid.rceptNo).toBe('20260516000001');

    for (const invalidLink of [
      'https://dart.fss.or.kr.evil.example/dsaf001/main.do?rcpNo=20260516000001',
      'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260516000001&url=https%3A%2F%2Fevil.example',
      'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260516000001&rcpNo=20260516000002',
      'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=%32%30%32%36%30%35%31%36%30%30%30%30%30%31',
    ]) {
      const [invalid] = parseDartItems(makeXml(invalidLink), '2026-05-16');
      expect(invalid.link).toBe('');
      expect(invalid.rceptNo).toBe('');
    }
  });

  it('rejects malformed XML, invalid date keys, and oversized payloads', () => {
    expect(parseDartItems('<rss><channel>', '2026-05-16')).toEqual([]);
    expect(parseDartItems('<rss><channel/></rss>', '2026-02-30')).toEqual([]);
    expect(parseDartItems(`<rss>${' '.repeat(2 * 1024 * 1024)}</rss>`, '2026-05-16')).toEqual([]);
  });

  it('removes duplicate receipt numbers from the feed', () => {
    const entry = '<item><title>삼성전자 - 대규모 수주</title><link>https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260516000001</link><pubDate>Sat, 16 May 2026 10:00:00 +0900</pubDate></item>';
    expect(parseDartItems(`<rss><channel>${entry}${entry}</channel></rss>`, '2026-05-16')).toHaveLength(1);
  });
});

describe('RSS Fetching', () => {
  it('fetchDartFeed should handle successful response', async () => {
    const mockXml = '<rss><channel><item><title>Test</title></item></channel></rss>';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/rss+xml' }),
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
      headers: new Headers(),
    }));

    await expect(rss.fetchDartFeed()).rejects.toThrow('DART RSS 요청 실패: 500');
  });

  it('rejects non-XML content types and oversized declared responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ 'content-type': 'text/html' }), text: () => Promise.resolve('<html/>') }));
    await expect(rss.fetchDartFeed()).rejects.toThrow('응답 형식이 XML');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ 'content-length': String(3 * 1024 * 1024) }), text: () => Promise.resolve('<rss/>') }));
    await expect(rss.fetchDartFeed()).rejects.toThrow('응답 크기가 제한');
  });

  it('rejects malformed XML from a successful upstream response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), text: () => Promise.resolve('<rss><channel>') }));
    await expect(rss.fetchDartFeed()).rejects.toThrow('XML 구문이 올바르지 않습니다');
  });
});
