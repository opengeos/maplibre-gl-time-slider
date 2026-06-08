import type { XyzSourceSpec } from '../core/types';
import { resolveUrl } from '../template/urlTemplate';
import { RasterAdapter } from './BaseAdapter';
import type { AdapterContext } from './types';

/**
 * Renders a pre-tiled XYZ/WMTS raster source whose tile URL embeds the date via
 * tokens (e.g. `?date={YYYY}-{MM}-{DD}`) or a resolver function.
 */
export class XyzAdapter extends RasterAdapter {
  readonly spec: XyzSourceSpec;

  /**
   * @param spec - The XYZ source specification
   * @param ctx - Shared adapter context
   */
  constructor(spec: XyzSourceSpec, ctx: AdapterContext) {
    super(spec.id!, { ...ctx, beforeId: spec.beforeId ?? ctx.beforeId }, spec.opacity ?? 1);
    this.spec = spec;
    this.tileSize = spec.tileSize ?? 256;
    this.attribution = spec.attribution;
  }

  protected resolveTiles(date: Date): string | Promise<string> {
    return resolveUrl(this.spec.tiles, date);
  }
}
