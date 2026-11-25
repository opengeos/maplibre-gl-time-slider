import { describe, it, expect } from 'vitest';
import { histogramBars } from './histogram';
import type { TimeScaleParams } from './scale';

const t = (iso: string) => new Date(iso).getTime();

/** A daily timeline over 18–22 April 2024: five steps at 0, ¼, ½, ¾ and 1. */
const DAILY: TimeScaleParams = {
  startDate: new Date('2024-04-18T00:00:00Z'),
  endDate: new Date('2024-04-22T00:00:00Z'),
  interval: 1,
  granularity: 'day',
};

describe('histogramBars', () => {
  it('counts each day under a bar centered on its step', () => {
    const bars = histogramBars(
      [
        t('2024-04-18T01:00:00Z'),
        t('2024-04-18T23:59:00Z'),
        t('2024-04-20T15:00:00Z'),
        t('2024-04-22T00:00:00Z'),
      ],
      DAILY,
      100
    );
    expect(bars.map((b) => b.count)).toEqual([2, 0, 1, 0, 1]);
    // Each bar reaches halfway to its neighbors; the outer two stop at the ends.
    expect(bars.map((b) => [b.start, b.end])).toEqual([
      [0, 0.125],
      [0.125, 0.375],
      [0.375, 0.625],
      [0.625, 0.875],
      [0.875, 1],
    ]);
  });

  it('counts the whole of the last step, and nothing outside the timeline', () => {
    const bars = histogramBars(
      [
        t('2024-04-17T23:59:00Z'), // before the first step
        t('2024-04-22T23:59:00Z'), // late on the last day: still the last step
        t('2024-04-23T00:00:00Z'), // the day after the last step
        Number.NaN,
      ],
      DAILY,
      100
    );
    expect(bars.map((b) => b.count)).toEqual([0, 0, 0, 0, 1]);
  });

  it('groups by the step interval', () => {
    const bars = histogramBars(
      [t('2024-04-18T12:00:00Z'), t('2024-04-19T12:00:00Z'), t('2024-04-21T12:00:00Z')],
      { ...DAILY, interval: 2 },
      100
    );
    // Steps on the 18th, 20th and 22nd, each covering two days.
    expect(bars.map((b) => b.count)).toEqual([2, 1, 0]);
  });

  it('counts calendar months, however long each is', () => {
    const bars = histogramBars(
      [t('2024-02-29T12:00:00Z'), t('2024-03-01T00:00:00Z'), t('2024-12-31T12:00:00Z')],
      {
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-12-01T00:00:00Z'),
        interval: 1,
        granularity: 'month',
      },
      100
    );
    expect(bars).toHaveLength(12);
    expect(bars[1].count).toBe(1);
    expect(bars[2].count).toBe(1);
    expect(bars[11].count).toBe(1);
  });

  it('falls back to equal slices when the steps outnumber the bars', () => {
    const bars = histogramBars(
      [t('2020-01-05T00:00:00Z'), t('2020-02-01T00:00:00Z'), t('2020-12-31T12:00:00Z')],
      {
        startDate: new Date('2020-01-01T00:00:00Z'),
        endDate: new Date('2020-12-31T00:00:00Z'),
        interval: 1,
        granularity: 'day',
      },
      4
    );
    expect(bars.map((b) => [b.start, b.end, b.count])).toEqual([
      [0, 0.25, 2],
      [0.25, 0.5, 0],
      [0.5, 0.75, 0],
      // The last day runs past the axis end, so it lands in the last slice.
      [0.75, 1, 1],
    ]);
  });

  it('gives each listed date of an ordinal timeline its own bar', () => {
    const bars = histogramBars(
      [
        t('2023-01-27T00:00:00Z'), // before the first date
        t('2023-01-28T09:00:00Z'),
        t('2023-02-21T00:00:00Z'), // between dates: counts toward the earlier one
        t('2023-03-27T18:00:00Z'),
        t('2023-03-28T00:00:00Z'), // after the last date's day
      ],
      {
        ...DAILY,
        dates: ['2023-01-28', '2023-02-20', '2023-03-27'].map((d) => new Date(`${d}T00:00:00Z`)),
      },
      // Ignored on an ordinal timeline: the list sets the bars.
      1
    );
    expect(bars.map((b) => [b.start, b.end, b.count])).toEqual([
      [0, 0.25, 1],
      [0.25, 0.75, 1],
      [0.75, 1, 1],
    ]);
  });

  it('spans the whole axis with one bar when the timeline is a single step', () => {
    const day = new Date('2024-04-18T00:00:00Z');
    const bars = histogramBars(
      [t('2024-04-18T06:00:00Z')],
      { ...DAILY, startDate: day, endDate: day },
      100
    );
    expect(bars).toEqual([{ start: 0, end: 1, count: 1 }]);
  });
});
