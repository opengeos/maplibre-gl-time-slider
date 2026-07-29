import type { Granularity } from '../core/types';
import { GRANULARITIES, addUnits, floorToGranularity } from './granularity';
import { dateToFraction } from './timeline';
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
 * One rung of the tick ladder: a calendar unit repeated a round number of times.
 */
interface TickStep {
  unit: Granularity;
  multiple: number;
}

/**
 * The ladder of candidate tick intervals, finest-first. Every rung is a round
 * calendar cadence that reads naturally on an axis (3 hours, a week, a quarter,
 * a quarter-century), so any span from a few hours to a few millennia can be
 * covered by picking the rung nearest the desired spacing.
 *
 * Steps are expressed as calendar units rather than fixed millisecond
 * intervals, so months and years land on real boundaries and never drift across
 * leap years.
 */
const TICK_LADDER: TickStep[] = [
  { unit: 'hour', multiple: 1 },
  { unit: 'hour', multiple: 2 },
  { unit: 'hour', multiple: 3 },
  { unit: 'hour', multiple: 6 },
  { unit: 'hour', multiple: 12 },
  { unit: 'day', multiple: 1 },
  { unit: 'day', multiple: 2 },
  { unit: 'day', multiple: 7 },
  { unit: 'day', multiple: 14 },
  { unit: 'month', multiple: 1 },
  { unit: 'month', multiple: 3 },
  { unit: 'month', multiple: 6 },
  { unit: 'year', multiple: 1 },
  { unit: 'year', multiple: 2 },
  { unit: 'year', multiple: 5 },
  { unit: 'year', multiple: 10 },
  { unit: 'year', multiple: 25 },
  { unit: 'year', multiple: 50 },
  { unit: 'year', multiple: 100 },
  { unit: 'year', multiple: 250 },
  { unit: 'year', multiple: 500 },
  { unit: 'year', multiple: 1000 },
];

/**
 * Mean length of each unit, used only to compare rungs against a desired
 * spacing. Placement itself always walks real calendar boundaries.
 */
const MEAN_UNIT_MS: Record<Granularity, number> = {
  hour: 3_600_000,
  day: 86_400_000,
  // Mean Gregorian month and year (365.2425 days), so long spans pick a rung
  // that matches the true average density rather than a 365-day approximation.
  month: 2_629_746_000,
  year: 31_556_952_000,
};

/**
 * Approximate duration of a ladder rung in milliseconds.
 */
function stepMs(step: TickStep): number {
  return MEAN_UNIT_MS[step.unit] * step.multiple;
}

/**
 * Which rungs can divide one another exactly. Hours divide days and months
 * divide years, but no whole number of days makes up a calendar month, so the
 * two families never mix.
 */
function familyOf(unit: Granularity): 'time' | 'calendar' {
  return unit === 'hour' || unit === 'day' ? 'time' : 'calendar';
}

/**
 * A rung's size in its family's base unit: hours for the time family, months
 * for the calendar one. Exact, unlike the mean-length estimates used for
 * spacing, so divisibility between rungs can be tested with a modulo.
 */
function familySize(step: TickStep): number {
  switch (step.unit) {
    case 'hour':
      return step.multiple;
    case 'day':
      return step.multiple * 24;
    case 'month':
      return step.multiple;
    case 'year':
      return step.multiple * 12;
  }
}

/**
 * Number of ticks a rung would place across a span, approximated from mean unit
 * lengths. Used for budget checks only, never for placement.
 */
function approxCount(spanMs: number, step: TickStep): number {
  return Math.floor(Math.max(0, spanMs) / stepMs(step)) + 1;
}

/**
 * Picks the ladder rung that best fills a span with about `targetCount` ticks.
 *
 * The rung is never finer than the data's own granularity: an axis stepping in
 * whole months has nothing to say at day boundaries.
 *
 * @param spanMs - Range length in milliseconds
 * @param granularity - The active granularity, which floors the ladder
 * @param targetCount - Desired number of ticks, from the caller's pixel budget
 * @returns The chosen rung
 */
function selectStep(spanMs: number, granularity: Granularity, targetCount: number): TickStep {
  const floor = GRANULARITIES.indexOf(granularity);
  const candidates = TICK_LADDER.filter((step) => GRANULARITIES.indexOf(step.unit) >= floor);
  const ideal = Math.max(0, spanMs) / Math.max(1, targetCount);
  return candidates.find((step) => stepMs(step) >= ideal) ?? candidates[candidates.length - 1];
}

/**
 * Picks the rung for minor ticks: the finest one that evenly subdivides the
 * major interval, is no finer than the granularity, and still fits the budget.
 *
 * @returns The chosen rung, or undefined when the major interval cannot be
 *   subdivided without overcrowding the track
 */
