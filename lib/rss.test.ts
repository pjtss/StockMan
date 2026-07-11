import { afterEach, describe, it, expect, vi } from 'vitest';
import { parseDartItems } from './rss';
import * as rss from './rss';

function createSecAtomEntry({
  accession,
  publishedAt,
  summary,
}: {
  accession: string;
  publishedAt: string;
  summary: string;
}) {
  return `
    <entry>
      <id>urn:tag:sec.gov,2008:accession-number=${accession}</id>
      <title>8-K - Example Corp (0000000001)</title>
      <summary>${summary}</summary>
      <link href="https://www.sec.gov/Archives/${accession}" />
      <published>${publishedAt}</published>
      <category term="8-K" />
    </entry>
  `;
}

function createSecAtomFeed(entries: string[]) {
  return `<feed>${entries.join('')}</feed>`;
}

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

  it('should continue SEC pagination when a today page has no bullish filings', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-11T03:00:00.000Z'));

    const fetchMock = vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const start = Number(new URL(String(input)).searchParams.get('start'));
      const pageIndex = start / 100;

      if (start <= 1000) {
        return {
          ok: true,
          text: async () => createSecAtomFeed([
            createSecAtomEntry({
              accession: `0000000001-26-${String(pageIndex + 1).padStart(6, '0')}`,
              publishedAt: '2026-07-11T02:30:00.000Z',
              summary: 'Routine corporate update',
            }),
          ]),
        };
      }

      if (start === 1100) {
        return {
          ok: true,
          text: async () => createSecAtomFeed([
            createSecAtomEntry({
              accession: '0000000001-26-999999',
              publishedAt: '2026-07-11T02:20:00.000Z',
              summary: 'Entry into a material definitive agreement',
            }),
          ]),
        };
      }

      return {
        ok: true,
        text: async () => createSecAtomFeed([
          createSecAtomEntry({
            accession: '0000000001-26-888888',
            publishedAt: '2026-07-10T02:00:00.000Z',
            summary: 'Entry into a material definitive agreement',
          }),
        ]),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await rss.fetchSecFeed();

    expect(fetchMock).toHaveBeenCalledTimes(13);
    expect(result.items.map((item) => item.accession)).toEqual(['0000000001-26-999999']);
  });
});

describe('SEC Parsing', () => {
  it('marks a page as today even when every filing is filtered out', () => {
    const result = rss.parseSecItems(
      createSecAtomFeed([
        createSecAtomEntry({
          accession: '0000000001-26-000001',
          publishedAt: '2026-07-11T02:30:00.000Z',
          summary: 'Routine corporate update',
        }),
      ]),
      '2026-07-11',
    );

    expect(result.items).toEqual([]);
    expect(result.foundToday).toBe(true);
  });
});
