import type { CustomSourceSpec, ResolvedSourceSpec, SourceSpec } from '../core/types';
import { clamp, generateId } from '../utils/helpers';
import { BaseAdapter } from './BaseAdapter';
import { CogAdapter } from './CogAdapter';
import { MosaicAdapter } from './MosaicAdapter';
import { XyzAdapter } from './XyzAdapter';
import { WmsAdapter } from './WmsAdapter';
import { GeoJsonAdapter } from './GeoJsonAdapter';
import type { AdapterContext, SourceAdapter } from './types';

/**
 * Creates an adapter for a built-in (non-custom) source spec. The spec must
 * already carry a concrete `id`.
 *
 * @param spec - A resolved source spec with an id
 * @param ctx - Shared adapter context
 * @returns The matching adapter
 */
function createResolvedAdapter(
  spec: ResolvedSourceSpec & { id: string },
  ctx: AdapterContext
): SourceAdapter {
  switch (spec.type) {
    case 'cog':
      return new CogAdapter(spec, ctx);
    case 'mosaic':
      return new MosaicAdapter(spec, ctx);
    case 'xyz':
      return new XyzAdapter(spec, ctx);
    case 'wms':
      return new WmsAdapter(spec, ctx);
    case 'geojson':
      return new GeoJsonAdapter(spec, ctx);
    default:
      throw new Error(`Unsupported source type: ${(spec as { type: string }).type}`);
  }
}

/**
 * Adapter for fully custom sources. Resolves a concrete spec per date and
 * delegates rendering to the matching built-in adapter, swapping in the freshly
 * resolved spec on each update.
 */
class CustomAdapter extends BaseAdapter {
  readonly spec: CustomSourceSpec;
  private ctx: AdapterContext;
  private inner?: SourceAdapter;

  constructor(spec: CustomSourceSpec & { id: string }, ctx: AdapterContext) {
    super(spec.id, ctx, spec.opacity ?? 1);
    this.spec = spec;
    this.ctx = ctx;
  }

  async add(date: Date): Promise<void> {
    this.lastDate = date;
    const resolved = await this.spec.resolve(date);
    this.inner = createResolvedAdapter(
      {
        ...resolved,
        id: this.id,
        opacity: resolved.opacity ?? this.opacity,
        beforeId: resolved.beforeId ?? this.beforeId,
      },
      this.ctx
    );
    await this.inner.add(date);
  }

  async update(date: Date): Promise<void> {
    this.lastDate = date;
    if (!this.inner) {
      await this.add(date);
      return;
    }
    const resolved = await this.spec.resolve(date);
    // If the resolved type changed (e.g. xyz -> geojson), the old adapter class
    // can no longer render it: tear it down and build the matching adapter.
    if (this.inner.spec.type !== resolved.type) {
      this.inner.remove();
      this.inner = createResolvedAdapter(
        {
          ...resolved,
          id: this.id,
          opacity: resolved.opacity ?? this.opacity,
          beforeId: resolved.beforeId ?? this.beforeId,
        },
        this.ctx
      );
      await this.inner.add(date);
      return;
    }
    Object.assign(this.inner.spec as unknown as Record<string, unknown>, resolved);
    await this.inner.update(date);
  }

  setOpacity(opacity: number): void {
    this.opacity = clamp(opacity, 0, 1);
    this.inner?.setOpacity(this.opacity);
  }

  remove(): void {
    this.inner?.remove();
  }
}

/**
 * Creates the appropriate adapter for any source spec, assigning a generated id
 * when none is provided.
 *
 * @param spec - Any source specification
 * @param ctx - Shared adapter context
 * @returns The constructed adapter
 */
export function createAdapter(spec: SourceSpec, ctx: AdapterContext): SourceAdapter {
  const id = spec.id ?? generateId('ts-layer');
  if (spec.type === 'custom') {
    return new CustomAdapter({ ...spec, id }, ctx);
  }
  return createResolvedAdapter({ ...spec, id }, ctx);
}
