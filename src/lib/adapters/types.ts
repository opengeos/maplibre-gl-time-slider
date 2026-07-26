import type { Map as MapLibreMap } from 'maplibre-gl';
import type { SourceSpec } from '../core/types';

/**
 * Shared context handed to every adapter at construction.
 */
export interface AdapterContext {
  /**
   * The MapLibre GL map instance.
   */
  map: MapLibreMap;

  /**
   * ID of an existing map layer to insert managed layers before.
   */
  beforeId?: string;

  /**
   * Reports whether the source has data for the date it just rendered. Adapters
   * whose data is sparse across the timeline (e.g. a mosaic with missing dates)
   * call this with `false` when a date's URL is inaccessible and `true` once a
   * date loads, so the control can surface a "no data" indicator instead of the
   * step failing silently or flooding the console.
   *
   * @param id - The reporting source's id
   * @param available - Whether the current date has data
   */
  onDataStatus?: (id: string, available: boolean) => void;
}

/**
 * Uniform interface implemented by every source adapter. The control treats all
 * data sources through this interface and never special-cases a type.
 */
export interface SourceAdapter {
  /**
   * Stable identifier (also used as the MapLibre source and layer id).
   */
  readonly id: string;

  /**
   * The originating source specification.
   */
  readonly spec: SourceSpec;

  /**
   * Creates the MapLibre source and layer for the initial date.
   *
   * @param date - The current timeline date
   */
  add(date: Date): Promise<void> | void;

  /**
   * Re-renders the source for a new date.
   *
   * @param date - The new timeline date
   */
  update(date: Date): Promise<void> | void;

  /**
   * Sets the layer opacity.
   *
   * @param opacity - Opacity in [0, 1]
   */
  setOpacity(opacity: number): void;

  /**
   * Shows or hides the layer without removing it from the map.
   *
   * @param visible - Whether the layer should be visible
   */
  setVisible(visible: boolean): void;

  /**
   * Applies a live property patch (e.g. colormap/rescale for COG and mosaic
   * layers).
   *
   * @param patch - Partial spec fields to merge
   */
  setProperty?(patch: Partial<SourceSpec>): void | Promise<void>;

  /**
   * Removes the layer and source from the map.
   */
  remove(): void;
}
