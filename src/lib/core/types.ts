import type { Map } from 'maplibre-gl';

/**
 * Options for configuring the TimeSliderControl.
 */
export interface TimeSliderOptions {
  /**
   * Whether the control panel should start collapsed (showing only the toggle button).
   * @default true
   */
  collapsed?: boolean;

  /**
   * Position of the control on the map.
   * @default 'top-right'
   */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

  /**
   * Title displayed in the control header.
   * @default 'Time Slider'
   */
  title?: string;

  /**
   * Width of the control panel in pixels.
   * @default 300
   */
  panelWidth?: number;

  /**
   * Custom CSS class name for the control container.
   */
  className?: string;

  /**
   * Array of labels to display (e.g., dates, months, years).
   */
  labels: string[];

  /**
   * Initial index to start at.
   * @default 0
   */
  initialIndex?: number;

  /**
   * Playback speed in milliseconds.
   * @default 1000
   */
  speed?: number;

  /**
   * Whether to loop playback when reaching the end.
   * @default true
   */
  loop?: boolean;

  /**
   * Callback fired when the slider index changes.
   *
   * @param index - The current index
   * @param label - The current label string
   */
  onChange?: (index: number, label: string) => void;

  /**
   * Callback fired when the "Add Layer" button is clicked.
   * This allows users to persist the current time period as a permanent layer.
   *
   * @param index - The current index
   * @param label - The current label string
   * @param beforeId - Optional layer ID to insert the new layer before
   */
  onAddLayer?: (index: number, label: string, beforeId?: string) => void;

  /**
   * ID of the layer before which to insert new layers when using onAddLayer.
   * This ensures proper layer ordering in the map.
   */
  beforeId?: string;
}

/**
 * Internal state of the time slider control.
 */
export interface TimeSliderState {
  /**
   * Whether the control panel is currently collapsed.
   */
  collapsed: boolean;

  /**
   * Current panel width in pixels.
   */
  panelWidth: number;

  /**
   * Current index in the labels array.
   */
  currentIndex: number;

  /**
   * Whether playback is currently active.
   */
  isPlaying: boolean;

  /**
   * Current playback speed in milliseconds.
   */
  speed: number;

  /**
   * Whether to loop playback.
   */
  loop: boolean;
}

/**
 * Props for the React wrapper component.
 */
export interface TimeSliderControlReactProps extends TimeSliderOptions {
  /**
   * MapLibre GL map instance.
   */
  map: Map;

  /**
   * Callback fired when the control state changes.
   *
   * @param state - The new state
   */
  onStateChange?: (state: TimeSliderState) => void;

  /**
   * Callback fired when playback starts.
   */
  onPlay?: () => void;

  /**
   * Callback fired when playback pauses.
   */
  onPause?: () => void;
}

/**
 * Event types emitted by the time slider control.
 */
export type TimeSliderEvent =
  | 'collapse'
  | 'expand'
  | 'statechange'
  | 'change'
  | 'play'
  | 'pause';

/**
 * Event handler function type.
 */
export type TimeSliderEventHandler = (event: {
  type: TimeSliderEvent;
  state: TimeSliderState;
}) => void;
