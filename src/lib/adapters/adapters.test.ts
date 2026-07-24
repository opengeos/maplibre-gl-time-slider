import { describe, it, expect, vi, afterEach } from 'vitest';
import { createStubMap } from '../../../tests/stubMap';
import { CogAdapter } from './CogAdapter';
import { XyzAdapter } from './XyzAdapter';
import { WmsAdapter } from './WmsAdapter';
import { GeoJsonAdapter, buildTimeFilter } from './GeoJsonAdapter';
import { createAdapter } from './registry';
import { addUnits } from '../time/granularity';

const d1 = new Date('2024-04-18T00:00:00Z');
const d2 = new Date('2024-04-19T00:00:00Z');

// The COG adapter probes TiTiler for each date's availability; stub it "found"
// by default so tile-building tests don't touch the network.
function stubTiTilerFound(): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CogAdapter', () => {
  it('builds a TiTiler raster source/layer and re-tiles on update', async () => {
    stubTiTilerFound();
    const { map, sources } = createStubMap();
    const adapter = new CogAdapter(
      {
        type: 'cog',
        id: 'c1',
        url: 'https://e/{YYYY}-{MM}-{DD}.tif',
        colormap: 'jet',
        rescale: [0, 1],
      },
      { map }
    );
    await adapter.add(d1);

    expect(map.addSource).toHaveBeenCalledTimes(1);
    const srcArg = (map.addSource as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(srcArg.type).toBe('raster');
    expect(srcArg.tiles[0]).toContain('colormap_name=jet');
    expect(srcArg.tiles[0]).toContain('rescale=0%2C1');
    expect(srcArg.tiles[0]).toContain(encodeURIComponent('https://e/2024-04-18.tif'));
    expect(map.addLayer).toHaveBeenCalledTimes(1);

    await adapter.update(d2);
    const setTiles = sources.get('c1')!.setTiles;
    expect(setTiles).toHaveBeenCalledTimes(1);
    expect(setTiles.mock.calls[0][0][0]).toContain(encodeURIComponent('https://e/2024-04-19.tif'));
  });

  it('re-renders the current date when colormap changes via setProperty', async () => {
    stubTiTilerFound();
    const { map, sources } = createStubMap();
    const adapter = new CogAdapter({ type: 'cog', id: 'c2', url: 'https://e/x.tif' }, { map });
    await adapter.add(d1);
    await adapter.setProperty({ colormap: 'viridis' } as never);
    expect(sources.get('c2')!.setTiles.mock.calls[0][0][0]).toContain('colormap_name=viridis');
  });

  it('signals no data and skips tiling when TiTiler cannot find the date COG', async () => {
    // TiTiler responds non-OK (the COG for this date does not exist).
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const { map } = createStubMap();
    const status: boolean[] = [];
    const adapter = new CogAdapter(
      { type: 'cog', id: 'c-missing', url: 'https://e/{YYYY}-{MM}-{DD}.tif' },
      { map, onDataStatus: (_id, available) => status.push(available) }
    );
    await adapter.add(d1);

    // No raster source was added for the missing date, and "no data" was reported.
    expect(map.addSource).not.toHaveBeenCalled();
    expect(status).toEqual([false]);

    // Scrubbing back to the same missing date does not re-probe (cached).
    const fetchSpy = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchSpy.mockClear();
    await adapter.update(d1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('XyzAdapter', () => {
  it('substitutes date tokens but preserves {z}/{x}/{y}', async () => {
    const { map, sources } = createStubMap();
    const adapter = new XyzAdapter(
      { type: 'xyz', id: 'x1', tiles: 'https://t/{z}/{x}/{y}.png?d={YYYY}-{MM}-{DD}' },
      { map }
    );
    await adapter.add(d1);
    const srcArg = (map.addSource as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(srcArg.tiles[0]).toBe('https://t/{z}/{x}/{y}.png?d=2024-04-18');

    await adapter.update(d2);
    expect(sources.get('x1')!.setTiles.mock.calls[0][0][0]).toBe(
      'https://t/{z}/{x}/{y}.png?d=2024-04-19'
    );
  });

  it('sets raster opacity', async () => {
    const { map } = createStubMap();
    const adapter = new XyzAdapter(
      { type: 'xyz', id: 'x2', tiles: 'https://t/{z}/{x}/{y}.png' },
      { map }
    );
    await adapter.add(d1);
    adapter.setOpacity(0.4);
    expect(map.setPaintProperty).toHaveBeenCalledWith('x2', 'raster-opacity', 0.4);
  });

  it('passes bounds to the raster source when provided', async () => {
    const { map } = createStubMap();
    const bounds: [number, number, number, number] = [-74.7, -8.6, -74.2, -8.3];
    const adapter = new XyzAdapter(
      { type: 'xyz', id: 'xb', tiles: 'https://t/{z}/{x}/{y}.png', bounds },
      { map }
    );
    await adapter.add(d1);
    const srcArg = (map.addSource as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(srcArg.bounds).toEqual(bounds);
  });

  it('toggles layer visibility via the visibility layout property', async () => {
    const { map } = createStubMap();
    const adapter = new XyzAdapter(
      { type: 'xyz', id: 'x3', tiles: 'https://t/{z}/{x}/{y}.png' },
      { map }
    );
    await adapter.add(d1);
    adapter.setVisible(false);
    expect(map.setLayoutProperty).toHaveBeenCalledWith('x3', 'visibility', 'none');
    adapter.setVisible(true);
    expect(map.setLayoutProperty).toHaveBeenCalledWith('x3', 'visibility', 'visible');
  });
});

describe('WmsAdapter', () => {
  it('appends layers and a TIME parameter', async () => {
    const { map } = createStubMap();
    const adapter = new WmsAdapter(
      { type: 'wms', id: 'w1', baseUrl: 'https://wms?service=WMS', layers: 'temp' },
      { map }
    );
    await adapter.add(d1);
    const tiles = (map.addSource as ReturnType<typeof vi.fn>).mock.calls[0][1].tiles[0];
    expect(tiles).toBe('https://wms?service=WMS&layers=temp&TIME=2024-04-18');
  });

  it('honors a custom timeFormat', async () => {
    const { map, sources } = createStubMap();
    const adapter = new WmsAdapter(
      { type: 'wms', id: 'w2', baseUrl: 'https://wms', timeFormat: 'YYYY/MM/DD' },
      { map }
    );
    await adapter.add(d1);
    await adapter.update(d2);
    expect(sources.get('w2')!.setTiles.mock.calls[0][0][0]).toBe('https://wms?TIME=2024%2F04%2F19');
  });
});

describe('buildTimeFilter', () => {
  it('builds a [lower, upper) range around the date', () => {
    const filter = buildTimeFilter('time', d1, { unit: 'month' });
    expect(filter).toEqual([
      'all',
      ['>=', ['to-number', ['get', 'time']], d1.getTime()],
      ['<', ['to-number', ['get', 'time']], addUnits(d1, 'month', 1).getTime()],
    ]);
  });
});

describe('GeoJsonAdapter', () => {
  it('adds a filtered layer and re-filters on update', () => {
    const { map } = createStubMap();
    const adapter = new GeoJsonAdapter(
      {
        type: 'geojson',
        id: 'g1',
        data: 'https://x.geojson',
        timeProperty: 'time',
        window: { unit: 'day' },
      },
      { map }
    );
    adapter.add(d1);
    expect(map.addSource).toHaveBeenCalledWith('g1', {
      type: 'geojson',
      data: 'https://x.geojson',
    });
    const layerArg = (map.addLayer as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(layerArg.type).toBe('circle');
    expect(layerArg.filter).toBeDefined();

    adapter.update(d2);
    expect(map.setFilter).toHaveBeenCalledWith('g1', buildTimeFilter('time', d2, { unit: 'day' }));
  });

  it('applies a visible default circle style when no paint is given', () => {
    const { map } = createStubMap();
    const adapter = new GeoJsonAdapter(
      { type: 'geojson', id: 'g2', data: 'https://x.geojson', timeProperty: 'time' },
      { map }
    );
    adapter.add(d1);
    const layerArg = (map.addLayer as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(layerArg.paint['circle-radius']).toBe(6);
    expect(layerArg.paint['circle-color']).toBe('#ff5533');
    expect(layerArg.paint['circle-opacity']).toBe(1);
  });

  it('lets a spec override the default paint', () => {
    const { map } = createStubMap();
    const adapter = new GeoJsonAdapter(
      {
        type: 'geojson',
        id: 'g3',
        data: 'https://x.geojson',
        timeProperty: 'time',
        paint: { circle: { 'circle-color': '#000' } },
      },
      { map }
    );
    adapter.add(d1);
    const layerArg = (map.addLayer as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(layerArg.paint['circle-color']).toBe('#000');
  });
});

describe('createAdapter', () => {
  it('dispatches by type and generates ids', () => {
    const { map } = createStubMap();
    const cog = createAdapter({ type: 'cog', url: 'https://e/x.tif' }, { map });
    expect(cog).toBeInstanceOf(CogAdapter);
    expect(cog.id).toMatch(/^ts-layer-/);
  });

  it('resolves custom sources to an inner adapter', async () => {
    const { map } = createStubMap();
    const adapter = createAdapter(
      {
        type: 'custom',
        id: 'cust',
        resolve: (date) => ({
          type: 'xyz',
          tiles: `https://t/{z}/{x}/{y}.png?y=${date.getUTCFullYear()}`,
        }),
      },
      { map }
    );
    await adapter.add(d1);
    const srcArg = (map.addSource as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(srcArg.tiles[0]).toBe('https://t/{z}/{x}/{y}.png?y=2024');
  });

  it('rebuilds the inner adapter when a custom source changes type', async () => {
    const { map } = createStubMap();
    const adapter = createAdapter(
      {
        type: 'custom',
        id: 'cust2',
        resolve: (date) =>
          date.getUTCDate() === 18
            ? { type: 'xyz', tiles: 'https://t/{z}/{x}/{y}.png' }
            : { type: 'geojson', data: 'https://x.geojson', timeProperty: 'time' },
      },
      { map }
    );
    await adapter.add(d1); // xyz
    expect((map.addSource as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1].type).toBe('raster');
    await adapter.update(d2); // -> geojson
    expect(map.removeLayer).toHaveBeenCalledWith('cust2');
    expect((map.addSource as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1].type).toBe('geojson');
  });

  it('throws on an unsupported source type', () => {
    const { map } = createStubMap();
    expect(() => createAdapter({ type: 'bogus' } as never, { map })).toThrow(
      /Unsupported source type/
    );
  });
});
