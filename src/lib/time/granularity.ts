import type { Granularity } from '../core/types';

/**
 * Ordered list of supported granularities, coarsest-last.
 */
export const GRANULARITIES: Granularity[] = ['hour', 'day', 'month', 'year'];

/**
 * Single-character label for a granularity, used by the zoom pills.
 *
 * @param granularity - The granularity
 * @returns A one-letter code (H, D, M, Y)
 */
export function granularityCode(granularity: Granularity): string {
  switch (granularity) {
    case 'hour':
      return 'H';
    case 'day':
      return 'D';
    case 'month':
      return 'M';
    case 'year':
      return 'Y';
  }
}

/**
 * Coerces a Date or date-like string into a Date.
 *
 * @param value - A Date or an ISO/date string
 * @returns A Date instance
 */
export function toDate(value: Date | string): Date {
  return value instanceof Date ? new Date(value.getTime()) : new Date(value);
}

/**
 * Returns a new date advanced by a whole number of granularity units.
 *
 * All arithmetic is performed in UTC so results are independent of the host
 * timezone (important for deterministic tests and shared permalinks).
 *
 * @param date - The starting date
 * @param granularity - The unit to advance by
 * @param amount - Number of units (may be negative)
 * @returns A new Date advanced by `amount` units
 */
export function addUnits(date: Date, granularity: Granularity, amount: number): Date {
  const d = new Date(date.getTime());
  switch (granularity) {
    case 'hour':
      d.setUTCHours(d.getUTCHours() + amount);
      break;
    case 'day':
      d.setUTCDate(d.getUTCDate() + amount);
      break;
    case 'month':
      d.setUTCMonth(d.getUTCMonth() + amount);
      break;
    case 'year':
      d.setUTCFullYear(d.getUTCFullYear() + amount);
      break;
  }
  return d;
}

/**
 * Floors a date to the start of its granularity unit in UTC.
 *
 * For example, flooring to `'month'` yields the first day of that month at
 * 00:00:00 UTC.
 *
 * @param date - The date to floor
 * @param granularity - The unit to floor to
 * @returns A new Date at the start of the unit
 */
export function floorToGranularity(date: Date, granularity: Granularity): Date {
  const d = new Date(date.getTime());
  // Always zero out sub-hour precision, then progressively floor coarser fields.
  d.setUTCMinutes(0, 0, 0);
  if (granularity === 'hour') return d;
  d.setUTCHours(0);
  if (granularity === 'day') return d;
  d.setUTCDate(1);
  if (granularity === 'month') return d;
  d.setUTCMonth(0);
  return d;
}
