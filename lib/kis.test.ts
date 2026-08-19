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
});
