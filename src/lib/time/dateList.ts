import type { Granularity } from '../core/types';
import { formatDate } from '../template/dateFormat';
import { niceMultiple, type Tick } from './ticks';

/**
 * Token formats for an ordinal tick label. The `long` form is used whenever a
 * tick starts a new year, so a multi-year list stays unambiguous without
 * repeating the year on every label.
 */
const ORDINAL_LABEL: Record<Granularity, { short: string; long: string }> = {
  hour: { short: 'MMM DD HH:00', long: 'YYYY MMM DD HH:00' },
  day: { short: 'MMM DD', long: 'YYYY MMM DD' },
  month: { short: 'MMM', long: 'YYYY MMM' },
  year: { short: 'YYYY', long: 'YYYY' },
};

/**
 * Coerces an arbitrary list of date-likes into the ordered, de-duplicated Date
 * list an ordinal timeline steps through. Unparseable entries are dropped
 * rather than poisoning the timeline with an Invalid Date.
 *
 * @param input - Dates as Date objects, parseable strings, or epoch milliseconds
 * @returns Ascending, duplicate-free dates
 */
export function normalizeDates(input: Iterable<Date | string | number>): Date[] {
  const times = new Set<number>();
  for (const value of input) {
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (!Number.isNaN(time)) times.add(time);
  }
  return [...times].sort((a, b) => a - b).map((time) => new Date(time));
}

/**
 * Keeps only the dates inside an inclusive range. A range that would leave
 * nothing behind is ignored (the full list is returned), so a mistyped bound
 * cannot strand the control on an empty timeline.
 *
 * @param dates - Ascending dates to filter
 * @param start - Inclusive lower bound, or undefined for open
 * @param end - Inclusive upper bound, or undefined for open
 * @returns The dates within the range, or `dates` if none qualify
 */
export function clipDates(dates: Date[], start?: Date, end?: Date): Date[] {
  const lo = start ? start.getTime() : -Infinity;
  const hi = end ? end.getTime() : Infinity;
  const clipped = dates.filter((d) => d.getTime() >= lo && d.getTime() <= hi);
  return clipped.length > 0 ? clipped : dates;
}

/**
 * Index of the entry closest to a timestamp, by binary search. Ties (a
 * timestamp exactly between two entries) resolve to the earlier one.
 *
 * @param dates - Ascending, non-empty dates
 * @param time - The timestamp to locate
 * @returns The index of the nearest entry
 */
export function nearestDateIndex(dates: Date[], time: number): number {
  let lo = 0;
  let hi = dates.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid].getTime() < time) lo = mid + 1;
    else hi = mid;
  }
  // `lo` is the first entry at or after `time`; its predecessor may be closer.
  if (lo > 0) {
    const after = dates[lo].getTime() - time;
    const before = time - dates[lo - 1].getTime();
    if (before <= after) return lo - 1;
  }
  return lo;
}

/**
 * Generates axis ticks for an ordinal (explicit date list) timeline.
 *
 * Every date gets a tick, evenly spaced, so a three-day gap and a three-month
 * gap occupy the same width. Ticks that open a new year are marked major and
 * carry the year in their label; the rest show only month/day. Very long lists
 * are thinned with a "nice" multiple so the tick count stays manageable.
 *
 * @param dates - Ascending, de-duplicated dates
 * @param granularity - Granularity driving the label format
 * @param maxTicks - Soft cap on tick count (default 400)
 * @returns Ticks in list order
 */
export function generateOrdinalTicks(
  dates: Date[],
  granularity: Granularity,
  maxTicks = 400
): Tick[] {
  if (dates.length === 0) return [];
  const format = ORDINAL_LABEL[granularity];
  const stride = niceMultiple(dates.length, maxTicks);
  const span = Math.max(1, dates.length - 1);
  const ticks: Tick[] = [];
  let lastYear: number | undefined;
  for (let i = 0; i < dates.length; i += stride) {
    const date = dates[i];
    const year = date.getUTCFullYear();
    // The first emitted tick always spells out its year; later ones only do so
    // when the year has rolled over since the previous label.
    const major = lastYear === undefined || year !== lastYear;
    lastYear = year;
    ticks.push({
      date,
      fraction: i / span,
      major,
      label: formatDate(date, major ? format.long : format.short),
    });
  }
  return ticks;
}
