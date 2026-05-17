import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MarketSentiment } from './market-sentiment';

// Mock CSS modules
vi.mock('./market-sentiment.module.css', () => ({
  default: {
    container: 'container',
    gauge: 'gauge',
    track: 'track',
    fill: 'fill',
    center: 'center',
    score: 'score',
    label: 'label',
    labels: 'labels',
  },
}));

describe('MarketSentiment Component', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(JSON.stringify([])),
      setItem: vi.fn(),
    });
  });

  it('renders score and label correctly', () => {
    render(<MarketSentiment score={75} label="BULLISH" />);
    expect(screen.getByText('75')).toBeDefined();
    expect(screen.getAllByText('BULLISH').length).toBeGreaterThan(0);
  });

  it('renders range labels', () => {
    render(<MarketSentiment score={50} label="NEUTRAL" />);
    expect(screen.getByText('BEARISH')).toBeDefined();
    expect(screen.getAllByText('NEUTRAL').length).toBeGreaterThan(0);
    expect(screen.getByText('BULLISH')).toBeDefined();
  });
});
