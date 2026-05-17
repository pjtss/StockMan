import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeedPage } from './feed-page';
import { PushProvider } from './push-provider';

// Mock child components
vi.mock('./market-sentiment', () => ({
  MarketSentiment: () => <div data-testid="sentiment" />
}));

vi.mock('./page-navigation', () => ({
  PageNavigation: () => <nav data-testid="navigation" />
}));

// Mock CSS
vi.mock('./feed-page.module.css', () => ({
  default: {
    container: 'container',
    hero: 'hero',
    title: 'title',
    description: 'description',
    searchInput: 'searchInput',
  },
}));

describe('FeedPage Component', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: any) => {
      if (typeof url === 'string' && url.includes('stock')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        } as any);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      } as any);
    }));
    
    // Mock navigator.serviceWorker for PushProvider
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue(null),
      }
    });
  });

  it('renders page header correctly', async () => {
    await act(async () => {
      render(
        <PushProvider>
          <FeedPage type="dart" title="DART 공시" description="실시간 호재 공시" />
        </PushProvider>
      );
    });
    
    expect(screen.getByText('DART 공시')).toBeDefined();
    expect(screen.getByText('실시간 호재 공시')).toBeDefined();
  });
});
