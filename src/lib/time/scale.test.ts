import { describe, it, expect } from 'vitest';
import { clipDates, nearestDateIndex, normalizeDates } from './dateList';
import { createTimeScale } from './scale';

const d = (iso: string) => new Date(iso);
const iso = (date: Date) => date.toISOString().slice(0, 10);

// The real-world case this exists for: EMIT chlorophyll-a scenes over
// Apalachicola Bay — 6 dates scattered across nearly three years, where a daily
// timeline would draw ~1,000 ticks for 6 frames.
const SPARSE = ['2023-01-28', '2023-02-20', '2023-03-27', '2024-04-01', '2025-02-01', '2025-10-03'];

/** An ordinal scale over the sparse EMIT-style dates. */
const ordinal = (dates: string[] = SPARSE, interval = 1) =>
  createTimeScale({
    dates: normalizeDates(dates),
    startDate: d(`${dates[0]}T00:00:00Z`),
    endDate: d(`${dates[dates.length - 1]}T00:00:00Z`),
    interval,
    granularity: 'day',
  });

describe('normalizeDates', () => {
  it('parses, sorts, and de-duplicates mixed input', () => {
    const dates = normalizeDates([
      '2024-03-01',
      d('2024-01-01T00:00:00Z'),
      Date.UTC(2024, 1, 1),
      '2024-01-01',
    ]);
    expect(dates.map(iso)).toEqual(['2024-01-01', '2024-02-01', '2024-03-01']);
  });

  it('drops unparseable entries instead of yielding Invalid Dates', () => {
    const dates = normalizeDates(['2024-01-01', 'not a date', '2024-01-02']);
    expect(dates.map(iso)).toEqual(['2024-01-01', '2024-01-02']);
  });

  it('returns an empty list for empty input', () => {
    expect(normalizeDates([])).toEqual([]);
  });
});

describe('clipDates', () => {
  const dates = normalizeDates(SPARSE);

  it('keeps only the dates inside the bounds', () => {
    const clipped = clipDates(dates, d('2023-03-01T00:00:00Z'), d('2025-01-01T00:00:00Z'));
    expect(clipped.map(iso)).toEqual(['2023-03-27', '2024-04-01']);
  });

  it('treats an omitted bound as open', () => {
    expect(clipDates(dates, undefined, d('2023-03-01T00:00:00Z')).map(iso)).toEqual([
      '2023-01-28',
      '2023-02-20',
    ]);
    expect(clipDates(dates, d('2025-01-01T00:00:00Z')).map(iso)).toEqual([
      '2025-02-01',
      '2025-10-03',
    ]);
  });

  it('ignores a clip that would empty the list', () => {
    const clipped = clipDates(dates, d('2030-01-01T00:00:00Z'), d('2031-01-01T00:00:00Z'));
    expect(clipped).toEqual(dates);
  });
});

describe('nearestDateIndex', () => {
  const dates = normalizeDates(SPARSE);

  it('finds exact matches', () => {
    expect(nearestDateIndex(dates, d('2024-04-01T00:00:00Z').getTime())).toBe(3);
  });

  it('rounds to the closer neighbor', () => {
    // Much nearer 2023-02-20 than 2023-03-27.
    expect(nearestDateIndex(dates, d('2023-02-25T00:00:00Z').getTime())).toBe(1);
    expect(nearestDateIndex(dates, d('2023-03-20T00:00:00Z').getTime())).toBe(2);
  });

  it('clamps outside the list', () => {
    expect(nearestDateIndex(dates, d('2000-01-01T00:00:00Z').getTime())).toBe(0);
    expect(nearestDateIndex(dates, d('2099-01-01T00:00:00Z').getTime())).toBe(dates.length - 1);
  });
});

