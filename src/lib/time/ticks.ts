import type { Granularity } from '../core/types';
import { addUnits, floorToGranularity } from './granularity';
import { unitsBetween, dateToFraction } from './timeline';
import { formatDate } from '../template/dateFormat';

/**
 * A single tick on the timeline axis.
 */
export interface Tick {
  /**
   * The tick's date.
   */
  date: Date;

  /**
   * Position within the range, in [0, 1].
   */
  fraction: number;

  /**
   * Text label for major ticks; undefined for minor ticks.
   */
  label?: string;

  /**
   * Whether this is a labeled major tick.
   */
  major: boolean;
}

/**
 * The coarser unit used to place labeled major ticks for each granularity.
 */
const LABEL_UNIT: Record<Granularity, Granularity> = {
  hour: 'day',
  day: 'month',
  month: 'year',
  year: 'year',
};

/**
 * Picks a "nice" step multiple so that `count / multiple` stays at or below
 * `max`.
 *
 * @param count - Approximate number of candidate ticks
 * @param max - Maximum desired tick count
 * @returns A step multiple from a set of round numbers
 */
function niceMultiple(count: number, max: number): number {
  if (count <= max) return 1;
  const candidates = [1, 2, 3, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
  for (const m of candidates) {
    if (count / m <= max) return m;
  }
  return Math.ceil(count / max);
}

/**
 * Builds the label for a major tick based on the active granularity.
 *
 * @param date - The tick date
 * @param granularity - The active granularity
 * @returns A short label string
 */
function majorLabel(date: Date, granularity: Granularity): string {
  switch (granularity) {
    case 'hour':
      return formatDate(date, 'MMM DD');
    case 'day':
      // Show the year at the start of a year, otherwise the month abbreviation.
      return date.getUTCMonth() === 0 ? formatDate(date, 'YYYY') : formatDate(date, 'MMM');
    case 'month':
    case 'year':
      return formatDate(date, 'YYYY');
  }
}

/**
 * Generates axis ticks for a date range and granularity.
 *
 * Major (labeled) ticks fall on the boundaries of the next-coarser unit; minor
 * ticks fall on granularity boundaries. Both are thinned with "nice" multiples
 * so the total stays manageable regardless of range size.
 *
 * @param start - Inclusive range start
 * @param end - Inclusive range end
 * @param granularity - The active granularity
 * @param maxTicks - Soft cap on ticks of each kind (default 400)
 * @returns Ticks sorted by date, de-duplicated by timestamp
 */
export function generateTicks(
  start: Date,
  end: Date,
  granularity: Granularity,
  maxTicks = 400
): Tick[] {
  const labelUnit = LABEL_UNIT[granularity];
  const ticks: Tick[] = [];
  const seen = new Set<number>();

  const push = (date: Date, major: boolean): void => {
    const time = date.getTime();
    if (time < start.getTime() || time > end.getTime() || seen.has(time)) return;
    seen.add(time);
    ticks.push({
      date,
      fraction: dateToFraction(date, start, end),
      major,
      label: major ? majorLabel(date, granularity) : undefined,
    });
  };

  // Major ticks at coarse-unit boundaries.
  const majorMul = niceMultiple(
    Math.max(1, Math.abs(unitsBetween(start, end, labelUnit))),
    maxTicks
  );
  let major = floorToGranularity(start, labelUnit);
  if (major.getTime() < start.getTime()) {
    major = addUnits(major, labelUnit, majorMul);
  }
  while (major.getTime() <= end.getTime()) {
    push(major, true);
    major = addUnits(major, labelUnit, majorMul);
  }

  // Minor ticks at granularity boundaries (skipped when they coincide with the
  // major unit, e.g. year granularity).
  if (granularity !== labelUnit) {
    const minorMul = niceMultiple(
      Math.max(1, Math.abs(unitsBetween(start, end, granularity))),
      maxTicks
    );
    let minor = floorToGranularity(start, granularity);
    if (minor.getTime() < start.getTime()) {
      minor = addUnits(minor, granularity, minorMul);
    }
    while (minor.getTime() <= end.getTime()) {
      push(minor, false);
      minor = addUnits(minor, granularity, minorMul);
    }
  }

  ticks.sort((a, b) => a.date.getTime() - b.date.getTime());
  return ticks;
}
