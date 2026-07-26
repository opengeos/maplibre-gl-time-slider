import type { Granularity } from '../core/types';
import { clamp } from '../utils/helpers';
import { generateOrdinalTicks, nearestDateIndex } from './dateList';
import { generateTicks, type Tick } from './ticks';
import { dateToFraction, fractionToDate, nextStep, prevStep, snapToStep } from './timeline';

/**
 * How a timeline maps dates onto the axis and steps between them.
 *
 * Two implementations back this: a *continuous* scale (a date range walked in
 * fixed granularity units) and an *ordinal* scale (an explicit list of dates,
 * evenly spaced regardless of the real gaps between them). Callers work through
 * this interface so navigation, playback, and tick rendering behave the same
 * either way.
 */
export interface TimeScale {
  /** Whether this scale steps through an explicit date list. */
  readonly ordinal: boolean;
  /** Inclusive first date reachable on the scale. */
  readonly startDate: Date;
  /** Inclusive last date reachable on the scale. */
  readonly endDate: Date;
  /** Snaps an arbitrary date onto the nearest reachable step. */
  snap(date: Date): Date;
  /** The step after `date`, or the same step when already at the end. */
  next(date: Date): Date;
  /** The step before `date`, or the same step when already at the start. */
  prev(date: Date): Date;
  /** Position of a date on the axis, in [0, 1]. */
  toFraction(date: Date): number;
  /** The date at an axis position in [0, 1]. */
  fromFraction(fraction: number): Date;
  /** Axis ticks for the current configuration. */
  ticks(maxTicks?: number): Tick[];
}

/**
 * The timeline shape a scale is built from.
 */
export interface TimeScaleParams {
  startDate: Date;
  endDate: Date;
  interval: number;
  granularity: Granularity;
  /** When present and non-empty, produces an ordinal scale over these dates. */
  dates?: Date[];
}

/**
 * Builds the scale for a timeline: ordinal when an explicit (already
 * normalized, ascending) date list is supplied, continuous otherwise.
 *
 * @param params - The timeline range, step size, and optional date list
 * @returns A scale for navigation, positioning, and tick generation
 */
export function createTimeScale(params: TimeScaleParams): TimeScale {
  const { dates } = params;
  return dates && dates.length > 0
    ? createOrdinalScale(dates, params)
    : createContinuousScale(params);
}

/**
 * A continuous scale: dates advance by whole granularity units and sit on the
 * axis in proportion to real elapsed time.
 */
function createContinuousScale({
  startDate,
  endDate,
  interval,
  granularity,
}: TimeScaleParams): TimeScale {
  return {
    ordinal: false,
    startDate,
    endDate,
    snap: (date) => snapToStep(date, startDate, endDate, interval, granularity),
    next: (date) => nextStep(date, startDate, endDate, interval, granularity),
    prev: (date) => prevStep(date, startDate, endDate, interval, granularity),
    toFraction: (date) => dateToFraction(date, startDate, endDate),
    fromFraction: (fraction) => fractionToDate(fraction, startDate, endDate),
    ticks: (maxTicks) => generateTicks(startDate, endDate, granularity, maxTicks),
  };
}

/**
 * An ordinal scale: the timeline visits only the listed dates, each occupying
 * an equal slice of the axis. Dates with no data are simply absent from the
 * list, so they are never rendered as a tick and never reached by scrubbing or
 * playback. `interval` still applies, stepping N entries at a time.
 */
function createOrdinalScale(dates: Date[], { interval, granularity }: TimeScaleParams): TimeScale {
  const last = dates.length - 1;
  // A single-date list has no span to divide; every position maps to index 0.
  const span = Math.max(1, last);
  const step = Math.max(1, Math.floor(interval));
  const at = (index: number): Date => new Date(dates[clamp(index, 0, last)].getTime());
  const indexOf = (date: Date): number => nearestDateIndex(dates, date.getTime());

  return {
    ordinal: true,
    startDate: new Date(dates[0].getTime()),
    endDate: new Date(dates[last].getTime()),
    snap: (date) => at(indexOf(date)),
    next: (date) => at(indexOf(date) + step),
    prev: (date) => at(indexOf(date) - step),
    toFraction: (date) => clamp(indexOf(date) / span, 0, 1),
    fromFraction: (fraction) => at(Math.round(clamp(fraction, 0, 1) * span)),
    ticks: (maxTicks) => generateOrdinalTicks(dates, granularity, maxTicks),
  };
}
