import { describe, it, expect } from 'vitest';
import { generateTicks } from './ticks';

const d = (iso: string) => new Date(iso);

const labelsOf = (ticks: { major: boolean; label?: string }[]) =>
  ticks.filter((tick) => tick.major).map((tick) => tick.label);

describe('generateTicks', () => {
  it('labels every day of a month-long daily range', () => {
    // The regression behind #40: 31 daily steps used to fall past the
    // short-range branch and collapse to a single year label.
    const ticks = generateTicks(d('2026-01-01T00:00:00Z'), d('2026-01-31T00:00:00Z'), 'day', 15);
    expect(labelsOf(ticks)).toEqual([
      'Jan 01 2026',
      'Jan 03',
      'Jan 05',
      'Jan 07',
      'Jan 09',
      'Jan 11',
      'Jan 13',
      'Jan 15',
      'Jan 17',
      'Jan 19',
      'Jan 21',
      'Jan 23',
      'Jan 25',
      'Jan 27',
      'Jan 29',
      'Jan 31',
    ]);
  });

  it('spells out the year only where the axis crosses into a new one', () => {
    const ticks = generateTicks(d('2023-12-15T00:00:00Z'), d('2024-01-15T00:00:00Z'), 'day', 15);
    // Ticks sit on natural weekly boundaries, not on the arbitrary range start.
    expect(labelsOf(ticks)).toEqual(['Dec 21 2023', 'Dec 28', 'Jan 04 2024', 'Jan 11']);
  });

  it('labels a monthly range that overflows the budget at a coarser cadence', () => {
    // 24 months against a 15-label budget: quarterly labels rather than the two
    // year boundaries the old LABEL_UNIT map produced.
    const ticks = generateTicks(d('2023-01-01T00:00:00Z'), d('2024-12-01T00:00:00Z'), 'month', 15);
    expect(labelsOf(ticks)).toEqual([
      'Jan 2023',
      'Apr 2023',
      'Jul 2023',
      'Oct 2023',
      'Jan 2024',
      'Apr 2024',
      'Jul 2024',
      'Oct 2024',
    ]);
  });

  it('labels every month in a short monthly range', () => {
    const ticks = generateTicks(d('2023-12-01T00:00:00Z'), d('2024-02-01T00:00:00Z'), 'month');
    expect(ticks).toHaveLength(3);
    expect(ticks.every((tick) => tick.major)).toBe(true);
    expect(ticks.map((tick) => tick.label)).toEqual(['Dec 2023', 'Jan 2024', 'Feb 2024']);
  });

  it('counts aligned month boundaries for non-boundary range dates', () => {
    const ticks = generateTicks(d('2023-01-31T00:00:00Z'), d('2024-01-31T00:00:00Z'), 'month');
    expect(ticks).toHaveLength(12);
    expect(ticks.every((tick) => tick.major)).toBe(true);
    expect(ticks.at(0)?.label).toBe('Feb 2023');
    expect(ticks.at(-1)?.label).toBe('Jan 2024');
  });

  it('keeps short-range labels within the tick budget', () => {
    const ticks = generateTicks(d('2023-12-01T00:00:00Z'), d('2024-02-01T00:00:00Z'), 'month', 2);
    expect(labelsOf(ticks)).toEqual(['Jan 2024']);
    expect(ticks.length).toBeLessThanOrEqual(3);
  });

  it('carries the day into an hourly axis at each midnight', () => {
    const ticks = generateTicks(d('2026-01-01T00:00:00Z'), d('2026-01-02T12:00:00Z'), 'hour', 15);
    const labels = labelsOf(ticks);
    expect(labels.at(0)).toBe('Jan 01 00:00');
    expect(labels).toContain('Jan 02 00:00');
    expect(labels).toContain('12:00');
  });

  it('emits one tick per year for year granularity with no minors', () => {
    const ticks = generateTicks(d('2020-01-01T00:00:00Z'), d('2023-01-01T00:00:00Z'), 'year');
    expect(ticks.every((t) => t.major)).toBe(true);
    expect(ticks.map((t) => t.label)).toEqual(['2020', '2021', '2022', '2023']);
  });

  it('never steps finer than the active granularity', () => {
    // A three-month monthly range has nothing to say at day boundaries.
    const ticks = generateTicks(d('2024-01-01T00:00:00Z'), d('2024-03-01T00:00:00Z'), 'month', 40);
    expect(ticks.every((tick) => tick.date.getUTCDate() === 1)).toBe(true);
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

  it('scales a two-century range down to a round year cadence', () => {
    const ticks = generateTicks(d('1900-01-01T00:00:00Z'), d('2100-01-01T00:00:00Z'), 'year', 15);
    expect(labelsOf(ticks)).toEqual([
      '1900',
      '1925',
      '1950',
      '1975',
      '2000',
      '2025',
      '2050',
      '2075',
      '2100',
    ]);
  });

  it('uses calendar years for a decade-wide daily axis', () => {
    const ticks = generateTicks(d('2015-06-01T00:00:00Z'), d('2024-06-01T00:00:00Z'), 'day', 12);
    const majors = ticks.filter((tick) => tick.major);
    expect(
      majors.every((tick) => tick.date.getUTCMonth() === 0 && tick.date.getUTCDate() === 1)
    ).toBe(true);
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

  it('does not approximate calendar years with fixed day multiples', () => {
    // Yearly ticks across a leap year must stay on Jan 1 rather than drifting a
    // day, which a fixed 365-day interval would do.
    const ticks = generateTicks(d('2018-01-01T00:00:00Z'), d('2026-01-01T00:00:00Z'), 'day', 10);
    expect(
      ticks
        .filter((tick) => tick.major)
        .every((tick) => tick.date.getUTCMonth() === 0 && tick.date.getUTCDate() === 1)
    ).toBe(true);
  });

  it('omits minor ticks when none fit the budget', () => {
    const ticks = generateTicks(d('2015-06-01T00:00:00Z'), d('2024-06-01T00:00:00Z'), 'day', 2);
    expect(ticks.every((tick) => tick.major)).toBe(true);
    expect(ticks.length).toBeLessThanOrEqual(2);
  });

  it('places every tick at the origin for a zero-length range', () => {
    const instant = d('2024-01-01T00:00:00Z');
    const ticks = generateTicks(instant, instant, 'day', 15);
    expect(ticks.every((tick) => tick.fraction === 0)).toBe(true);
  });

  it('emits nothing for an inverted range', () => {
    expect(generateTicks(d('2024-02-01T00:00:00Z'), d('2024-01-01T00:00:00Z'), 'day', 15)).toEqual(
      []
    );
  });

  it('subdivides the major interval with minor ticks', () => {
    const ticks = generateTicks(d('2023-01-01T00:00:00Z'), d('2024-12-01T00:00:00Z'), 'month', 15);
    // Quarterly majors, monthly minors: every month boundary is present.
    expect(ticks).toHaveLength(24);
    expect(ticks.filter((tick) => !tick.major)).toHaveLength(16);
  });
});
