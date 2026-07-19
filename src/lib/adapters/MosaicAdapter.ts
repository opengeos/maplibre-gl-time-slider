import type { MosaicSourceSpec } from '../core/types';
import { resolveUrl } from '../template/urlTemplate';
import { clamp, generateId } from '../utils/helpers';
import { BaseAdapter } from './BaseAdapter';
import type { AdapterContext } from './types';

/**
 * The subset of `maplibre-gl-raster`'s `RasterLayerState` this adapter sets.
 * Declared locally so the build needs no compile-time dependency on
 * `maplibre-gl-raster` (whose type declarations pull in the deck.gl / luma.gl
 * type tree); the concrete package is loaded only at runtime.
 */
interface MosaicRasterState {
  opacity: number;
  visible: boolean;
  bands: number[];
  mode: 'rgb' | 'single' | 'index';
  colormap: string;
  rescale: [number, number][] | null;
  nodata: number | 'off' | 'auto';
}

/** Options accepted by `LayerManager.addRaster` that this adapter uses. */
interface AddMosaicOptions {
  id?: string;
  name?: string;
  state?: Partial<MosaicRasterState>;
  zoomTo?: boolean;
  beforeId?: string;
}

/**
 * The slice of `maplibre-gl-raster`'s `LayerManager` this adapter drives.
 * Structural so the dynamic import stays typed without importing the class.
 */
interface MosaicLayerManager {
  addRaster(source: string, options?: AddMosaicOptions): Promise<string>;
  removeRaster(id: string): void;
  setState(id: string, patch: Partial<MosaicRasterState>): void;
  setVisible(id: string, visible: boolean): void;
  getLayer(id: string): unknown;
  destroy(): void;
}

/** The `maplibre-gl-raster` module surface this adapter imports at runtime. */
type MaplibreGlRasterModule = {
  LayerManager: new (
    map: AdapterContext['map'],
    options?: { interleaved?: boolean; engine?: string },
  ) => MosaicLayerManager;
};

/** Maps the spec's engine choice to a `maplibre-gl-raster` render-engine id. */
const RASTER_ENGINE: Record<'gpu' | 'wasm', string> = {
  gpu: 'maplibre-gl-raster',
  wasm: 'cog-tiler-wasm',
};

/** Cached module promise so the lazy import happens once per session. */
let rasterModulePromise: Promise<MaplibreGlRasterModule> | null = null;

/**
 * Lazily imports `maplibre-gl-raster` (an optional peer dependency), so the
 * deck.gl mosaic engine never enters the base bundle and only loads when a
 * mosaic source is actually added. Mirrors how `maplibre-gl-raster` itself
 * lazy-loads its `cog-tiler-wasm` engine.
 *
 * @returns The `maplibre-gl-raster` module.
 * @throws When the package is not installed.
 */
async function loadRasterModule(): Promise<MaplibreGlRasterModule> {
  if (!rasterModulePromise) {
    rasterModulePromise = import('maplibre-gl-raster').then(
      (mod) => mod as unknown as MaplibreGlRasterModule,
      (err) => {
        rasterModulePromise = null;
        throw new Error(
          'A "mosaic" time-slider source needs the optional peer dependency ' +
            '"maplibre-gl-raster" (>=0.12.0). Install it to render mosaic manifests. ' +
            `Original error: ${err instanceof Error ? err.message : String(err)}`,
        );
      },
    );
  }
  return rasterModulePromise;
}

/**
 * Renders a per-date mosaic manifest (MosaicJSON or STAC `FeatureCollection`)
 * as a deck.gl mosaic through `maplibre-gl-raster`'s `LayerManager`.
 *
 * Each date resolves the source URL to a whole `.json` manifest, which the
 * LayerManager stitches into one layer (one COGLayer per in-view asset). On a
 * date change the new mosaic is loaded first and the previous one removed only
 * once it resolves, so scrubbing swaps cleanly without a blank frame. A
 * request-sequence guard drops stale async loads during fast scrubbing.
 *
 * Because the LayerManager renders on its own deck.gl overlay rather than a
 * MapLibre source/layer keyed by {@link BaseAdapter.id}, this adapter overrides
 * {@link setVisible} and {@link remove} instead of relying on the base class.
 */
