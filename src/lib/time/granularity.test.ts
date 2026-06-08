import { describe, it, expect } from 'vitest';
import { addUnits, floorToGranularity, granularityCode, toDate } from './granularity';

const d = (iso: string) => new Date(iso);

describe('addUnits', () => {
  it('advances hours, days, months, years in UTC', () => {
    expect(addUnits(d('2024-01-01T00:00:00Z'), 'hour', 5).toISOString()).toBe(
      '2024-01-01T05:00:00.000Z'
    );
    expect(addUnits(d('2024-01-31T00:00:00Z'), 'day', 1).toISOString()).toBe(
      '2024-02-01T00:00:00.000Z'
    );
    expect(addUnits(d('2024-01-15T00:00:00Z'), 'month', 2).toISOString()).toBe(
      '2024-03-15T00:00:00.000Z'
    );
    expect(addUnits(d('2024-06-01T00:00:00Z'), 'year', 1).toISOString()).toBe(
      '2025-06-01T00:00:00.000Z'
    );
  });

  it('handles negative amounts and leap years', () => {
    expect(addUnits(d('2024-03-01T00:00:00Z'), 'day', -1).toISOString()).toBe(
      '2024-02-29T00:00:00.000Z'
    );
  });

  it('does not mutate its input', () => {
    const base = d('2024-01-01T00:00:00Z');
    addUnits(base, 'day', 10);
    expect(base.toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });
});

describe('floorToGranularity', () => {
  it('floors to the start of the unit in UTC', () => {
    const date = d('2024-04-18T13:45:30Z');
    expect(floorToGranularity(date, 'hour').toISOString()).toBe('2024-04-18T13:00:00.000Z');
    expect(floorToGranularity(date, 'day').toISOString()).toBe('2024-04-18T00:00:00.000Z');
    expect(floorToGranularity(date, 'month').toISOString()).toBe('2024-04-01T00:00:00.000Z');
    expect(floorToGranularity(date, 'year').toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });
});

describe('granularityCode', () => {
  it('maps each granularity to a single letter', () => {
    expect(granularityCode('hour')).toBe('H');
    expect(granularityCode('day')).toBe('D');
    expect(granularityCode('month')).toBe('M');
    expect(granularityCode('year')).toBe('Y');
  });
});

describe('toDate', () => {
  it('accepts strings and clones Date instances', () => {
    const orig = d('2024-01-01T00:00:00Z');
    const cloned = toDate(orig);
    expect(cloned).not.toBe(orig);
    expect(cloned.getTime()).toBe(orig.getTime());
    expect(toDate('2024-01-01T00:00:00Z').getTime()).toBe(orig.getTime());
  });
});
