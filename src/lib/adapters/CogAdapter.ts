import type { CogSourceSpec, SourceSpec } from '../core/types';
import { buildTiTilerTileUrl } from '../utils/titiler';
import { resolveUrl } from '../template/urlTemplate';
import { RasterAdapter } from './BaseAdapter';
import type { AdapterContext } from './types';

/**
 * Renders a Cloud Optimized GeoTIFF through a TiTiler endpoint, re-templating
 * the COG URL on each date change and rebuilding the tile URL with the active
 * colormap/rescale options.
 */
export class CogAdapter extends RasterAdapter {
  readonly spec: CogSourceSpec;

  /**
   * @param spec - The COG source specification
   * @param ctx - Shared adapter context
   */
  constructor(spec: CogSourceSpec, ctx: AdapterContext) {
    super(spec.id!, { ...ctx, beforeId: spec.beforeId ?? ctx.beforeId }, spec.opacity ?? 1);
    this.spec = spec;
    this.tileSize = spec.tileSize ?? 256;
    this.bounds = spec.bounds;
  }

  protected resolveTiles(date: Date): string | Promise<string> {
    const build = (cogUrl: string): string =>
      buildTiTilerTileUrl({
        url: cogUrl,
        endpoint: this.spec.endpoint,
        colormap: this.spec.colormap,
        rescale: this.spec.rescale,
        bidx: this.spec.bidx,
        nodata: this.spec.nodata,
      });
    const cogUrl = resolveUrl(this.spec.url, date);
    return cogUrl instanceof Promise ? cogUrl.then(build) : build(cogUrl);
  }

  /**
   * Updates colormap/rescale (and other COG fields) and re-renders the current
   * date's tiles.
   *
   * @param patch - Partial COG spec fields to merge
   */
  async setProperty(patch: Partial<SourceSpec>): Promise<void> {
    Object.assign(this.spec, patch);
    if (this.lastDate) {
      await this.update(this.lastDate);
    }
  }
}
