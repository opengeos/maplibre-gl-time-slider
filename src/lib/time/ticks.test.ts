import { describe, it, expect } from 'vitest';
import { generateTicks } from './ticks';

const d = (iso: string) => new Date(iso);

describe('generateTicks', () => {
  it('places major ticks on month boundaries for day granularity', () => {
    const ticks = generateTicks(d('2024-04-18T00:00:00Z'), d('2024-06-10T00:00:00Z'), 'day');
    const majors = ticks.filter((t) => t.major);
    // May 1 and Jun 1 fall inside the range.
    expect(majors.map((t) => t.label)).toEqual(['May', 'Jun']);
    majors.forEach((t) => {
      expect(t.date.getUTCDate()).toBe(1);
    });
  });

  it('labels January with the year for day granularity', () => {
    const ticks = generateTicks(d('2023-12-15T00:00:00Z'), d('2024-02-15T00:00:00Z'), 'day');
    const jan = ticks.find((t) => t.major && t.date.getUTCMonth() === 0);
    expect(jan?.label).toBe('2024');
  });

  it('uses year labels for month granularity', () => {
    const ticks = generateTicks(d('2022-06-01T00:00:00Z'), d('2024-06-01T00:00:00Z'), 'month');
    const majors = ticks.filter((t) => t.major);
    expect(majors.map((t) => t.label)).toEqual(['2023', '2024']);
  });

  it('emits one tick per year for year granularity with no minors', () => {
    const ticks = generateTicks(d('2020-01-01T00:00:00Z'), d('2023-01-01T00:00:00Z'), 'year');
    expect(ticks.every((t) => t.major)).toBe(true);
    expect(ticks.map((t) => t.label)).toEqual(['2020', '2021', '2022', '2023']);
  });

  it('keeps fractions within [0, 1] and sorted', () => {
    const ticks = generateTicks(d('2024-01-01T00:00:00Z'), d('2024-12-31T00:00:00Z'), 'day');
    expect(ticks.length).toBeGreaterThan(0);
    let last = -Infinity;
    for (const t of ticks) {
      expect(t.fraction).toBeGreaterThanOrEqual(0);
      expect(t.fraction).toBeLessThanOrEqual(1);
      expect(t.date.getTime()).toBeGreaterThanOrEqual(last);
      last = t.date.getTime();
    }
  });

  it('thins ticks for very large ranges', () => {
    const ticks = generateTicks(d('1900-01-01T00:00:00Z'), d('2100-01-01T00:00:00Z'), 'year', 50);
    expect(ticks.length).toBeLessThanOrEqual(60);
  });

  it('uses yearly month multiples for a decade-wide daily axis', () => {
    const ticks = generateTicks(
      d('2015-06-01T00:00:00Z'),
      d('2024-06-01T00:00:00Z'),
      'day',
      12
    );
    const majors = ticks.filter((tick) => tick.major);
    expect(majors.every((tick) => tick.date.getUTCMonth() === 0)).toBe(true);
    expect(majors.map((tick) => tick.label)).toEqual([
      '2016',
      '2017',
      '2018',
      '2019',
      '2020',
      '2021',
      '2022',
      '2023',
      '2024',
    ]);
  });
});
