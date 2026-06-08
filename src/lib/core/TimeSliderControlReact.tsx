import { useEffect, useRef } from 'react';
import { TimeSliderControl } from './TimeSliderControl';
import type { TimeSliderControlReactProps } from './types';

/**
 * React wrapper for {@link TimeSliderControl}. Creates the control on mount,
 * adds it to the map, and removes it on unmount. Changes to `speed`, `loop`,
 * `granularity`, and `sources` are reconciled imperatively.
 *
 * @example
 * ```tsx
 * import { TimeSliderControlReact } from 'maplibre-gl-time-slider/react';
 *
 * <TimeSliderControlReact
 *   map={map}
 *   startDate="2024-04-18"
 *   endDate="2024-04-28"
 *   granularity="day"
 *   sources={[{ type: 'cog', id: 'chla', url: 'https://.../{date:YYYY-MM-DD}.tif' }]}
 *   onChange={(date) => console.log(date)}
 * />
 * ```
 *
 * @param props - Map instance, control options, and callbacks
 * @returns null (renders nothing directly)
 */
export function TimeSliderControlReact({
  map,
  onStateChange,
  onPlay,
  onPause,
  ...options
}: TimeSliderControlReactProps): null {
  const controlRef = useRef<TimeSliderControl | null>(null);

  // Keep the latest callbacks in a ref so handlers registered once (in the
  // create effect) always call the current props, not the first render's.
  const callbacks = useRef({ onStateChange, onPlay, onPause, onChange: options.onChange });
  callbacks.current = { onStateChange, onPlay, onPause, onChange: options.onChange };

  // Create / destroy the control with the map.
  useEffect(() => {
    if (!map) return;

    const control = new TimeSliderControl({
      ...options,
      onChange: (date) => callbacks.current.onChange?.(date),
    });
    controlRef.current = control;

    control.on('statechange', (e) => callbacks.current.onStateChange?.(e.state));
    control.on('play', () => callbacks.current.onPlay?.());
    control.on('pause', () => callbacks.current.onPause?.());

    map.addControl(control, 'bottom-left');

    return () => {
      if (map.hasControl(control)) {
        map.removeControl(control);
      }
      controlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Reconcile playback / granularity props.
  useEffect(() => {
    const control = controlRef.current;
    if (!control) return;
    const state = control.getState();
    if (options.speed != null && options.speed !== state.speed) control.setSpeed(options.speed);
    if (options.loop != null && options.loop !== state.loop) control.setLoop(options.loop);
    if (options.granularity && options.granularity !== state.granularity) {
      control.setGranularity(options.granularity);
    }
  }, [options.speed, options.loop, options.granularity]);

  // Reconcile sources by id (add new, remove missing). Sources need stable ids.
  useEffect(() => {
    const control = controlRef.current;
    if (!control) return;
    const current = control.getSources();
    const next = options.sources ?? [];
    const nextIds = new Set(next.map((s) => s.id).filter(Boolean));
    const currentIds = new Set(current.map((s) => s.id).filter(Boolean));

    for (const spec of current) {
      if (spec.id && !nextIds.has(spec.id)) control.removeSource(spec.id);
    }
    for (const spec of next) {
      if (spec.id && !currentIds.has(spec.id)) control.addSource(spec);
    }
  }, [options.sources]);

  return null;
}
