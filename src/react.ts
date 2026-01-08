// React entry point
export { TimeSliderControlReact } from './lib/core/TimeSliderControlReact';

// React hooks
export { useTimeSliderState } from './lib/hooks';

// Re-export types for React consumers
export type {
  TimeSliderOptions,
  TimeSliderState,
  TimeSliderControlReactProps,
  TimeSliderEvent,
  TimeSliderEventHandler,
} from './lib/core/types';

// Re-export utilities
export {
  buildTiTilerTileUrl,
  getTiTilerBounds,
  getTiTilerInfo,
  getTiTilerStatistics,
} from './lib/utils';

export type { TiTilerOptions } from './lib/utils';
