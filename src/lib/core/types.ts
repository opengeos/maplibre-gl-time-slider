import type { Map } from 'maplibre-gl';
import type {
  FilterSpecification,
  CircleLayerSpecification,
  FillLayerSpecification,
  LineLayerSpecification,
} from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';

/**
 * Time granularity used for stepping and axis tick generation.
 */
export type Granularity = 'hour' | 'day' | 'month' | 'year';

/**
 * Resolves a date to a URL string. Used as an escape hatch when a simple token
 * template is not expressive enough (for example, an async tile service that
 * returns a different template per date).
 *
 * @param date - The current timeline date
 * @returns A URL string (or a promise resolving to one)
 */
export type UrlResolver = (date: Date) => string | Promise<string>;

/**
 * A url/tiles field that is either a token template string (e.g.
 * `https://.../{YYYY}/{MM}/{DD}.png`) or a {@link UrlResolver} function.
 */
export type UrlInput = string | UrlResolver;

/**
 * Common fields shared by every source specification.
 */
interface BaseSourceSpec {
  /**
   * Stable identifier for the source/layer. Auto-generated when omitted.
   */
  id?: string;

  /**
   * Human-readable name shown in the layers popover.
   */
  name?: string;

  /**
   * Initial layer opacity in the range [0, 1].
   * @default 1
   */
  opacity?: number;

  /**
   * ID of an existing map layer to insert this layer before.
   */
  beforeId?: string;
}

/**
 * A Cloud Optimized GeoTIFF rendered through a TiTiler endpoint.
 */
export interface CogSourceSpec extends BaseSourceSpec {
  type: 'cog';

  /**
   * URL of the COG for the current date. Token template or resolver function.
   */
  url: UrlInput;

  /**
   * TiTiler endpoint URL.
   * @default 'https://titiler.d2s.org'
   */
  endpoint?: string;

  /**
   * Colormap name applied by TiTiler.
   * @default 'viridis'
   */
  colormap?: string;

  /**
   * Min/max values for rescaling the data.
   */
  rescale?: [number, number];

  /**
   * Band indexes to read (1-based).
   */
  bidx?: number[];

  /**
   * NoData value. A number or 'nan'.
   */
  nodata?: number | string;

  /**
   * Raster tile size in pixels.
   * @default 256
   */
  tileSize?: number;
}

/**
 * A pre-tiled XYZ/WMTS raster source whose tile URL embeds the date.
 */
export interface XyzSourceSpec extends BaseSourceSpec {
  type: 'xyz';

  /**
   * Tile URL template with `{z}/{x}/{y}` placeholders plus date tokens
   * (e.g. `?date={YYYY}-{MM}-{DD}`), or a resolver function.
   */
  tiles: UrlInput;

  /**
   * Raster tile size in pixels.
   * @default 256
   */
  tileSize?: number;

  /**
   * Optional attribution string for the source.
   */
  attribution?: string;
}

/**
 * An OGC WMS source driven by the standard `TIME` parameter.
 */
export interface WmsSourceSpec extends BaseSourceSpec {
  type: 'wms';

  /**
   * Base WMS GetMap URL (without the `TIME` parameter). May already contain
   * other query parameters such as `layers`, `format`, etc.
   */
  baseUrl: string;

  /**
   * Comma-separated layer names. Appended as `layers=` when provided.
   */
  layers?: string;

  /**
   * Date format for the `TIME` parameter (token string).
   * @default 'YYYY-MM-DD'
   */
  timeFormat?: string;

  /**
   * Raster tile size in pixels.
   * @default 256
   */
  tileSize?: number;
}

/**
 * Time window applied around the current date for GeoJSON filtering.
 */
export interface GeoJsonTimeWindow {
  /**
   * The unit of the window bounds.
   */
  unit: Granularity;

  /**
   * Units to include before the current date.
   * @default 0
   */
  before?: number;

  /**
   * Units to include after the current date.
   * @default 1
   */
  after?: number;
}

/**
 * Paint properties accepted by the GeoJSON adapter, keyed by geometry kind.
 */
export interface GeoJsonPaint {
  circle?: CircleLayerSpecification['paint'];
  fill?: FillLayerSpecification['paint'];
  line?: LineLayerSpecification['paint'];
}

/**
 * A GeoJSON source filtered by a time property on each feature.
 */
export interface GeoJsonSourceSpec extends BaseSourceSpec {
  type: 'geojson';

  /**
   * GeoJSON data: a URL string or an inline FeatureCollection.
   */
  data: string | FeatureCollection;

  /**
   * Name of the feature property holding the timestamp (ISO string or epoch ms).
   */
  timeProperty: string;

  /**
   * Window of time to display around the current date.
   * @default { unit: granularity, before: 0, after: 1 }
   */
  window?: GeoJsonTimeWindow;

  /**
   * Geometry kind to render.
   * @default 'circle'
   */
  geometry?: 'circle' | 'fill' | 'line';

  /**
   * Paint properties for the rendered layer.
   */
  paint?: GeoJsonPaint;
}

/**
 * A fully custom source. The resolver returns a concrete spec for a given date,
 * giving callers complete control over how data maps onto the timeline.
 */
