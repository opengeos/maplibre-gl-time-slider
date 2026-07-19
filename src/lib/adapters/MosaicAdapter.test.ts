import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStubMap } from '../../../tests/stubMap';
import { MosaicAdapter } from './MosaicAdapter';
import { createAdapter } from './registry';
import type { MosaicSourceSpec } from '../core/types';

/**
 * A fake `maplibre-gl-raster` LayerManager that records every call and keeps a
 * live set of layer ids so `getLayer` reflects add/remove, without any real
 * deck.gl rendering.
 */
class FakeLayerManager {
  static instances: FakeLayerManager[] = [];
  readonly options: unknown;
  readonly ids = new Set<string>();
  addCalls: { source: string; options: Record<string, unknown> }[] = [];
  removed: string[] = [];
  stateCalls: { id: string; patch: Record<string, unknown> }[] = [];
  visibleCalls: { id: string; visible: boolean }[] = [];
  destroyed = false;

  constructor(_map: unknown, options?: unknown) {
    this.options = options;
    FakeLayerManager.instances.push(this);
  }

  async addRaster(source: string, options: Record<string, unknown> = {}): Promise<string> {
    const id = (options.id as string) ?? `raster-${this.addCalls.length}`;
    this.addCalls.push({ source, options });
    this.ids.add(id);
    return id;
  }

  removeRaster(id: string): void {
    this.removed.push(id);
    this.ids.delete(id);
  }

  setState(id: string, patch: Record<string, unknown>): void {
    this.stateCalls.push({ id, patch });
  }

  setVisible(id: string, visible: boolean): void {
    this.visibleCalls.push({ id, visible });
  }

