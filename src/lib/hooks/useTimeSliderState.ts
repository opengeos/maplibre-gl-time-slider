import { useState, useCallback } from 'react';
import type { TimeSliderState } from '../core/types';

/**
 * Default initial state for the time slider.
 */
const DEFAULT_STATE: TimeSliderState = {
  collapsed: true,
  panelWidth: 300,
  currentIndex: 0,
  isPlaying: false,
  speed: 1000,
  loop: true,
};

/**
 * Custom hook for managing time slider state in React applications.
 *
 * This hook provides a simple way to track and update the state
 * of a TimeSliderControl from React components.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const {
 *     state,
 *     setCurrentIndex,
 *     setIsPlaying,
 *     setSpeed,
 *     setLoop,
 *     reset
 *   } = useTimeSliderState();
 *
 *   return (
 *     <div>
 *       <p>Current Index: {state.currentIndex}</p>
 *       <p>Playing: {state.isPlaying ? 'Yes' : 'No'}</p>
 *       <TimeSliderControlReact
 *         map={map}
 *         labels={labels}
 *         onStateChange={(newState) => setState(newState)}
 *       />
 *     </div>
 *   );
 * }
 * ```
 *
 * @param initialState - Optional initial state values
 * @returns Object containing state and update functions
 */
export function useTimeSliderState(initialState?: Partial<TimeSliderState>) {
  const [state, setState] = useState<TimeSliderState>({
    ...DEFAULT_STATE,
    ...initialState,
  });

  /**
   * Sets the collapsed state.
   *
   * @param collapsed - Whether the panel is collapsed
   */
  const setCollapsed = useCallback((collapsed: boolean) => {
    setState((prev) => ({ ...prev, collapsed }));
  }, []);

  /**
   * Sets the panel width.
   *
   * @param panelWidth - Width in pixels
   */
  const setPanelWidth = useCallback((panelWidth: number) => {
    setState((prev) => ({ ...prev, panelWidth }));
  }, []);

  /**
   * Sets the current index.
   *
   * @param currentIndex - Index in the labels array
   */
  const setCurrentIndex = useCallback((currentIndex: number) => {
    setState((prev) => ({ ...prev, currentIndex }));
  }, []);

  /**
   * Sets the playing state.
   *
   * @param isPlaying - Whether playback is active
   */
  const setIsPlaying = useCallback((isPlaying: boolean) => {
    setState((prev) => ({ ...prev, isPlaying }));
  }, []);

  /**
   * Sets the playback speed.
   *
   * @param speed - Speed in milliseconds
   */
  const setSpeed = useCallback((speed: number) => {
    setState((prev) => ({ ...prev, speed }));
  }, []);

  /**
   * Sets the loop state.
   *
   * @param loop - Whether to loop playback
   */
  const setLoop = useCallback((loop: boolean) => {
    setState((prev) => ({ ...prev, loop }));
  }, []);

  /**
   * Resets the state to default values.
   */
  const reset = useCallback(() => {
    setState({ ...DEFAULT_STATE, ...initialState });
  }, [initialState]);

  /**
   * Toggles the collapsed state.
   */
  const toggle = useCallback(() => {
    setState((prev) => ({ ...prev, collapsed: !prev.collapsed }));
  }, []);

  return {
    state,
    setState,
    setCollapsed,
    setPanelWidth,
    setCurrentIndex,
    setIsPlaying,
    setSpeed,
    setLoop,
    reset,
    toggle,
  };
}
