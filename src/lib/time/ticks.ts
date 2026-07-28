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
export function niceMultiple(count: number, max: number, unit: Granularity = 'year'): number {
  if (count <= max) return 1;
  const candidates: Record<Granularity, number[]> = {
    hour: [1, 2, 3, 4, 6, 12, 24, 48, 72, 168, 336, 720],
    // Keep day multiples subannual. Calendar-year cadences belong to the
    // month/year major ticks; fixed 365-day steps drift across leap years.
    day: [1, 2, 3, 7, 14, 28, 30, 60, 90, 180],
    month: [1, 2, 3, 4, 6, 12, 24, 36, 60, 120, 240, 600],
    year: [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000],
  };
  for (const m of candidates[unit]) {
    if (count / m <= max) return m;
  }
  // A soft cap is preferable to inventing a fixed day interval that pretends
  // to be a calendar year and drifts across leap years.
  if (unit === 'day') return candidates.day[candidates.day.length - 1];
  return Math.ceil(count / max);
}

/**
 * Floors a date to a stable calendar boundary for a unit multiple.
 */
function floorToMultiple(date: Date, unit: Granularity, multiple: number): Date {
  const floored = floorToGranularity(date, unit);
  if (multiple <= 1) return floored;
  if (unit === 'year') {
    return new Date(Date.UTC(Math.floor(floored.getUTCFullYear() / multiple) * multiple, 0, 1));
  }
  if (unit === 'month') {
    const month = floored.getUTCFullYear() * 12 + floored.getUTCMonth();
    const aligned = Math.floor(month / multiple) * multiple;
    return new Date(Date.UTC(Math.floor(aligned / 12), aligned % 12, 1));
  }
  const unitMs = unit === 'day' ? 86_400_000 : 3_600_000;
  return new Date(Math.floor(floored.getTime() / (multiple * unitMs)) * multiple * unitMs);
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
    maxTicks,
    labelUnit
  );
  let major = floorToMultiple(start, labelUnit, majorMul);
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
    const minorCount = Math.max(1, Math.abs(unitsBetween(start, end, granularity)));
    const minorMul = niceMultiple(minorCount, maxTicks, granularity);
    // Minor ticks are optional. Suppress them when the largest honest
    // subannual day interval still exceeds the width-derived budget rather
    // than inventing a fixed 365-day cadence that drifts across leap years.
    const minorFits = granularity !== 'day' || minorCount / minorMul <= maxTicks;
    if (minorFits) {
      let minor = floorToMultiple(start, granularity, minorMul);
      if (minor.getTime() < start.getTime()) {
        minor = addUnits(minor, granularity, minorMul);
      }
      while (minor.getTime() <= end.getTime()) {
        push(minor, false);
        minor = addUnits(minor, granularity, minorMul);
      }
    }
  }

  ticks.sort((a, b) => a.date.getTime() - b.date.getTime());
  return ticks;
}
