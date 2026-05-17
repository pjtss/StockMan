import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenDartFastPage } from './opendart-fast-page';

// Mock child components
vi.mock('./page-navigation', () => ({
  PageNavigation: () => <nav data-testid="navigation" />
}));

// Mock CSS
vi.mock('./opendart-fast-page.module.css', () => ({
  default: {
    page: 'page',
    hero: 'hero',
    stats: 'stats',
    statCard: 'statCard',
    panel: 'panel',
    tableWrap: 'tableWrap',
    table: 'table',
    empty: 'empty',
  },
}));

describe('OpenDartFastPage Component', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders correctly with items', async () => {
    const mockPayload = {
      source: 'OPENDART',
      fetchedAt: '2026-05-16T10:00:00Z',
      items: [
        {
          receiptNo: '1',
          corpName: 'Test Co',
          reportName: 'Strong Disclosure',
          judgment: '최강호재',
          keywords: ['K1'],
          link: 'https://link',
        }
      ],
    };

    vi.mocked(fetch).mockImplementation((url: any) => {
      if (typeof url === 'string' && url.includes('opendart-fast')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockPayload),
        } as any);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as any);
    });

    await act(async () => {
      render(<OpenDartFastPage />);
    });
    
    expect(screen.getByText('국내 주식 실시간 공시 스캐너')).toBeDefined();
    expect(screen.getByText('Test Co')).toBeDefined();
    expect(screen.getAllByText('최강호재').length).toBeGreaterThan(0);
  });
});