export interface CustomSourceSpec extends BaseSourceSpec {
  type: 'custom';

  /**
   * Returns a concrete (non-custom) source spec for the given date.
   */
  resolve: (date: Date) => ResolvedSourceSpec | Promise<ResolvedSourceSpec>;
}

/**
 * Any built-in (non-custom) source specification.
 */
export type ResolvedSourceSpec = CogSourceSpec | XyzSourceSpec | WmsSourceSpec | GeoJsonSourceSpec;

/**
 * Any source specification accepted by the control.
 */
export type SourceSpec = ResolvedSourceSpec | CustomSourceSpec;

/**
 * Options for configuring the TimeSliderControl.
 */
export interface TimeSliderOptions {
  /**
   * Inclusive start of the timeline range.
   */
  startDate: Date | string;

  /**
   * Inclusive end of the timeline range.
   */
  endDate: Date | string;

  /**
   * Number of {@link granularity} units between consecutive steps.
   * @default 1
   */
  interval?: number;

  /**
   * Active time granularity.
   * @default 'day'
   */
  granularity?: Granularity;

  /**
   * Granularities offered as zoom pills.
   * @default ['hour', 'day', 'month', 'year']
   */
  granularities?: Granularity[];

  /**
   * Date the marker starts at.
   * @default startDate
   */
  initialDate?: Date | string;

  /**
   * Playback speed in milliseconds per step.
   * @default 1000
   */
  speed?: number;

  /**
   * Whether playback loops back to the start when it reaches the end.
   * @default true
   */
  loop?: boolean;

  /**
   * Color theme. `'auto'` follows the system preference.
   * @default 'auto'
   */
  theme?: 'auto' | 'light' | 'dark';

  /**
   * Token format for the current-date label. When omitted, a format is derived
   * from the active granularity (hour -> `YYYY MMM DD HH:00`, day ->
   * `YYYY MMM DD`, month -> `MMM YYYY`, year -> `YYYY`).
   */
  dateFormat?: string;

  /**
   * Custom CSS class name added to the dock container.
   */
  className?: string;

  /**
   * Whether to show a corner toggle button that collapses/expands the dock.
   * @default true
   */
  collapsible?: boolean;

  /**
   * Whether the dock starts collapsed (hidden, with only the toggle showing).
   * @default false
   */
  collapsed?: boolean;

  /**
   * Data sources added to the map when the control is added.
   */
  sources?: SourceSpec[];

  /**
   * ID of an existing map layer to insert managed layers before.
   */
  beforeId?: string;

  /**
   * Callback fired (in addition to managed adapters) whenever the date changes.
   *
   * @param date - The new current date
   */
  onChange?: (date: Date) => void;
}

/**
 * Public, observable state of the time slider control.
 */
export interface TimeSliderState {
  /**
   * Whether the dock is currently collapsed (hidden).
   */
  collapsed: boolean;

  /**
   * The current marker date.
   */
  currentDate: Date;

  /**
   * Inclusive start of the range.
   */
  startDate: Date;

  /**
   * Inclusive end of the range.
   */
  endDate: Date;

  /**
   * Steps between marker positions, in granularity units.
   */
  interval: number;

  /**
   * Active granularity.
   */
  granularity: Granularity;

  /**
   * Whether playback is active.
   */
  isPlaying: boolean;

  /**
   * Playback speed in milliseconds per step.
   */
  speed: number;

  /**
   * Whether playback loops.
   */
  loop: boolean;
}

/**
 * Fully serializable configuration for the control, including layers. Returned
 * by {@link TimeSliderControl.getConfig} and accepted by
 * {@link TimeSliderControl.setConfig}.
 *
 * Sources are only serializable when their url/tiles fields are token strings;
 * `custom` sources and function-valued url/tiles cannot be JSON-serialized
 * (they survive a structured clone / in-memory round-trip but not `JSON.stringify`).
 */
export interface TimeSliderConfig {
  startDate: string;
  endDate: string;
  interval: number;
  granularity: Granularity;
  currentDate: string;
  speed: number;
  loop: boolean;
  sources: SourceSpec[];
  /** Granularities offered as pills. */
  granularities?: Granularity[];
  /** Whether the dock is collapsed. */
  collapsed?: boolean;
  /** Color theme. */
  theme?: 'auto' | 'light' | 'dark';
  /** Date-label token format (undefined = granularity default). */
  dateFormat?: string;
  /** Layer to insert managed layers before. */
  beforeId?: string;
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
  | 'change'
  | 'play'
  | 'pause'
  | 'granularitychange'
  | 'rangechange'
  | 'sourceadd'
  | 'sourceremove'
  | 'collapse'
  | 'expand'
  | 'statechange';

/**
 * Event payload passed to handlers.
 */
export interface TimeSliderEventData {
  type: TimeSliderEvent;
  state: TimeSliderState;
}

/**
 * Event handler function type.
 */
export type TimeSliderEventHandler = (event: TimeSliderEventData) => void;

/**
 * Re-exported MapLibre filter type for adapter implementations.
 */
export type { FilterSpecification };
