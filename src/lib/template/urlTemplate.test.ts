import { describe, it, expect } from 'vitest';
import { expandTokens, resolveUrl } from './urlTemplate';

const date = new Date('2024-04-18T06:00:00Z');

describe('expandTokens', () => {
  it('substitutes individual date tokens', () => {
    expect(expandTokens('https://x/{YYYY}/{MM}/{DD}.tif', date)).toBe('https://x/2024/04/18.tif');
    expect(expandTokens('t={HH}', date)).toBe('t=06');
  });

  it('supports the {date:FORMAT} form', () => {
    expect(expandTokens('?d={date:YYYY-MM-DD}', date)).toBe('?d=2024-04-18');
  });

  it('leaves {z}/{x}/{y} and unknown tokens intact', () => {
    expect(expandTokens('https://x/{z}/{x}/{y}.png?d={YYYY}', date)).toBe(
      'https://x/{z}/{x}/{y}.png?d=2024'
    );
    expect(expandTokens('{unknown}', date)).toBe('{unknown}');
  });
});

describe('resolveUrl', () => {
  it('expands string templates synchronously', () => {
    expect(resolveUrl('y={YYYY}', date)).toBe('y=2024');
  });

  it('invokes synchronous resolver functions', () => {
    expect(resolveUrl((d) => `t=${d.getUTCFullYear()}`, date)).toBe('t=2024');
  });

  it('awaits asynchronous resolver functions', async () => {
    await expect(
      Promise.resolve(resolveUrl(async (d) => `async=${d.getUTCMonth() + 1}`, date))
    ).resolves.toBe('async=4');
  });
});
