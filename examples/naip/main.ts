import maplibregl from 'maplibre-gl';
import { TimeSliderControl } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

// Annual NAIP aerial imagery over North Dakota (2014 .. 2023), one STAC
// FeatureCollection per year. The manifest URL embeds the year via a
// `{date:YYYY}` token, so a single template drives the whole series at year
// granularity. Each manifest lists that year's covering NAIP COGs, which are
// stitched into a single mosaic for the date.
const MOSAIC_URL =
  'https://data.source.coop/giswqs/opengeos/naip_nd_{date:YYYY}_stac.json';

// A light basemap so the true-color imagery stands out against it.
const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles: ['https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      },
    },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap', minzoom: 0, maxzoom: 20 }],
  },
  // Rough starting view; the mosaic source fits the view to its extent on add.
  center: [-99.16, 47.03],
  zoom: 10,
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.FullscreenControl(), 'top-right');
// A globe toggle: this example uses the WASM engine, which renders through a
// MapLibre raster source and so works in globe as well as mercator.
map.addControl(new maplibregl.GlobeControl(), 'top-right');

map.on('load', () => {
  // A `mosaic` source renders each date's manifest (a MosaicJSON or STAC
  // FeatureCollection of many COGs) as one mosaic, delegated to
  // `maplibre-gl-raster` (an optional peer, loaded lazily on first use). This
  // example uses the `wasm` engine (`cog-tiler-wasm`), which composites tiles on
  // the CPU into a MapLibre raster source, so it renders in globe as well as
  // mercator — toggle the globe control to see it hold up either way.
  //
  // NAIP is 4-band (R, G, B, NIR), so `bidx` pins the first three to render
  // true color; left to auto-detect, the fourth band would be along for the
  // ride. Stepping the timeline swaps the whole manifest, so each year is a
  // full mosaic of that year's flight.
  const timeSlider = new TimeSliderControl({
    startDate: '2014-01-01',
    endDate: '2023-01-01',
    granularity: 'year',
    granularities: ['year'],
    speed: 1000,
    sources: [
      {
        type: 'mosaic',
        id: 'naip-nd-ts',
        name: 'NAIP Annual Imagery',
        url: MOSAIC_URL,
        engine: 'wasm',
        bidx: [1, 2, 3],
      },
    ],
    onChange: (date) => console.log('NAIP year:', date.getUTCFullYear()),
  });

  map.addControl(timeSlider, 'bottom-left');
});
