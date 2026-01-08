// Import styles
import './lib/styles/time-slider-control.css';

// Main entry point - Core exports
export { TimeSliderControl } from './lib/core/TimeSliderControl';

// Type exports
export type {
  TimeSliderOptions,
  TimeSliderState,
  TimeSliderEvent,
  TimeSliderEventHandler,
} from './lib/core/types';

// Utility exports
export {
  clamp,
  generateId,
  debounce,
  throttle,
  classNames,
  buildTiTilerTileUrl,
  getTiTilerBounds,
  getTiTilerInfo,
  getTiTilerStatistics,
} from './lib/utils';

export type { TiTilerOptions } from './lib/utils';
