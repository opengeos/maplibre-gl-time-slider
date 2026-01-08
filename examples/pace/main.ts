import maplibregl from 'maplibre-gl';
import { TimeSliderControl, buildTiTilerTileUrl } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

// NASA PACE Chlorophyll-a data
const rasterData: Record<string, string> = {
  '2024-04-18':
    'https://github.com/opengeos/pace-data/releases/download/chla/chla_2024-04-18.tif',
  '2024-04-19':
    'https://github.com/opengeos/pace-data/releases/download/chla/chla_2024-04-19.tif',
  '2024-04-20':
    'https://github.com/opengeos/pace-data/releases/download/chla/chla_2024-04-20.tif',
  '2024-04-21':
    'https://github.com/opengeos/pace-data/releases/download/chla/chla_2024-04-21.tif',
  '2024-04-22':
    'https://github.com/opengeos/pace-data/releases/download/chla/chla_2024-04-22.tif',
};

const labels = Object.keys(rasterData);
const urls = Object.values(rasterData);

// TiTiler configuration
const TITILER_ENDPOINT = 'https://titiler.xyz';

// Create the initial tile URL
function createTileUrl(cogUrl: string): string {
  return buildTiTilerTileUrl({
    url: cogUrl,
    endpoint: TITILER_ENDPOINT,
    colormap: 'jet',
    rescale: [0, 1], // Chlorophyll-a concentration
  });
}

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
    layers: [
      {
        id: 'osm',
        type: 'raster',
        source: 'osm',
        minzoom: 0,
        maxzoom: 19,
      },
    ],
  },
  center: [0, 0],
  zoom: 1,
});

// Add navigation controls
map.addControl(new maplibregl.NavigationControl(), 'top-right');

// Add fullscreen control
map.addControl(new maplibregl.FullscreenControl(), 'top-right');

// Add globe control
map.addControl(new maplibregl.GlobeControl(), 'top-right');

// Source ID for the raster layer
const RASTER_SOURCE_ID = 'pace-chla-raster';
const RASTER_LAYER_ID = 'pace-chla-layer';

// Add raster layer and time slider when map loads
map.on('load', () => {
  // Add the raster source with initial tile URL
  map.addSource(RASTER_SOURCE_ID, {
    type: 'raster',
    tiles: [createTileUrl(urls[0])],
    tileSize: 256,
  });

  // Add the raster layer
  map.addLayer({
    id: RASTER_LAYER_ID,
    type: 'raster',
    source: RASTER_SOURCE_ID,
    paint: {
      'raster-opacity': 0.8,
    },
  });

  // Create the time slider control
  const timeSlider = new TimeSliderControl({
    title: 'Time Slider',
    labels: labels,
    speed: 1000,
    loop: true,
    collapsed: false,
    panelWidth: 320,
    onChange: (index, label) => {
      console.log(`Displaying PACE data for: ${label} (index: ${index})`);

      // Update the raster source with the new tile URL
      const source = map.getSource(RASTER_SOURCE_ID) as maplibregl.RasterTileSource;
      if (source) {
        const newTileUrl = createTileUrl(urls[index]);
        source.setTiles([newTileUrl]);
      }
    },
  });

  // Add the time slider control to the map
  map.addControl(timeSlider, 'top-right');

  // Listen for events
  timeSlider.on('play', () => {
    console.log('Playback started');
  });

  timeSlider.on('pause', () => {
    console.log('Playback paused');
  });

  timeSlider.on('change', (event) => {
    console.log('Time changed:', event.state.currentIndex);
  });

  console.log('PACE chlorophyll-a time slider control added to map');
});
