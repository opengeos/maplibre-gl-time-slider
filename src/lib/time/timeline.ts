import type { Granularity } from '../core/types';
import { addUnits } from './granularity';
import { clamp } from '../utils/helpers';

/**
 * Number of days in the UTC month of the given date.
 *
 * @param date - Any date within the month
 * @returns Days in that month
 */
function daysInUtcMonth(date: Date): number {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

/**
 * Approximate (possibly fractional) number of granularity units between two
 * dates. Used only to estimate the nearest step before snapping, so a fraction
 * derived from calendar position is accurate enough.
 *
 * @param from - Start date
 * @param to - End date
 * @param granularity - The unit to measure in
 * @returns Fractional unit count from `from` to `to`
 */
export function unitsBetween(from: Date, to: Date, granularity: Granularity): number {
  const ms = to.getTime() - from.getTime();
  switch (granularity) {
    case 'hour':
      return ms / 3_600_000;
    case 'day':
      return ms / 86_400_000;
    case 'month': {
      const months =
        (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
        (to.getUTCMonth() - from.getUTCMonth());
      const dayFraction = (to.getUTCDate() - 1) / daysInUtcMonth(to);
      return months + dayFraction;
    }
    case 'year': {
      return to.getUTCFullYear() - from.getUTCFullYear() + to.getUTCMonth() / 12;
    }
  }
}

/**
 * Generates the ordered list of discrete step dates spanning a range.
 *
 * Stepping begins at `start` (respecting the caller's exact start) and advances
 * by `interval` granularity units until it passes `end` (inclusive).
 *
 * @param start - Inclusive range start
 * @param end - Inclusive range end
 * @param interval - Units between steps (coerced to >= 1)
 * @param granularity - The step unit
 * @returns Array of step dates from start to end
 */
export function generateSteps(
  start: Date,
  end: Date,
  interval: number,
  granularity: Granularity
): Date[] {
  const step = Math.max(1, Math.floor(interval));
  const endMs = end.getTime();
  const steps: Date[] = [];
  let current = new Date(start.getTime());
  // Guard against pathological inputs producing an unbounded loop.
  const limit = 100_000;
  while (current.getTime() <= endMs && steps.length < limit) {
    steps.push(new Date(current.getTime()));
    current = addUnits(current, granularity, step);
  }
  return steps;
}

/**
 * Index of the last reachable step (a multiple of `interval`) within the range.
 *
 * @param start - Inclusive range start
 * @param end - Inclusive range end
 * @param interval - Units between steps
 * @param granularity - The step unit
 * @returns The maximum step multiple (k) that stays within the range
 */
function maxStepMultiple(
  start: Date,
  end: Date,
  interval: number,
  granularity: Granularity
): number {
  const step = Math.max(1, Math.floor(interval));
  const total = unitsBetween(start, end, granularity);
  return Math.max(0, Math.floor(total / step) * step);
}

/**
 * Snaps an arbitrary date to the nearest discrete step within the range.
 *
 * @param date - The date to snap
 * @param start - Inclusive range start
 * @param end - Inclusive range end
 * @param interval - Units between steps
 * @param granularity - The step unit
 * @returns The nearest step date, clamped to the range
 */
export function snapToStep(
  date: Date,
  start: Date,
  end: Date,
  interval: number,
  granularity: Granularity
): Date {
  const step = Math.max(1, Math.floor(interval));
  const clamped = new Date(clamp(date.getTime(), start.getTime(), end.getTime()));
  const units = unitsBetween(start, clamped, granularity);
  let k = Math.round(units / step) * step;
  k = clamp(k, 0, maxStepMultiple(start, end, interval, granularity));
  return addUnits(start, granularity, k);
}

/**
 * Returns the step immediately after `date` (one interval later), clamped so it
 * never exceeds the range.
 *
 * @returns The next step, or the same snapped date if already at the end
 */
export function nextStep(
  date: Date,
  start: Date,
  end: Date,
  interval: number,
  granularity: Granularity
): Date {
  const step = Math.max(1, Math.floor(interval));
  const current = snapToStep(date, start, end, interval, granularity);
  const candidate = addUnits(current, granularity, step);
  return candidate.getTime() > end.getTime() ? current : candidate;
}

/**
 * Returns the step immediately before `date` (one interval earlier), clamped so
 * it never precedes the range.
 *
 * @returns The previous step, or the same snapped date if already at the start
 */
export function prevStep(
  date: Date,
  start: Date,
  end: Date,
  interval: number,
  granularity: Granularity
): Date {
  const step = Math.max(1, Math.floor(interval));
  const current = snapToStep(date, start, end, interval, granularity);
  const candidate = addUnits(current, granularity, -step);
  return candidate.getTime() < start.getTime() ? current : candidate;
}

/**
 * Maps a date to its fractional position within the range [0, 1].
 *
 * @param date - The date to position
 * @param start - Inclusive range start
 * @param end - Inclusive range end
 * @returns A fraction in [0, 1]
 */
export function dateToFraction(date: Date, start: Date, end: Date): number {
  const span = end.getTime() - start.getTime();
  if (span <= 0) return 0;
  return clamp((date.getTime() - start.getTime()) / span, 0, 1);
}

/**
 * Maps a fractional position [0, 1] back to a date within the range.
 *
 * @param fraction - A fraction in [0, 1]
 * @param start - Inclusive range start
 * @param end - Inclusive range end
 * @returns The corresponding date
 */
export function fractionToDate(fraction: number, start: Date, end: Date): Date {
  const span = end.getTime() - start.getTime();
  return new Date(start.getTime() + clamp(fraction, 0, 1) * span);
}