  getLayer(id: string): unknown {
    return this.ids.has(id) ? { id } : undefined;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

vi.mock('maplibre-gl-raster', () => ({ LayerManager: FakeLayerManager }));

const d1 = new Date('2024-05-15T00:00:00Z');
const d2 = new Date('2024-06-15T00:00:00Z');

/** The LayerManager instance the adapter created (the most recent). */
function lastManager(): FakeLayerManager {
  return FakeLayerManager.instances[FakeLayerManager.instances.length - 1];
}

beforeEach(() => {
  FakeLayerManager.instances = [];
});

describe('MosaicAdapter', () => {
  it('loads the date-resolved mosaic manifest and fits the view on first add', async () => {
    const { map } = createStubMap();
    const adapter = new MosaicAdapter(
      { type: 'mosaic', id: 'm1', url: 'https://e/{YYYY}_{MM}.json' },
      { map }
    );
    await adapter.add(d1);

    const mgr = lastManager();
    expect(mgr.addCalls).toHaveLength(1);
    expect(mgr.addCalls[0].source).toBe('https://e/2024_05.json');
    expect(mgr.addCalls[0].options.zoomTo).toBe(true);
    const state = mgr.addCalls[0].options.state as Record<string, unknown>;
    expect(state.opacity).toBe(1);
    expect(state.visible).toBe(true);
  });

  it('swaps to the new manifest on a date change and removes the previous one', async () => {
    const { map } = createStubMap();
    const adapter = new MosaicAdapter(
      { type: 'mosaic', id: 'm2', url: 'https://e/{YYYY}_{MM}.json' },
      { map }
    );
    await adapter.add(d1);
    await adapter.update(d2);

    const mgr = lastManager();
    expect(mgr.addCalls.map((c) => c.source)).toEqual([
      'https://e/2024_05.json',
      'https://e/2024_06.json',
    ]);
    // The second add does not re-fit the view.
    expect(mgr.addCalls[1].options.zoomTo).toBe(false);
    // The first mosaic layer was removed once the second loaded.
    const firstId = mgr.addCalls[0].options.id as string;
    expect(mgr.removed).toContain(firstId);
  });

  it('is a no-op when the resolved URL is unchanged', async () => {
    const { map } = createStubMap();
    const adapter = new MosaicAdapter(
      { type: 'mosaic', id: 'm3', url: 'https://e/static.json' },
      { map }
    );
    await adapter.add(d1);
    await adapter.update(d2);
    expect(lastManager().addCalls).toHaveLength(1);
  });

  it('forwards opacity and visibility changes to the active layer', async () => {
    const { map } = createStubMap();
    const adapter = new MosaicAdapter(
      { type: 'mosaic', id: 'm4', url: 'https://e/{YYYY}_{MM}.json' },
      { map }
    );
    await adapter.add(d1);
    adapter.setOpacity(0.5);
    adapter.setVisible(false);

    const mgr = lastManager();
    expect(mgr.stateCalls.at(-1)?.patch).toEqual({ opacity: 0.5 });
    expect(mgr.visibleCalls.at(-1)?.visible).toBe(false);
  });

  it('maps bidx to single-band mode and sizes rescale to the band count', async () => {
    const { map } = createStubMap();
    const adapter = new MosaicAdapter(
      {
        type: 'mosaic',
        id: 'm5',
        url: 'https://e/{YYYY}_{MM}.json',
        bidx: [1],
        colormap: 'viridis',
        rescale: [0, 3000],
      },
      { map }
    );
    await adapter.add(d1);
    const state = lastManager().addCalls[0].options.state as Record<string, unknown>;
    expect(state.mode).toBe('single');
    expect(state.bands).toEqual([1]);
    expect(state.colormap).toBe('viridis');
    expect(state.rescale).toEqual([[0, 3000]]);
  });

  it('omits rescale when the channel count cannot be inferred', async () => {
    const { map } = createStubMap();
    const adapter = new MosaicAdapter(
      { type: 'mosaic', id: 'm6', url: 'https://e/{YYYY}_{MM}.json', rescale: [0, 1] },
      { map }
    );
    await adapter.add(d1);
    const state = lastManager().addCalls[0].options.state as Record<string, unknown>;
    expect(state.rescale).toBeUndefined();
  });

  it('tears down the LayerManager on remove and drops a late in-flight load', async () => {
    const { map } = createStubMap();
    const adapter = new MosaicAdapter(
      { type: 'mosaic', id: 'm7', url: 'https://e/{YYYY}_{MM}.json' },
      { map }
    );
    await adapter.add(d1);
    const mgr = lastManager();

    // A scrub that started before removal must not re-add after teardown.
    const pending = adapter.update(d2);
    adapter.remove();
    await pending;

    expect(mgr.destroyed).toBe(true);
  });

  it('defaults to the gpu engine and forces mercator (deck.gl cannot render in globe)', async () => {
    const { map } = createStubMap();
    const setProjection = vi.fn();
    Object.assign(map, {
      getProjection: vi.fn(() => ({ type: 'globe' })),
      setProjection,
      once: vi.fn(),
    });
    const adapter = new MosaicAdapter(
      { type: 'mosaic', id: 'm8', url: 'https://e/{YYYY}_{MM}.json' },
      { map }
    );
    await adapter.add(d1);
    expect(lastManager().options).toMatchObject({ engine: 'maplibre-gl-raster' });
    expect(setProjection).toHaveBeenCalledWith({ type: 'mercator' });
  });

  it('uses the cog-tiler-wasm engine and leaves globe untouched when engine=wasm', async () => {
    const { map } = createStubMap();
    const setProjection = vi.fn();
    Object.assign(map, {
      getProjection: vi.fn(() => ({ type: 'globe' })),
      setProjection,
      once: vi.fn(),
    });
    const adapter = new MosaicAdapter(
      { type: 'mosaic', id: 'm8w', url: 'https://e/{YYYY}_{MM}.json', engine: 'wasm' },
      { map }
    );
    await adapter.add(d1);
    expect(lastManager().options).toMatchObject({ engine: 'cog-tiler-wasm' });
    // The WASM engine renders through a MapLibre raster source, which works in
    // globe, so the projection must NOT be forced to mercator.
    expect(setProjection).not.toHaveBeenCalled();
  });

  it('leaves an already-mercator map untouched', async () => {
    const { map } = createStubMap();
    const setProjection = vi.fn();
    Object.assign(map, {
      getProjection: vi.fn(() => ({ type: 'mercator' })),
      setProjection,
      once: vi.fn(),
    });
    const adapter = new MosaicAdapter(
      { type: 'mosaic', id: 'm9', url: 'https://e/{YYYY}_{MM}.json' },
      { map }
    );
    await adapter.add(d1);
    expect(setProjection).not.toHaveBeenCalled();
  });

  it('is constructed by the registry for a mosaic spec', () => {
    const { map } = createStubMap();
    const spec: MosaicSourceSpec = { type: 'mosaic', url: 'https://e/{YYYY}.json' };
    const adapter = createAdapter(spec, { map });
    expect(adapter).toBeInstanceOf(MosaicAdapter);
    expect(adapter.id).toBeTruthy();
  });
});
