import maplibregl from 'maplibre-gl';
import { TimeSliderControl, getTiTilerBounds, formatDate } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

// NASA OPERA displacement COGs (San Francisco). All share a fixed reference date
// (20160810) in the filename; only the end date changes, on a 24-day cadence.
const COG_PREFIX =
  'https://huggingface.co/datasets/giswqs/NASA-OPERA/resolve/main/SanFrancisco_OPERA-DISP-S1/displacement_20160810_';
const cogUrl = (date: Date): string => `${COG_PREFIX}${formatDate(date, 'YYYYMMDD')}.tif`;

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'],
        tileSize: 256,
        attribution: '&copy; Google',
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm', minzoom: 0, maxzoom: 19 }],
  },
  center: [-122.4, 37.75],
  zoom: 9,
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.FullscreenControl(), 'top-right');

map.on('load', async () => {
  try {
    const bounds = await getTiTilerBounds(cogUrl(new Date('2016-09-03T00:00:00Z')));
    map.fitBounds(bounds as maplibregl.LngLatBoundsLike, { padding: 50 });
  } catch (e) {
    console.warn('Could not fetch bounds, using default view:', e);
  }

  const timeSlider = new TimeSliderControl({
    startDate: '2016-09-03',
    endDate: '2016-12-08',
    interval: 24, // 24-day acquisition cadence
    granularity: 'day',
    sources: [
      {
        type: 'cog',
        engine: 'gpu',
        id: 'opera-displacement',
        name: 'OPERA Displacement',
        url: cogUrl, // resolver function (fixed reference date + variable end date)
        colormap: 'viridis',
        rescale: [-0.05, 0.05],
        opacity: 0.8,
      },
    ],
    onChange: (date) => console.log('Displacement:', date.toISOString().slice(0, 10)),
  });

  map.addControl(timeSlider, 'bottom-left');
});