export class MosaicAdapter extends BaseAdapter {
  readonly spec: MosaicSourceSpec;

  private manager: MosaicLayerManager | null = null;
  private managerPromise: Promise<MosaicLayerManager> | null = null;
  /** Id of the currently rendered mosaic layer inside the LayerManager. */
  private rasterId: string | null = null;
  /** URL of the currently rendered mosaic, so an unchanged date is a no-op. */
  private currentUrl: string | null = null;
  private visible: boolean;
  private requestSeq = 0;
  private removed = false;
  /** Whether the view has been fitted to a mosaic yet (only the first add
   * zooms; later date steps must not hijack the user's view). */
  private fitted = false;
  /** Whether the map has been forced to mercator for this source yet. */
  private mercatorEnsured = false;

  /**
   * @param spec - The mosaic source specification (must carry an `id`).
   * @param ctx - Shared adapter context.
   */
  constructor(spec: MosaicSourceSpec & { id: string }, ctx: AdapterContext) {
    super(spec.id, { ...ctx, beforeId: spec.beforeId ?? ctx.beforeId }, spec.opacity ?? 1);
    this.spec = spec;
    this.visible = spec.visible ?? true;
  }

  /** Whether this source renders on the GPU (deck.gl) engine. */
  private get isGpuEngine(): boolean {
    return (this.spec.engine ?? 'gpu') === 'gpu';
  }

  /**
   * Creates the LayerManager on first use (lazy import + construction), reusing
   * it thereafter.
   *
   * @returns The shared LayerManager for this adapter.
   */
  private async ensureManager(): Promise<MosaicLayerManager> {
    if (this.manager) return this.manager;
    if (!this.managerPromise) {
      this.managerPromise = loadRasterModule().then((mod) => {
        // Guard against a remove() that landed while the module was loading.
        if (this.removed) throw new Error('MosaicAdapter removed before init');
        this.manager = new mod.LayerManager(this.map, {
          interleaved: true,
          engine: RASTER_ENGINE[this.spec.engine ?? 'gpu'],
        });
        return this.manager;
      });
    }
    return this.managerPromise;
  }

  /**
   * Builds the visualization-state overrides forwarded to `addRaster`. Opacity
   * and visibility always apply; colormap/bands/rescale are forwarded only when
   * given (auto-detection from the first asset handles the RGB common case).
   * Rescale is sized to the channel count only when it can be inferred, so a
   * mismatched window is never pushed onto an auto-detected band set.
   *
   * @returns Partial raster state for the mosaic layer.
   */
  private buildState(): Partial<MosaicRasterState> {
    const state: Partial<MosaicRasterState> = {
      opacity: this.opacity,
      visible: this.visible,
    };
    const { colormap, rescale, bidx, nodata } = this.spec;
    // Left unset when the spec omits it, so the renderer keeps its own 'auto'
    // default (honour the value each COG declares) rather than being pinned.
    if (nodata !== undefined) state.nodata = nodata;
    if (bidx && bidx.length > 0) {
      state.bands = bidx;
      state.mode = bidx.length >= 3 ? 'rgb' : 'single';
    }
    if (colormap) state.colormap = colormap;
    if (rescale) {
      // One window per rendered channel. bidx pins the count; a colormap implies
      // single-band. Without either, the band count is unknown until load, so
      // the window is left to auto-stretch rather than risk a length mismatch.
      const channels = bidx?.length ?? (colormap ? 1 : 0);
      if (channels > 0) {
        state.rescale = Array.from(
          { length: channels },
          () => [rescale[0], rescale[1]] as [number, number],
        );
      }
    }
    return state;
  }

