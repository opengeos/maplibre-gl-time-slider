import type { CogSourceSpec, SourceSpec } from '../core/types';
import { buildTiTilerTileUrl, DEFAULT_TITILER_ENDPOINT } from '../utils/titiler';
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
  /** COG URLs found to be inaccessible for a date, so scrubbing back does not
   * re-probe them. */
  private readonly missing = new Set<string>();

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

  /**
   * Probes whether the date's COG exists by asking TiTiler for its info. A
   * missing COG makes the endpoint respond non-OK, which we treat as "no data"
   * for that date (so the layer clears and the dock shows an indicator) rather
   * than letting every tile 404. A network/CORS failure reaching the endpoint is
   * treated as available so a transient blip never blanks a valid COG.
   *
   * @param date - The timeline date
   * @returns Whether the date's COG is available
   */
  protected override async probeAvailability(date: Date): Promise<boolean> {
    const resolved = resolveUrl(this.spec.url, date);
    const cogUrl = resolved instanceof Promise ? await resolved : resolved;
    if (this.missing.has(cogUrl)) return false;
    const base = (this.spec.endpoint ?? DEFAULT_TITILER_ENDPOINT).replace(/\/$/, '');
    const infoUrl = `${base}/cog/info?url=${encodeURIComponent(cogUrl)}`;
    try {
      const response = await fetch(infoUrl);
      if (!response.ok) {
        this.missing.add(cogUrl);
        return false;
      }
      return true;
    } catch {
      // The info endpoint could not be reached (offline/CORS): do not falsely
      // blank a possibly-valid COG; let the tiles attempt to load.
      return true;
    }
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