describe('ordinal scale', () => {
  it('snaps any date onto a listed date', () => {
    const scale = ordinal();
    // A date with no data lands on the nearest one that has data.
    expect(iso(scale.snap(d('2023-07-15T00:00:00Z')))).toBe('2023-03-27');
    expect(iso(scale.snap(d('2024-04-01T00:00:00Z')))).toBe('2024-04-01');
  });

  it('steps between consecutive dates regardless of the real gap', () => {
    const scale = ordinal();
    expect(iso(scale.next(d('2023-03-27T00:00:00Z')))).toBe('2024-04-01');
    expect(iso(scale.prev(d('2024-04-01T00:00:00Z')))).toBe('2023-03-27');
  });

  it('holds at the bounds rather than running off the list', () => {
    const scale = ordinal();
    expect(iso(scale.next(d('2025-10-03T00:00:00Z')))).toBe('2025-10-03');
    expect(iso(scale.prev(d('2023-01-28T00:00:00Z')))).toBe('2023-01-28');
  });

  it('steps `interval` entries at a time', () => {
    const scale = ordinal(SPARSE, 2);
    expect(iso(scale.next(d('2023-01-28T00:00:00Z')))).toBe('2023-03-27');
    expect(iso(scale.prev(d('2023-03-27T00:00:00Z')))).toBe('2023-01-28');
  });

  it('spaces dates evenly instead of by elapsed time', () => {
    const scale = ordinal();
    // Index 1 of 6 sits at 1/5 even though only 23 days of a 2.7-year span
    // have elapsed (a time-proportional axis would put it near 0.02).
    expect(scale.toFraction(d('2023-02-20T00:00:00Z'))).toBeCloseTo(0.2);
    expect(scale.toFraction(d('2023-01-28T00:00:00Z'))).toBe(0);
    expect(scale.toFraction(d('2025-10-03T00:00:00Z'))).toBe(1);
  });

  it('maps an axis position back to a listed date', () => {
    const scale = ordinal();
    expect(iso(scale.fromFraction(0))).toBe('2023-01-28');
    expect(iso(scale.fromFraction(0.5))).toBe('2024-04-01');
    expect(iso(scale.fromFraction(1))).toBe('2025-10-03');
    // Clicking anywhere on the track still yields a date that has data.
    for (let f = 0; f <= 1; f += 0.05) {
      expect(SPARSE).toContain(iso(scale.fromFraction(f)));
    }
  });

  it('emits exactly one tick per date, evenly spaced', () => {
    const ticks = ordinal().ticks();
    expect(ticks.map((t) => iso(t.date))).toEqual(SPARSE);
    expect(ticks.map((t) => t.fraction)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });

  it('spells out the year only when it changes', () => {
    const ticks = ordinal().ticks();
    expect(ticks.map((t) => t.label)).toEqual([
      '2023 Jan 28',
      'Feb 20',
      'Mar 27',
      '2024 Apr 01',
      '2025 Feb 01',
      'Oct 03',
    ]);
    // Year-opening ticks are the major (taller) ones.
    expect(ticks.map((t) => t.major)).toEqual([true, false, false, true, true, false]);
  });

  it('thins very long lists', () => {
    const many = Array.from({ length: 5000 }, (_, i) =>
      new Date(Date.UTC(2000, 0, 1) + i * 86_400_000).toISOString()
    );
    expect(ordinal(many).ticks(400).length).toBeLessThanOrEqual(400);
  });

  it('handles a single-date list without dividing by zero', () => {
    const scale = ordinal(['2024-06-01']);
    expect(scale.toFraction(d('2024-06-01T00:00:00Z'))).toBe(0);
    expect(iso(scale.fromFraction(0.7))).toBe('2024-06-01');
    expect(iso(scale.next(d('2024-06-01T00:00:00Z')))).toBe('2024-06-01');
    expect(scale.ticks()).toHaveLength(1);
  });
});

describe('createTimeScale', () => {
  it('is continuous without a date list', () => {
    const scale = createTimeScale({
      startDate: d('2024-04-18T00:00:00Z'),
      endDate: d('2024-04-28T00:00:00Z'),
      interval: 1,
      granularity: 'day',
    });
    expect(scale.ordinal).toBe(false);
    expect(iso(scale.next(d('2024-04-18T00:00:00Z')))).toBe('2024-04-19');
    // Positions follow real elapsed time.
    expect(scale.toFraction(d('2024-04-23T00:00:00Z'))).toBeCloseTo(0.5);
  });

  it('falls back to continuous for an empty date list', () => {
    const scale = createTimeScale({
      dates: [],
      startDate: d('2024-04-18T00:00:00Z'),
      endDate: d('2024-04-28T00:00:00Z'),
      interval: 1,
      granularity: 'day',
    });
    expect(scale.ordinal).toBe(false);
  });
});
