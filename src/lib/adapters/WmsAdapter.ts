import type { WmsSourceSpec } from '../core/types';
import { formatDate } from '../template/dateFormat';
import { RasterAdapter } from './BaseAdapter';
import type { AdapterContext } from './types';

/**
 * Renders an OGC WMS layer as raster tiles, driven by the standard `TIME`
 * request parameter. The base URL may already include query parameters; this
 * adapter appends `layers` (when provided) and `TIME` for the current date.
 */
export class WmsAdapter extends RasterAdapter {
  readonly spec: WmsSourceSpec;

  /**
   * @param spec - The WMS source specification
   * @param ctx - Shared adapter context
   */
  constructor(spec: WmsSourceSpec, ctx: AdapterContext) {
    super(spec.id!, { ...ctx, beforeId: spec.beforeId ?? ctx.beforeId }, spec.opacity ?? 1);
    this.spec = spec;
    this.tileSize = spec.tileSize ?? 256;
  }

  protected resolveTiles(date: Date): string {
    const time = formatDate(date, this.spec.timeFormat ?? 'YYYY-MM-DD');
    const sep = this.spec.baseUrl.includes('?') ? '&' : '?';
    const params: string[] = [];
    if (this.spec.layers) {
      params.push(`layers=${encodeURIComponent(this.spec.layers)}`);
    }
    params.push(`TIME=${encodeURIComponent(time)}`);
    return `${this.spec.baseUrl}${sep}${params.join('&')}`;
  }
}
