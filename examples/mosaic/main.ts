import maplibregl from 'maplibre-gl';
import { TimeSliderControl } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

// Monthly Sentinel-2 true-color mosaics over the French Alps (2024-05 .. 2024-09),
// one STAC FeatureCollection per month. The manifest URL embeds the month via
// `{date:YYYY}` / `{date:MM}` tokens, so a single template drives the whole
// series at month granularity. Each manifest lists the covering Sentinel-2 COGs,
// which are stitched into a single deck.gl mosaic for that month.
const MOSAIC_URL =
  'https://data.source.coop/giswqs/opengeos/s2_mosaic_ts/s2_{date:YYYY}_{date:MM}.json';

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
  center: [6.2, 45.5],
  zoom: 8,
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.FullscreenControl(), 'top-right');

map.on('load', () => {
  // A `mosaic` source renders each date's manifest (a MosaicJSON or STAC
  // FeatureCollection of many COGs) as one deck.gl spatial mosaic, delegated to
  // `maplibre-gl-raster` (an optional peer, loaded lazily on first use). Adding
  // it fits the view to the first mosaic and switches the map to a mercator
  // projection — the deck.gl tiler cannot render under MapLibre's globe view.
  //
  // The imagery is 3-band true-color (visual/TCI), so it auto-renders as RGB
  // with no colormap or rescale needed. Stepping the timeline swaps the whole
  // manifest, so each month is a full mosaic of that month's scenes.
  const timeSlider = new TimeSliderControl({
    startDate: '2024-05-01',
    endDate: '2024-09-01',
    granularity: 'month',
    granularities: ['month'],
    speed: 1000,
    sources: [
      {
        type: 'mosaic',
        id: 's2-mosaic-ts',
        name: 'Sentinel-2 Monthly Mosaic',
        url: MOSAIC_URL,
      },
    ],
    onChange: (date) => console.log('Sentinel-2 month:', date.toISOString().slice(0, 7)),
  });

  map.addControl(timeSlider, 'bottom-left');
});
