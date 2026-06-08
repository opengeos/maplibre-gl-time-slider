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
   * Applies a live property patch (e.g. colormap/rescale for COG layers).
   *
   * @param patch - Partial spec fields to merge
   */
  setProperty?(patch: Partial<SourceSpec>): void | Promise<void>;

  /**
   * Removes the layer and source from the map.
   */
  remove(): void;
}
