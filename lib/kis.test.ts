import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('KIS API Module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = originalEnv;
  });

  describe('When credentials are not configured', () => {
    beforeEach(() => {
      delete process.env.KIS_APPKEY;
      delete process.env.KIS_APPSECRET;
    });

    it('returns mock trading intensity data', async () => {
      const { fetchTradingIntensity } = await import('./kis');
      const data = await fetchTradingIntensity();
      expect(data).toHaveLength(10);
      expect(data[0].company).toBe('가짜 종목 A');
      expect(data[0].intensity).toBe(180);
    });

    it('returns mock volume spike data', async () => {
      const { fetchVolumeSpike } = await import('./kis');
      const data = await fetchVolumeSpike();
      expect(data).toHaveLength(10);
      expect(data[0].company).toBe('급등 종목 K');
      expect(data[0].volumeRatio).toBe('500%');
    });

    it('returns mock net buying data', async () => {
      const { fetchNetBuying } = await import('./kis');
      const data = await fetchNetBuying();
      expect(data).toHaveLength(10);
      expect(data[0].company).toBe('수급 종목 U');
      expect(data[0].foreignNetBuy).toBe('+300억');
    });

    it('returns mock program trading data', async () => {
      const { fetchProgramTrading } = await import('./kis');
      const data = await fetchProgramTrading();
      expect(data).toHaveLength(10);
      expect(data[0].company).toBe('알고리즘 매수 A');
      expect(data[0].programNetBuy).toBe('+150만주');
    });

    it('returns mock new high data', async () => {
      const { fetchNewHigh } = await import('./kis');
      const data = await fetchNewHigh();
      expect(data).toHaveLength(10);
      expect(data[0].company).toBe('돌파 종목 Z');
      expect(data[0].highType).toBe('52주 신고가');
      expect(data[3].highType).toBe('60일 신고가');
    });

    it('returns mock bid ask ratio data', async () => {
      const { fetchBidAskRatio } = await import('./kis');
      const data = await fetchBidAskRatio();
      expect(data).toHaveLength(10);
      expect(data[0].company).toBe('강호가 종목 1');
      expect(data[0].bidAskRatio).toBe(250);
    });
  });
  describe('When credentials are set', () => {
    it('handles successful access token lookup and returns full data', async () => {
      process.env.KIS_APPKEY = 'test-key';
      process.env.KIS_APPSECRET = 'test-secret';
      
      const { fetchTradingIntensity } = await import('./kis');

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ access_token: 'test-token' }),
      } as any);

      const intensity = await fetchTradingIntensity();
      expect(intensity).toHaveLength(10);
      expect(intensity[0].company).toBe('가짜 종목 A');
    });

    it('handles access token fetch failure and falls back to mock', async () => {
      process.env.KIS_APPKEY = 'test-key';
      process.env.KIS_APPSECRET = 'test-secret';
      
      const { fetchTradingIntensity } = await import('./kis');

      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

      const intensity = await fetchTradingIntensity();
      expect(intensity).toHaveLength(10);
      expect(intensity[0].company).toBe('가짜 종목 A');
    });
  });
});
