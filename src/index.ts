// Import styles
import './lib/styles/time-slider-control.css';

// Core control
export { TimeSliderControl } from './lib/core/TimeSliderControl';

// Adapters (for custom integrations)
export { createAdapter } from './lib/adapters/registry';
export { buildTimeFilter } from './lib/adapters/GeoJsonAdapter';
export type { SourceAdapter, AdapterContext } from './lib/adapters/types';

// Time utilities
export {
  addUnits,
  floorToGranularity,
  granularityCode,
  toDate,
  GRANULARITIES,
} from './lib/time/granularity';
export {
  generateSteps,
  snapToStep,
  nextStep,
  prevStep,
  dateToFraction,
  fractionToDate,
  unitsBetween,
} from './lib/time/timeline';
export { generateTicks } from './lib/time/ticks';
export type { Tick } from './lib/time/ticks';
export {
  normalizeDates,
  clipDates,
  nearestDateIndex,
  generateOrdinalTicks,
} from './lib/time/dateList';
export { createTimeScale } from './lib/time/scale';
export type { TimeScale, TimeScaleParams } from './lib/time/scale';

// Templating
export { formatDate } from './lib/template/dateFormat';
export { expandTokens, resolveUrl } from './lib/template/urlTemplate';

// Type exports
export type {
  Granularity,
  UrlInput,
  UrlResolver,
  SourceSpec,
  ResolvedSourceSpec,
  CogSourceSpec,
  MosaicSourceSpec,
  XyzSourceSpec,
  WmsSourceSpec,
  GeoJsonSourceSpec,
  CustomSourceSpec,
  GeoJsonTimeWindow,
  GeoJsonPaint,
  TimeSliderOptions,
  TimeSliderState,
  TimeSliderConfig,
  TimeSliderEvent,
  TimeSliderEventData,
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
