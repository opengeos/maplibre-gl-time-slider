import { describe, it, expect } from 'vitest';
import {
  generateSteps,
  snapToStep,
  nextStep,
  prevStep,
  dateToFraction,
  fractionToDate,
  unitsBetween,
} from './timeline';

const d = (iso: string) => new Date(iso);

describe('generateSteps', () => {
  it('includes start and end with interval 1 (day)', () => {
    const steps = generateSteps(d('2024-04-18T00:00:00Z'), d('2024-04-21T00:00:00Z'), 1, 'day');
    expect(steps.map((s) => s.toISOString())).toEqual([
      '2024-04-18T00:00:00.000Z',
      '2024-04-19T00:00:00.000Z',
      '2024-04-20T00:00:00.000Z',
      '2024-04-21T00:00:00.000Z',
    ]);
  });

  it('honors interval > 1', () => {
    const steps = generateSteps(d('2024-01-01T00:00:00Z'), d('2024-01-10T00:00:00Z'), 3, 'day');
    expect(steps.map((s) => s.toISOString())).toEqual([
      '2024-01-01T00:00:00.000Z',
      '2024-01-04T00:00:00.000Z',
      '2024-01-07T00:00:00.000Z',
      '2024-01-10T00:00:00.000Z',
    ]);
  });

  it('steps by month and year across boundaries', () => {
    const months = generateSteps(d('2024-11-01T00:00:00Z'), d('2025-02-01T00:00:00Z'), 1, 'month');
    expect(months).toHaveLength(4);
    expect(months[3].toISOString()).toBe('2025-02-01T00:00:00.000Z');

    const years = generateSteps(d('2020-01-01T00:00:00Z'), d('2023-01-01T00:00:00Z'), 1, 'year');
    expect(years).toHaveLength(4);
  });

  it('returns a single step when start equals end', () => {
    const steps = generateSteps(d('2024-01-01T00:00:00Z'), d('2024-01-01T00:00:00Z'), 1, 'day');
    expect(steps).toHaveLength(1);
  });
});

describe('snapToStep', () => {
  const start = d('2024-04-18T00:00:00Z');
  const end = d('2024-04-28T00:00:00Z');

  it('snaps to the nearest day step', () => {
    expect(snapToStep(d('2024-04-20T10:00:00Z'), start, end, 1, 'day').toISOString()).toBe(
      '2024-04-20T00:00:00.000Z'
    );
    expect(snapToStep(d('2024-04-20T18:00:00Z'), start, end, 1, 'day').toISOString()).toBe(
      '2024-04-21T00:00:00.000Z'
    );
  });

  it('snaps to multiples of the interval', () => {
    expect(snapToStep(d('2024-04-23T00:00:00Z'), start, end, 2, 'day').toISOString()).toBe(
      '2024-04-24T00:00:00.000Z'
    );
  });

  it('clamps outside the range', () => {
    expect(snapToStep(d('2024-01-01T00:00:00Z'), start, end, 1, 'day').toISOString()).toBe(
      '2024-04-18T00:00:00.000Z'
    );
    expect(snapToStep(d('2025-01-01T00:00:00Z'), start, end, 1, 'day').toISOString()).toBe(
      '2024-04-28T00:00:00.000Z'
    );
  });

  it('never returns a date past the end for non-boundary month starts', () => {
    const mStart = d('2024-01-31T00:00:00Z');
    const mEnd = d('2024-02-01T00:00:00Z');
    const snapped = snapToStep(d('2024-02-01T00:00:00Z'), mStart, mEnd, 1, 'month');
    expect(snapped.getTime()).toBeGreaterThanOrEqual(mStart.getTime());
    expect(snapped.getTime()).toBeLessThanOrEqual(mEnd.getTime());
  });
});

describe('nextStep / prevStep', () => {
  const start = d('2024-04-18T00:00:00Z');
  const end = d('2024-04-21T00:00:00Z');

  it('advances and rewinds by one interval', () => {
    expect(nextStep(d('2024-04-18T00:00:00Z'), start, end, 1, 'day').toISOString()).toBe(
      '2024-04-19T00:00:00.000Z'
    );
    expect(prevStep(d('2024-04-19T00:00:00Z'), start, end, 1, 'day').toISOString()).toBe(
      '2024-04-18T00:00:00.000Z'
    );
  });

  it('does not move past the range bounds', () => {
    expect(nextStep(end, start, end, 1, 'day').toISOString()).toBe('2024-04-21T00:00:00.000Z');
    expect(prevStep(start, start, end, 1, 'day').toISOString()).toBe('2024-04-18T00:00:00.000Z');
  });
});

describe('dateToFraction / fractionToDate', () => {
  const start = d('2024-01-01T00:00:00Z');
  const end = d('2024-01-11T00:00:00Z');

  it('maps midpoint to 0.5 and back', () => {
    const mid = d('2024-01-06T00:00:00Z');
    expect(dateToFraction(mid, start, end)).toBeCloseTo(0.5, 10);
    expect(fractionToDate(0.5, start, end).toISOString()).toBe('2024-01-06T00:00:00.000Z');
  });

  it('clamps fractions to [0, 1]', () => {
    expect(dateToFraction(d('2023-01-01T00:00:00Z'), start, end)).toBe(0);
    expect(dateToFraction(d('2025-01-01T00:00:00Z'), start, end)).toBe(1);
    expect(fractionToDate(-1, start, end).getTime()).toBe(start.getTime());
    expect(fractionToDate(2, start, end).getTime()).toBe(end.getTime());
  });

  it('returns 0 for a zero-length span', () => {
    expect(dateToFraction(start, start, start)).toBe(0);
  });
});

describe('unitsBetween', () => {
  it('measures days and hours exactly', () => {
    expect(unitsBetween(d('2024-01-01T00:00:00Z'), d('2024-01-04T00:00:00Z'), 'day')).toBe(3);
    expect(unitsBetween(d('2024-01-01T00:00:00Z'), d('2024-01-01T06:00:00Z'), 'hour')).toBe(6);
  });

  it('measures whole months and years', () => {
    expect(unitsBetween(d('2024-01-01T00:00:00Z'), d('2024-04-01T00:00:00Z'), 'month')).toBe(3);
    expect(unitsBetween(d('2020-01-01T00:00:00Z'), d('2023-01-01T00:00:00Z'), 'year')).toBe(3);
  });
});
