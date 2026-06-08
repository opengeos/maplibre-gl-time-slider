import maplibregl from 'maplibre-gl';
import { TimeSliderControl } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

// Create map
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
  center: [-100, 40],
  zoom: 3,
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.FullscreenControl(), 'top-right');
map.addControl(new maplibregl.GlobeControl(), 'top-right');

map.on('load', () => {
  // NASA PACE chlorophyll-a daily COGs. The COG URL embeds the date directly,
  // so a single token template drives the whole time series.
  const timeSlider = new TimeSliderControl({
    startDate: '2024-04-18',
    endDate: '2024-10-03',
    granularity: 'day',
    sources: [
      {
        type: 'cog',
        id: 'pace-chla',
        name: 'PACE Chlorophyll-a',
        url: 'https://github.com/opengeos/pace-data/releases/download/chla/chla_{date:YYYY-MM-DD}.tif',
        colormap: 'jet',
        rescale: [0, 1],
        nodata: 'nan',
        opacity: 0.8,
      },
    ],
    onChange: (date) => console.log('PACE chlorophyll-a:', date.toISOString().slice(0, 10)),
  });

  map.addControl(timeSlider, 'bottom-left');
});
