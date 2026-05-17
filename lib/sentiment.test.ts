import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSentimentHistory, addSentimentSnapshot } from './sentiment';

describe('sentiment.ts history', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
    });
  });

  it('getSentimentHistory returns empty array if no data', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    expect(getSentimentHistory()).toEqual([]);
  });

  it('addSentimentSnapshot adds a new snapshot', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify([]));
    addSentimentSnapshot(75);
    expect(localStorage.setItem).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('"score":75'));
  });

  it('prevents rapid snapshot additions (throttling)', () => {
    const now = Date.now();
    vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify([
      { score: 50, timestamp: new Date(now - 30000).toISOString() }
    ]));
    
    addSentimentSnapshot(60);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
});
