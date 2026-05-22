import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PageNavigation } from './page-navigation';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, className }: any) => <a href={href} className={className}>{children}</a>,
}));

// Mock CSS modules
vi.mock('./page-navigation.module.css', () => ({
  default: {
    nav: 'nav',
    navLink: 'navLink',
    navActive: 'navActive',
  },
}));

describe('PageNavigation Component', () => {
  it('renders all links', () => {
    render(<PageNavigation current="home" />);
    expect(screen.getByText('홈')).toBeDefined();
    expect(screen.getByText('DART')).toBeDefined();
    expect(screen.getByText('OPEN DART')).toBeDefined();
    expect(screen.getByText('상승률 TOP 10')).toBeDefined();
  });

  it('highlights the active link', () => {
    const { container } = render(<PageNavigation current="dart" />);
    const activeLink = container.querySelector('.navActive');
    expect(activeLink?.textContent).toBe('DART');
  });
});
