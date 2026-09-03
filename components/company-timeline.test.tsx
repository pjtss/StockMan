import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CompanyTimeline } from './company-timeline';

describe('CompanyTimeline Component', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders loading state and displays timeline items on successful API response', async () => {
    const mockData = [
      {
        link: 'http://test-link-1',
        publishedAt: '2026-05-16T12:00:00.000Z',
        judgment: '최강호재',
        title: '삼성전자 단일판매공급계약체결',
      },
      {
        link: 'http://test-link-2',
        publishedAt: '2026-05-15T09:00:00.000Z',
        judgment: '호재',
        title: '삼성전자 영업실적공시',
      },
      {
        link: 'http://test-link-3',
        publishedAt: '2026-05-14T09:00:00.000Z',
        judgment: '악재',
        title: '삼성전자 소송피소',
      },
      {
        link: 'http://test-link-4',
        publishedAt: '2026-05-13T09:00:00.000Z',
        judgment: '평이',
        title: '삼성전자 일반공시',
      },
    ];

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    } as any);

    const handleClose = vi.fn();
    render(<CompanyTimeline company="삼성전자" items={[]} onClose={handleClose} />);

    // Renders loading state
    expect(screen.getByText(/DB에서 공시 연대기를 집계하는 중/)).toBeInTheDocument();

    // Wait for the timeline items to load
    await waitFor(() => {
      expect(screen.getByText('삼성전자 공시 역사 타임라인 (1년)')).toBeInTheDocument();
    });

    // Wait for the async API result before checking timeline contents.
    await waitFor(() => {
      expect(screen.getByText('최강호재')).toBeInTheDocument();
      expect(screen.getByText('호재')).toBeInTheDocument();
      expect(screen.getByText('악재')).toBeInTheDocument();
      expect(screen.getByText('평이')).toBeInTheDocument();
      expect(screen.getByText('삼성전자 단일판매공급계약체결')).toBeInTheDocument();
    });
  });

  it('triggers onClose when overlay or close button is clicked', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    } as any);

    const handleClose = vi.fn();
    render(<CompanyTimeline company="삼성전자" items={[]} onClose={handleClose} />);

    await waitFor(() => {
      expect(screen.getByText('해당 종목의 데이터가 없습니다.')).toBeInTheDocument();
    });

    // Click close button
    const closeBtn = screen.getByText('×');
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Click overlay
    const overlay = screen.getByText('HISTORICAL TIMELINE').closest('div[class*="overlay"]');
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay!);
    expect(handleClose).toHaveBeenCalledTimes(2);

    // Modal click does not close due to stopPropagation
    const modal = screen.getByText('삼성전자 공시 역사 타임라인 (1년)').closest('div[class*="modal"]');
    expect(modal).not.toBeNull();
    fireEvent.click(modal!);
    expect(handleClose).toHaveBeenCalledTimes(2); // no increase
  });

  it('falls back to filtered local items when API call fails', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('API failed'));

    const mockLocalItems = [
      { company: '삼성전자', title: '로컬 삼성 공시', publishedAt: '2026-05-16T12:00:00Z', judgment: '호재' },
      { company: 'SK하이닉스', title: '로컬 SK 공시', publishedAt: '2026-05-16T12:00:00Z', judgment: '호재' },
    ];

    render(<CompanyTimeline company="삼성전자" items={mockLocalItems} onClose={vi.fn()} />);

    await waitFor(() => {
      // Should show filtered local item
      expect(screen.getByText('로컬 삼성 공시')).toBeInTheDocument();
      // Should not show other company
      expect(screen.queryByText('로컬 SK 공시')).not.toBeInTheDocument();
    });
  });

  it('renders error block when API fails and no local items exist', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
    } as any);

    render(<CompanyTimeline company="삼성전자" items={[]} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('공시 히스토리 로드 실패')).toBeInTheDocument();
    });
  });
});
