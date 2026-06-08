import type { FilterSpecification } from 'maplibre-gl';
import type { GeoJsonSourceSpec, GeoJsonTimeWindow } from '../core/types';
import { addUnits } from '../time/granularity';
import { clamp } from '../utils/helpers';
import { BaseAdapter } from './BaseAdapter';
import type { AdapterContext } from './types';

/**
 * Default window applied when a spec omits one: show features dated within the
 * current day.
 */
const DEFAULT_WINDOW: Required<GeoJsonTimeWindow> = { unit: 'day', before: 0, after: 1 };

/**
 * Layer type and opacity paint key for each supported geometry kind.
 */
const GEOMETRY_CONFIG = {
  circle: { layerType: 'circle' as const, opacityKey: 'circle-opacity' },
  fill: { layerType: 'fill' as const, opacityKey: 'fill-opacity' },
  line: { layerType: 'line' as const, opacityKey: 'line-opacity' },
};

/**
 * Builds a MapLibre filter expression that keeps features whose time property
 * falls inside the window `[date - before, date + after)` around the date.
 *
 * The time property is coerced with `to-number`, so values must be epoch
 * milliseconds (or numeric strings).
 *
 * @param timeProperty - Feature property holding the timestamp
 * @param date - The current timeline date
 * @param window - The time window
 * @returns A MapLibre filter expression
 */
export function buildTimeFilter(
  timeProperty: string,
  date: Date,
  window: GeoJsonTimeWindow
): FilterSpecification {
  const before = window.before ?? 0;
  const after = window.after ?? 1;
  const lower = addUnits(date, window.unit, -before).getTime();
  const upper = addUnits(date, window.unit, after).getTime();
  const value = ['to-number', ['get', timeProperty]];
  return ['all', ['>=', value, lower], ['<', value, upper]] as unknown as FilterSpecification;
}

/**
 * Renders a GeoJSON source and filters its features by a time property as the
 * timeline advances. No network requests are made on update; only the layer
 * filter changes.
 */
export class GeoJsonAdapter extends BaseAdapter {
  readonly spec: GeoJsonSourceSpec;
  private window: GeoJsonTimeWindow;
  private opacityKey: string;

  /**
   * @param spec - The GeoJSON source specification
   * @param ctx - Shared adapter context
   */
  constructor(spec: GeoJsonSourceSpec, ctx: AdapterContext) {
    super(spec.id!, { ...ctx, beforeId: spec.beforeId ?? ctx.beforeId }, spec.opacity ?? 1);
    this.spec = spec;
    this.window = spec.window ?? DEFAULT_WINDOW;
    this.opacityKey = GEOMETRY_CONFIG[spec.geometry ?? 'circle'].opacityKey;
  }

  add(date: Date): void {
    this.lastDate = date;
    if (this.map.getSource?.(this.id)) return;

    this.map.addSource(this.id, { type: 'geojson', data: this.spec.data });

    const geometry = this.spec.geometry ?? 'circle';
    const { layerType } = GEOMETRY_CONFIG[geometry];
    const paint = {
      ...(this.spec.paint?.[geometry] ?? {}),
      [this.opacityKey]: this.opacity,
    };

    this.map.addLayer(
      {
        id: this.id,
        type: layerType,
        source: this.id,
        paint,
        filter: buildTimeFilter(this.spec.timeProperty, date, this.window),
      } as never,
      this.beforeId
    );
  }

  update(date: Date): void {
    this.lastDate = date;
    if (this.map.getLayer?.(this.id)) {
      this.map.setFilter(this.id, buildTimeFilter(this.spec.timeProperty, date, this.window));
    }
  }

  setOpacity(opacity: number): void {
    this.opacity = clamp(opacity, 0, 1);
    if (this.map.getLayer?.(this.id)) {
      this.map.setPaintProperty(this.id, this.opacityKey, this.opacity);
    }
  }
}
