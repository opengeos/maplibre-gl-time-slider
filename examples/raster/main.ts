import maplibregl from 'maplibre-gl';
import { TimeSliderControl, buildTiTilerTileUrl, getTiTilerBounds } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

// NASA OPERA Displacement data - San Francisco area
const rasterData: Record<string, string> = {
  '2016-09-03':
    'https://huggingface.co/datasets/giswqs/NASA-OPERA/resolve/main/SanFrancisco_OPERA-DISP-S1/displacement_20160810_20160903.tif',
  '2016-09-27':
    'https://huggingface.co/datasets/giswqs/NASA-OPERA/resolve/main/SanFrancisco_OPERA-DISP-S1/displacement_20160810_20160927.tif',
  '2016-10-21':
    'https://huggingface.co/datasets/giswqs/NASA-OPERA/resolve/main/SanFrancisco_OPERA-DISP-S1/displacement_20160810_20161021.tif',
  '2016-11-14':
    'https://huggingface.co/datasets/giswqs/NASA-OPERA/resolve/main/SanFrancisco_OPERA-DISP-S1/displacement_20160810_20161114.tif',
  '2016-12-08':
    'https://huggingface.co/datasets/giswqs/NASA-OPERA/resolve/main/SanFrancisco_OPERA-DISP-S1/displacement_20160810_20161208.tif',
};

const labels = Object.keys(rasterData);
const urls = Object.values(rasterData);

// TiTiler configuration
const TITILER_ENDPOINT = 'https://giswqs-titiler-endpoint.hf.space';

// Create the initial tile URL
function createTileUrl(cogUrl: string): string {
  return buildTiTilerTileUrl({
    url: cogUrl,
    endpoint: TITILER_ENDPOINT,
    colormap: 'viridis',
    rescale: [-0.05, 0.05], // Displacement values typically in meters
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
        attribution: '&copy; OpenStreetMap contributors',
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
  center: [-122.4, 37.75],
  zoom: 9,
});

// Add navigation controls
map.addControl(new maplibregl.NavigationControl(), 'top-right');

// Add fullscreen control
map.addControl(new maplibregl.FullscreenControl(), 'top-right');

// Source ID for the raster layer
const RASTER_SOURCE_ID = 'displacement-raster';
const RASTER_LAYER_ID = 'displacement-layer';

// Add raster layer and time slider when map loads
map.on('load', async () => {
  // Try to get bounds from the first COG
  try {
    const bounds = await getTiTilerBounds(urls[0], TITILER_ENDPOINT);
    map.fitBounds(bounds as maplibregl.LngLatBoundsLike, { padding: 50 });
  } catch (e) {
    console.warn('Could not fetch bounds, using default view:', e);
  }

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
      console.log(`Displaying data for: ${label} (index: ${index})`);

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

  console.log('Time slider control added to map');
});
