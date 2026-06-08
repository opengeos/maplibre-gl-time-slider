// React entry point
export { TimeSliderControlReact } from './lib/core/TimeSliderControlReact';

// React hooks
export { useTimeSlider } from './lib/hooks';
export type { UseTimeSliderResult } from './lib/hooks';

// Re-export the core control for convenience
export { TimeSliderControl } from './lib/core/TimeSliderControl';

// Re-export types for React consumers
export type {
  Granularity,
  UrlInput,
  UrlResolver,
  SourceSpec,
  ResolvedSourceSpec,
  CogSourceSpec,
  XyzSourceSpec,
  WmsSourceSpec,
  GeoJsonSourceSpec,
  CustomSourceSpec,
  GeoJsonTimeWindow,
  GeoJsonPaint,
  TimeSliderOptions,
  TimeSliderState,
  TimeSliderConfig,
  TimeSliderControlReactProps,
  TimeSliderEvent,
  TimeSliderEventData,
  TimeSliderEventHandler,
} from './lib/core/types';

// Re-export utilities
export { formatDate } from './lib/template/dateFormat';
export {
  buildTiTilerTileUrl,
  getTiTilerBounds,
  getTiTilerInfo,
  getTiTilerStatistics,
} from './lib/utils';

export type { TiTilerOptions } from './lib/utils';
