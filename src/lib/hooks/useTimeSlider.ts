import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { TimeSliderControl } from '../core/TimeSliderControl';
import type { Granularity, TimeSliderOptions, TimeSliderState } from '../core/types';

/**
 * Return shape of {@link useTimeSlider}.
 */
export interface UseTimeSliderResult {
  /** The underlying control instance (null until the map is ready). */
  control: TimeSliderControl | null;
  /** Reactive snapshot of the control state (null until mounted). */
  state: TimeSliderState | null;
  /** Start playback. */
  play: () => void;
  /** Pause playback. */
  pause: () => void;
  /** Navigate to a date. */
  goTo: (date: Date) => void;
  /** Advance one step. */
  next: () => void;
  /** Rewind one step. */
  prev: () => void;
  /** Change the active granularity. */
  setGranularity: (granularity: Granularity) => void;
}

/**
 * React hook that creates a {@link TimeSliderControl}, adds it to the map, and
 * exposes a reactive state snapshot plus common actions. The control is created
 * once per map instance and removed on unmount.
 *
 * @param map - The MapLibre map (or null until ready)
 * @param options - Control options
 * @returns The control, a reactive state snapshot, and action helpers
 *
 * @example
 * ```tsx
 * const { state, play, pause } = useTimeSlider(map, {
 *   startDate: '2024-04-18',
 *   endDate: '2024-04-28',
 *   sources: [{ type: 'cog', url: 'https://.../{date:YYYY-MM-DD}.tif' }],
 * });
 * ```
 */
export function useTimeSlider(
  map: MapLibreMap | null | undefined,
  options: TimeSliderOptions
): UseTimeSliderResult {
  const controlRef = useRef<TimeSliderControl | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [state, setState] = useState<TimeSliderState | null>(null);

  useEffect(() => {
    if (!map) return;
    const control = new TimeSliderControl(optionsRef.current);
    controlRef.current = control;
    setState(control.getState());

    const onState = (e: { state: TimeSliderState }): void => setState(e.state);
    control.on('statechange', onState);
    map.addControl(control, 'bottom-left');

    return () => {
      control.off('statechange', onState);
      if (map.hasControl(control)) {
        map.removeControl(control);
      }
      controlRef.current = null;
      setState(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return {
    control: controlRef.current,
    state,
    play: () => controlRef.current?.play(),
    pause: () => controlRef.current?.pause(),
    goTo: (date: Date) => controlRef.current?.goTo(date),
    next: () => controlRef.current?.next(),
    prev: () => controlRef.current?.prev(),
    setGranularity: (granularity: Granularity) => controlRef.current?.setGranularity(granularity),
  };
}
