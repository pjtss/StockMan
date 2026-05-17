import { describe, it, expect } from 'vitest';
import { classifySector, getSectorSentiment } from './sectors';

describe('sectors.ts classification', () => {
  it('classifies major companies correctly', () => {
    expect(classifySector('삼성전자', 'Title')).toBe('IT/반도체');
    expect(classifySector('셀트리온', 'Title')).toBe('바이오/제약');
    expect(classifySector('에코프로', 'Title')).toBe('2차전지/에너지');
  });

  it('classifies by keywords in title', () => {
    expect(classifySector('SmallCo', '반도체 계약')).toBe('IT/반도체');
    expect(classifySector('SmallCo', '리튬 광산')).toBe('2차전지/에너지');
  });

  it('returns 기타 for unknown companies', () => {
    expect(classifySector('UnknownCo', 'Normal Title')).toBe('기타');
  });

  it('calculates aggregate sector sentiment', () => {
    const items = [
      { company: '삼성전자', title: '반도체 호재', judgment: '최강호재' },
      { company: 'Unknown', title: 'Normal' }
    ];
    const sentiment = getSectorSentiment(items);
    const itSector = sentiment.find(s => s.name === 'IT/반도체');
    expect(itSector?.strength).toBe(100);
    expect(itSector?.count).toBe(1);
  });
});