function selectMinorStep(
  major: TickStep,
  spanMs: number,
  granularity: Granularity,
  budget: number
): TickStep | undefined {
  const floor = GRANULARITIES.indexOf(granularity);
  const majorSize = familySize(major);
  for (const step of TICK_LADDER) {
    if (GRANULARITIES.indexOf(step.unit) < floor) continue;
    if (familyOf(step.unit) !== familyOf(major.unit)) continue;
    const size = familySize(step);
    if (size >= majorSize || majorSize % size !== 0) continue;
    if (approxCount(spanMs, step) <= budget) return step;
  }
  return undefined;
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
 * Backstop on emitted ticks. The ladder already sizes both intervals to the
 * caller's budget, so this only guards against pathological inputs (a range of
 * millennia at hour granularity) producing an unbounded walk.
 */
const WALK_LIMIT = 10_000;

/**
 * Walks the calendar boundaries a rung lands on inside an inclusive range.
 *
 * @param start - Inclusive range start
 * @param end - Inclusive range end
 * @param step - The ladder rung to walk
 * @returns Boundary dates in ascending order
 */
function walkBoundaries(start: Date, end: Date, step: TickStep): Date[] {
  const dates: Date[] = [];
  let current = floorToMultiple(start, step.unit, step.multiple);
  if (current.getTime() < start.getTime()) {
    current = addUnits(current, step.unit, step.multiple);
  }
  while (current.getTime() <= end.getTime() && dates.length < WALK_LIMIT) {
    dates.push(current);
    current = addUnits(current, step.unit, step.multiple);
  }
  return dates;
}

/**
 * Labels a major tick at the coarsest unit its rung can carry, adding coarser
 * context only where it changes.
 *
 * A daily axis reads `Aug 01 2023 · Aug 03 · Aug 05 …`: the year is spelled out
 * once at the start and again whenever the axis crosses into a new one, so no
 * label is ambiguous and none repeats what its neighbour already said.
 *
 * @param date - The tick date
 * @param step - The rung the tick sits on
 * @param previous - The preceding major tick, or undefined for the first
 * @returns A short label string
 */
function majorLabel(date: Date, step: TickStep, previous: Date | undefined): string {
  switch (step.unit) {
    case 'year':
      return formatDate(date, 'YYYY');
    case 'month':
      return formatDate(date, 'MMM YYYY');
    case 'day': {
      const newYear = !previous || previous.getUTCFullYear() !== date.getUTCFullYear();
      return formatDate(date, newYear ? 'MMM DD YYYY' : 'MMM DD');
    }
    case 'hour': {
      const newDay =
        !previous ||
        floorToGranularity(previous, 'day').getTime() !== floorToGranularity(date, 'day').getTime();
      return formatDate(date, newDay ? 'MMM DD HH:00' : 'HH:00');
    }
  }
}

/**
 * Generates axis ticks for a date range and granularity.
 *
 * A single span-driven ladder covers every range. The rung nearest
 * `span / maxTicks` becomes the labeled major interval, and the finest rung that
 * evenly subdivides it supplies the unlabeled minor ticks. Three months, thirty
 * one days, and two centuries therefore all land at a comparable label density
 * without any special-casing.
 *
 * @param start - Inclusive range start
 * @param end - Inclusive range end
 * @param granularity - The active granularity, which the ladder never goes below
 * @param maxTicks - Approximate label budget, from the track's pixel width
 *   (default 400)
 * @returns Ticks sorted by date, de-duplicated by timestamp
 */
export function generateTicks(
  start: Date,
  end: Date,
  granularity: Granularity,
  maxTicks = 400
): Tick[] {
  const spanMs = end.getTime() - start.getTime();
  const budget = Math.max(1, Math.floor(maxTicks));
  const majorStep = selectStep(spanMs, granularity, budget);
  // Minor ticks are hairlines rather than labels, so they can sit four to a
  // label slot before the track starts to look like a comb.
  const minorStep = selectMinorStep(majorStep, spanMs, granularity, budget * 4);

  const ticks: Tick[] = [];
  const seen = new Set<number>();
  let previousMajor: Date | undefined;

  for (const date of walkBoundaries(start, end, majorStep)) {
    seen.add(date.getTime());
    ticks.push({
      date,
      fraction: dateToFraction(date, start, end),
      major: true,
      label: majorLabel(date, majorStep, previousMajor),
    });
    previousMajor = date;
  }

  if (minorStep) {
    for (const date of walkBoundaries(start, end, minorStep)) {
      if (seen.has(date.getTime())) continue;
      seen.add(date.getTime());
      ticks.push({ date, fraction: dateToFraction(date, start, end), major: false });
    }
  }

  ticks.sort((a, b) => a.date.getTime() - b.date.getTime());
  return ticks;
}