  /**
   * Forces the map to a mercator projection. The deck.gl mosaic tiler cannot
   * compute tile bounding volumes in MapLibre's globe view (it throws
   * "getBoundingVolume in Globe view"), so a mosaic silently fails to draw while
   * the map is a globe. Switching to mercator — like every other deck.gl-backed
   * overlay does — is a correctness requirement, not a preference. Guarded and
   * error-swallowing because MapLibre rejects projection changes while the style
   * is still settling; an `idle` re-assert covers that window.
   */
  private ensureMercator(): void {
    const apply = (): void => {
      try {
        if (this.map.getProjection?.()?.type === 'mercator') return;
        this.map.setProjection?.({ type: 'mercator' });
      } catch {
        // The style is still settling; the idle re-assert below will retry.
      }
    };
    apply();
    this.map.once?.('idle', apply);
  }

  /**
   * Loads the mosaic for a date and swaps it in, dropping the result if a newer
   * load started meanwhile (stale scrub) or the adapter was removed.
   *
   * @param date - The timeline date to render.
   */
  private async render(date: Date): Promise<void> {
    this.lastDate = date;
    // The GPU (deck.gl) engine can't render under a globe view, so switch to
    // mercator before its first mosaic loads. The WASM engine renders through a
    // MapLibre raster source, which works in globe, so its projection is left
    // untouched.
    if (!this.mercatorEnsured && this.isGpuEngine) {
      this.mercatorEnsured = true;
      this.ensureMercator();
    }
    const url = await resolveUrl(this.spec.url, date);
    if (this.removed || url === this.currentUrl) return;
    const seq = ++this.requestSeq;
    const manager = await this.ensureManager();
    if (this.removed || seq !== this.requestSeq) return;

    const nextId = generateId(`${this.id}-mosaic`);
    try {
      await manager.addRaster(url, {
        id: nextId,
        name: this.spec.name ?? this.id,
        state: this.buildState(),
        // Fit the view to the first mosaic added, but never on later date steps.
        zoomTo: !this.fitted,
        beforeId: this.beforeId,
      });
    } catch (err) {
      // Drop the layer we optimistically created and keep the previous mosaic on
      // screen rather than throwing out of a scrub. Surface the reason (a failed
      // manifest fetch, a CORS block, or the WASM engine not being installed /
      // pre-bundled) so a blank map is diagnosable instead of silent.
      if (!this.removed && manager.getLayer(nextId)) manager.removeRaster(nextId);
      console.error(`[time-slider] mosaic failed to load: ${url}`, err);
      return;
    }
    // A newer date won the race, or we were torn down, while the manifest
    // loaded: discard this now-stale mosaic.
    if (this.removed || seq !== this.requestSeq) {
      if (manager.getLayer(nextId)) manager.removeRaster(nextId);
      return;
    }
    const previousId = this.rasterId;
    this.rasterId = nextId;
    this.currentUrl = url;
    this.fitted = true;
    if (previousId && manager.getLayer(previousId)) manager.removeRaster(previousId);
  }

  add(date: Date): Promise<void> {
    return this.render(date);
  }

  update(date: Date): Promise<void> {
    return this.render(date);
  }

  setOpacity(opacity: number): void {
    this.opacity = clamp(opacity, 0, 1);
    if (this.manager && this.rasterId && this.manager.getLayer(this.rasterId)) {
      this.manager.setState(this.rasterId, { opacity: this.opacity });
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (this.manager && this.rasterId && this.manager.getLayer(this.rasterId)) {
      this.manager.setVisible(this.rasterId, visible);
    }
  }

  remove(): void {
    this.removed = true;
    // A newer render() could still be mid-flight; bumping the sequence makes it
    // discard its result instead of re-adding a layer after teardown.
    this.requestSeq++;
    this.rasterId = null;
    this.currentUrl = null;
    this.manager?.destroy();
    this.manager = null;
    this.managerPromise = null;
  }
}
