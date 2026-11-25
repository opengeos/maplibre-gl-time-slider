import { addUnits } from './granularity';
import { createTimeScale, type TimeScaleParams } from './scale';
import { unitsBetween } from './timeline';

/**
 * One bar of the axis histogram, positioned in axis fractions.
 */
export interface HistogramBar {
  /** Left edge on the axis, in [0, 1]. */
  start: number;
  /** Right edge on the axis, in [0, 1]. */
  end: number;
  /** How many of the times fall in this bar. */
  count: number;
}

/**
 * Bins timestamps into bars along the timeline axis, so the dock can show where
 * in time the data is.
 *
 * Each step gets one bar, centered on the step's position, counting the times
 * from that step up to the next. The bar under the marker therefore counts what
 * the timeline shows at that date when each step shows its own unit (the usual
 * case: a daily timeline showing one day's features). On an ordinal timeline
 * the steps are the listed dates; on a continuous one they are every
 * `interval` granularity units from the start.
 *
 * A continuous timeline with more steps than `maxBars` falls back to
 * `maxBars` equal slices of the axis, since bars narrower than a few pixels
 * can't be told apart.
 *
 * Times before the first step, or at or after the end of the last step's
 * unit, are not counted.
 *
 * @param times - Timestamps in epoch milliseconds; non-finite values are skipped
 * @param params - The timeline shape (the control's state)
 * @param maxBars - Most bars to draw on a continuous timeline (at least 1)
 * @returns The bars, left to right
 */
export function histogramBars(
  times: ArrayLike<number>,
  params: TimeScaleParams,
  maxBars: number
): HistogramBar[] {
  const { granularity } = params;
  const interval = Math.max(1, Math.floor(params.interval));
  const scale = createTimeScale(params);
  const start = scale.startDate.getTime();

  // Step positions (axis fractions), the end of the last step (which covers its
  // whole unit, like any other step), and the bucket each time falls in.
  let centers: number[];
  let stop: number;
  let bucketOf: (time: number) => number;

  if (scale.ordinal) {
    const dates = params.dates!.map((d) => d.getTime());
    stop = addUnits(scale.endDate, granularity, 1).getTime();
    centers = dates.map((t) => scale.toFraction(new Date(t)));
    // The last listed date at or before the time.
    bucketOf = (time) => {
      let lo = 0;
      let hi = dates.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (dates[mid] <= time) lo = mid + 1;
        else hi = mid;
      }
      return lo - 1;
    };
  } else {
    const startDate = scale.startDate;
    const steps =
      Math.floor(Math.max(0, unitsBetween(startDate, scale.endDate, granularity)) / interval) + 1;
    stop = addUnits(startDate, granularity, steps * interval).getTime();
    const limit = Math.max(1, Math.floor(maxBars));
    if (steps > limit) return equalSlices(times, start, scale.endDate.getTime(), stop, limit);
    centers = Array.from({ length: steps }, (_, i) =>
      scale.toFraction(addUnits(startDate, granularity, i * interval))
    );
    bucketOf = (time) =>
      Math.min(
        steps - 1,
        Math.floor(unitsBetween(startDate, new Date(time), granularity) / interval)
      );
  }

  const counts = new Array<number>(centers.length).fill(0);
  if (centers.length === 0) return [];
  for (let i = 0; i < times.length; i++) {
    const time = times[i];
    if (!Number.isFinite(time) || time < start || time >= stop) continue;
    const bucket = bucketOf(time);
    if (bucket >= 0) counts[bucket]++;
  }

  // Each bar reaches halfway to its neighbors; the outer bars stop at the ends.
  return centers.map((center, i) => ({
    start: i === 0 ? 0 : (centers[i - 1] + center) / 2,
    end: i === centers.length - 1 ? 1 : (center + centers[i + 1]) / 2,
    count: counts[i],
  }));
}

/**
 * Counts times into `n` equal slices of a continuous axis. Times in the last
 * step's unit, past the axis end, count toward the last slice.
 */
function equalSlices(
  times: ArrayLike<number>,
  start: number,
  end: number,
  stop: number,
  n: number
): HistogramBar[] {
  const span = end - start;
  const counts = new Array<number>(n).fill(0);
  for (let i = 0; i < times.length; i++) {
    const time = times[i];
    if (!Number.isFinite(time) || time < start || time >= stop) continue;
    const fraction = span > 0 ? (time - start) / span : 0;
    counts[Math.min(n - 1, Math.floor(fraction * n))]++;
  }
  return counts.map((count, i) => ({ start: i / n, end: (i + 1) / n, count }));
}
