import { describe, it, expect } from 'vitest';
import { formatDate } from './dateFormat';

const d = new Date('2024-04-08T05:09:03Z');

describe('formatDate', () => {
  it('pads numeric tokens', () => {
    expect(formatDate(d, 'YYYY-MM-DD')).toBe('2024-04-08');
    expect(formatDate(d, 'HH:mm:ss')).toBe('05:09:03');
  });

  it('renders unpadded tokens', () => {
    expect(formatDate(d, 'M/D')).toBe('4/8');
    expect(formatDate(d, 'H:m:s')).toBe('5:9:3');
  });

  it('renders month names and two-digit year', () => {
    expect(formatDate(d, 'MMMM')).toBe('April');
    expect(formatDate(d, 'MMM')).toBe('Apr');
    expect(formatDate(d, 'YY')).toBe('24');
    expect(formatDate(d, 'YYYY MMM DD')).toBe('2024 Apr 08');
  });

  it('emits non-token characters verbatim', () => {
    expect(formatDate(d, 'YYYY/MM')).toBe('2024/04');
  });
});
