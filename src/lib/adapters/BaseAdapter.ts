import type { Map as MapLibreMap, RasterTileSource } from 'maplibre-gl';
import type { SourceSpec } from '../core/types';
import { clamp } from '../utils/helpers';
import type { AdapterContext, SourceAdapter } from './types';

/**
 * Shared base for all adapters: holds identity, the map handle, opacity, and the
 * last rendered date, and tears down its layer + source on removal.
 */
export abstract class BaseAdapter implements SourceAdapter {
  readonly id: string;
  abstract readonly spec: SourceSpec;

  protected map: MapLibreMap;
  protected beforeId?: string;
  protected opacity: number;
  protected lastDate?: Date;

  /**
   * @param id - Stable id used for the source and layer
   * @param ctx - Shared adapter context (map + beforeId)
   * @param opacity - Initial opacity in [0, 1]
   */
  constructor(id: string, ctx: AdapterContext, opacity: number) {
    this.id = id;
    this.map = ctx.map;
    this.beforeId = ctx.beforeId;
    this.opacity = clamp(opacity, 0, 1);
  }

  abstract add(date: Date): Promise<void> | void;
  abstract update(date: Date): Promise<void> | void;
  abstract setOpacity(opacity: number): void;

  /**
   * Removes the managed layer then source if they exist.
   */
  remove(): void {
    if (this.map.getLayer?.(this.id)) {
      this.map.removeLayer(this.id);
    }
    if (this.map.getSource?.(this.id)) {
      this.map.removeSource(this.id);
    }
  }
}

/**
 * Applies `fn` to a value that may be a plain value or a promise, preserving the
 * synchronous path when possible.
 *
 * @param value - A value or promise
 * @param fn - The consumer
 */
function whenResolved<T>(value: T | Promise<T>, fn: (v: T) => void): void | Promise<void> {
  if (value instanceof Promise) {
    return value.then(fn);
  }
  fn(value);
}

/**
 * Base for raster-backed adapters (COG, XYZ, WMS). Subclasses only implement
 * {@link RasterAdapter.resolveTiles}; this class manages the raster source,
 * layer, tile updates, and opacity. Tile resolution is synchronous for string
 * templates and asynchronous only for resolver functions.
 */
export abstract class RasterAdapter extends BaseAdapter {
  protected tileSize = 256;
  protected attribution?: string;

  /**
   * Builds the tile URL template for a given date.
   *
   * @param date - The timeline date
   * @returns A tile URL with `{z}/{x}/{y}` placeholders (or a promise of one)
   */
  protected abstract resolveTiles(date: Date): string | Promise<string>;

  add(date: Date): void | Promise<void> {
    this.lastDate = date;
    if (this.map.getSource?.(this.id)) return;
    return whenResolved(this.resolveTiles(date), (tiles) => {
      if (this.map.getSource?.(this.id)) return;
      this.map.addSource(this.id, {
        type: 'raster',
        tiles: [tiles],
        tileSize: this.tileSize,
        ...(this.attribution ? { attribution: this.attribution } : {}),
      });
      this.map.addLayer(
        {
          id: this.id,
          type: 'raster',
          source: this.id,
          paint: { 'raster-opacity': this.opacity },
        },
        this.beforeId
      );
    });
  }

  update(date: Date): void | Promise<void> {
    this.lastDate = date;
    return whenResolved(this.resolveTiles(date), (tiles) => {
      const source = this.map.getSource?.(this.id) as RasterTileSource | undefined;
      if (source && typeof source.setTiles === 'function') {
        source.setTiles([tiles]);
      }
    });
  }

  setOpacity(opacity: number): void {
    this.opacity = clamp(opacity, 0, 1);
    if (this.map.getLayer?.(this.id)) {
      this.map.setPaintProperty(this.id, 'raster-opacity', this.opacity);
    }
  }
}
