import { useEffect, useRef } from 'react';
import { TimeSliderControl } from './TimeSliderControl';
import type { TimeSliderControlReactProps } from './types';

/**
 * React wrapper component for TimeSliderControl.
 *
 * This component manages the lifecycle of a TimeSliderControl instance,
 * adding it to the map on mount and removing it on unmount.
 *
 * @example
 * ```tsx
 * import { TimeSliderControlReact } from 'maplibre-gl-time-slider/react';
 *
 * function MyMap() {
 *   const [map, setMap] = useState<Map | null>(null);
 *
 *   return (
 *     <>
 *       <div ref={mapContainer} />
 *       {map && (
 *         <TimeSliderControlReact
 *           map={map}
 *           title="Time Slider"
 *           labels={['2024-01', '2024-02', '2024-03']}
 *           onChange={(index, label) => console.log(label)}
 *         />
 *       )}
 *     </>
 *   );
 * }
 * ```
 *
 * @param props - Component props including map instance and control options
 * @returns null - This component renders nothing directly
 */
export function TimeSliderControlReact({
  map,
  onStateChange,
  onPlay,
  onPause,
  ...options
}: TimeSliderControlReactProps): null {
  const controlRef = useRef<TimeSliderControl | null>(null);

  useEffect(() => {
    if (!map) return;

    // Create the control instance
    const control = new TimeSliderControl(options);
    controlRef.current = control;

    // Register state change handler if provided
    if (onStateChange) {
      control.on('statechange', (event) => {
        onStateChange(event.state);
      });
    }

    // Register play handler if provided
    if (onPlay) {
      control.on('play', () => {
        onPlay();
      });
    }

    // Register pause handler if provided
    if (onPause) {
      control.on('pause', () => {
        onPause();
      });
    }

    // Add control to map
    map.addControl(control, options.position || 'top-right');

    // Cleanup on unmount
    return () => {
      if (map.hasControl(control)) {
        map.removeControl(control);
      }
      controlRef.current = null;
    };
  }, [map]);

  // Update options when they change
  useEffect(() => {
    if (controlRef.current) {
      // Handle collapsed state changes
      const currentState = controlRef.current.getState();
      if (options.collapsed !== undefined && options.collapsed !== currentState.collapsed) {
        if (options.collapsed) {
          controlRef.current.collapse();
        } else {
          controlRef.current.expand();
        }
      }

      // Handle speed changes
      if (options.speed !== undefined && options.speed !== currentState.speed) {
        controlRef.current.setSpeed(options.speed);
      }

      // Handle loop changes
      if (options.loop !== undefined && options.loop !== currentState.loop) {
        controlRef.current.setLoop(options.loop);
      }
    }
  }, [options.collapsed, options.speed, options.loop]);

  // Update labels when they change
  useEffect(() => {
    if (controlRef.current && options.labels) {
      const currentLabels = controlRef.current.getLabels();
      if (JSON.stringify(currentLabels) !== JSON.stringify(options.labels)) {
        controlRef.current.setLabels(options.labels, false);
      }
    }
  }, [options.labels]);

  return null;
}
