import maplibregl from 'maplibre-gl';
import { TimeSliderControl } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

// NASA GIBS (Global Imagery Browse Services) is the imagery backend behind NASA
// Worldview. Its time-enabled WMTS layers expose a REST tile URL whose path
// embeds the date, so the time slider only has to swap a `{date:YYYY-MM-DD}`
// token to scrub through daily global imagery.
//
// REST template (EPSG:3857 / Web Mercator):
//   .../best/{Layer}/default/{Time}/{TileMatrixSet}/{z}/{y}/{x}.{ext}
// GIBS orders the tile path as {TileMatrix}/{TileRow}/{TileCol}, which is
// {z}/{y}/{x} in MapLibre's placeholder terms.
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';

const GIBS_ATTRIBUTION =
  'Imagery courtesy of <a href="https://earthdata.nasa.gov/gibs" target="_blank">NASA EOSDIS GIBS</a>';

// MODIS Terra Corrected Reflectance (True Color) — Worldview's signature daily
// global view, available from 2000-02-24 to the present. Only the date segment
// changes per step; MapLibre fills in {z}/{x}/{y}.
const trueColorTiles =
  `${GIBS}/MODIS_Terra_CorrectedReflectance_TrueColor` +
  '/default/{date:YYYY-MM-DD}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg';

// Static coastlines/borders reference overlay (no time dimension) drawn on top
// of the imagery for the classic Worldview look.
const coastlinesTiles = `${GIBS}/Coastlines_15m/default/GoogleMapsCompatible_Level13/{z}/{y}/{x}.png`;

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      coastlines: {
        type: 'raster',
        tiles: [coastlinesTiles],
        tileSize: 256,
        attribution: GIBS_ATTRIBUTION,
      },
    },
    layers: [
      // Dark backdrop shows through at the poles and any missing tiles.
      { id: 'background', type: 'background', paint: { 'background-color': '#0b1a2b' } },
      { id: 'coastlines', type: 'raster', source: 'coastlines' },
    ],
  },
  center: [0, 20],
  zoom: 2,
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.FullscreenControl(), 'top-right');

map.on('load', () => {
  // The GIBS layer is a plain XYZ/WMTS source: the date lives in the URL path,
  // so a token template (no per-step fetch) is enough. `beforeId` keeps the
  // imagery beneath the static coastlines overlay.
  const timeSlider = new TimeSliderControl({
    startDate: '2023-08-01',
    endDate: '2023-08-31',
    initialDate: '2023-08-15',
    granularity: 'day',
    granularities: ['day'],
    speed: 600,
    beforeId: 'coastlines',
    sources: [
      {
        type: 'xyz',
        id: 'modis-terra-truecolor',
        name: 'MODIS Terra True Color',
        tiles: trueColorTiles,
        tileSize: 256,
        attribution: GIBS_ATTRIBUTION,
      },
    ],
    onChange: (date) => console.log('GIBS date:', date.toISOString().slice(0, 10)),
  });

  map.addControl(timeSlider, 'bottom-left');
});
