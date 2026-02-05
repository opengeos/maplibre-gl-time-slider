import maplibregl from 'maplibre-gl';
import { TimeSliderControl } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import "maplibre-gl-layer-control/style.css";

import { LayerControl } from "maplibre-gl-layer-control";

// Earth Engine tile request endpoint
const EE_TILE_ENDPOINT = 'https://giswqs-ee-tile-request.hf.space/tile';

// Generate years from 2009 to 2023
const START_YEAR = 2009;
const END_YEAR = 2023;
const years = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);
const labels = years.map((year) => String(year));

// Cache for storing tile URLs
const tileUrlCache: Record<string, string> = {};

/**
 * Fetches tile URL from Earth Engine API for a given year
 */
async function fetchTileUrl(year: number): Promise<string> {
  const cacheKey = String(year);

  // Return cached URL if available
  if (tileUrlCache[cacheKey]) {
    console.log(`Using cached tile URL for year ${year}`);
    return tileUrlCache[cacheKey];
  }

  console.log(`Fetching tile URL for year ${year}...`);

  const payload = {
    asset_id: 'USDA/NAIP/DOQQ',
    start_date: `${year}-01-01`,
    end_date: `${year}-12-31`,
    vis_params: { bands: ['N', 'R', 'G'] },
  };

  try {
    const response = await fetch(EE_TILE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const tileUrl = data.tile_url;

    // Cache the URL
    tileUrlCache[cacheKey] = tileUrl;
    console.log(`Tile URL for year ${year} cached successfully`);

    return tileUrl;
  } catch (error) {
    console.error(`Error fetching tile URL for year ${year}:`, error);
    throw error;
  }
}

/**
 * Prefetch tile URLs for all years
 */
async function prefetchTileUrls(): Promise<void> {
  console.log('Prefetching tile URLs for all years...');
  const promises = years.map((year) => fetchTileUrl(year).catch((err) => {
    console.error(`Failed to prefetch year ${year}:`, err);
    return null;
  }));
  await Promise.all(promises);
  console.log('Prefetching complete');
}

// Show loading indicator
function showLoading(message: string) {
  const existingLoading = document.querySelector('.loading');
  if (existingLoading) {
    existingLoading.textContent = message;
    return;
  }

  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.innerHTML = `<span class="loading-spinner"></span>${message}`;
  document.body.appendChild(loading);
}

// Hide loading indicator
function hideLoading() {
  const loading = document.querySelector('.loading');
  if (loading) {
    loading.remove();
  }
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
  center: [-95, 38], // Center of USA
  zoom: 4,
});

// Add navigation controls
map.addControl(new maplibregl.NavigationControl(), 'top-right');

// Add fullscreen control
map.addControl(new maplibregl.FullscreenControl(), 'top-right');

const layerControl = new LayerControl({
  collapsed: true,
  panelWidth: 350,
  panelMinWidth: 240,
  panelMaxWidth: 450,
});

map.addControl(layerControl, "top-right");

// Source ID for the raster layer
const RASTER_SOURCE_ID = 'NAIP-raster';
const RASTER_LAYER_ID = 'NAIP-layer';

// Track persistent layers
let persistentLayerCounter = 0;
const persistentLayers: Array<{ id: string; year: number; sourceId: string }> = [];

// Add raster layer and time slider when map loads
map.on('load', async () => {
  try {
    // Show loading indicator
    showLoading('Loading initial imagery...');

    // Fetch the initial tile URL for the first year
    const initialTileUrl = await fetchTileUrl(years[0]);

    // Add the raster source with initial tile URL
    map.addSource(RASTER_SOURCE_ID, {
      type: 'raster',
      tiles: [initialTileUrl],
      tileSize: 256,
    });

    // Add the raster layer
    map.addLayer({
      id: RASTER_LAYER_ID,
      type: 'raster',
      source: RASTER_SOURCE_ID,
      paint: {
        'raster-opacity': 0.85,
      },
    });

    // Hide loading indicator
    hideLoading();

    // Create the time slider control
    const timeSlider = new TimeSliderControl({
      title: 'NAIP Imagery',
      labels: labels,
      speed: 1500,
      loop: true,
      collapsed: false,
      panelWidth: 320,
      // beforeId is not used here - we'll insert persistent layers directly before the time slider layer
      onChange: async (index) => {
        const year = years[index];
        console.log(`Displaying NAIP imagery for year: ${year}`);

        try {
          // Show loading indicator for year change
          showLoading(`Loading ${year} imagery...`);

          // Fetch the tile URL for the selected year (will use cache if available)
          const tileUrl = await fetchTileUrl(year);

          // Update the raster source with the new tile URL
          const source = map.getSource(RASTER_SOURCE_ID) as maplibregl.RasterTileSource;
          if (source) {
            source.setTiles([tileUrl]);
          }

          // Hide loading indicator
          hideLoading();
        } catch (error) {
          console.error(`Error loading imagery for year ${year}:`, error);
          hideLoading();
          alert(`Failed to load imagery for year ${year}. Please try again.`);
        }
      },
      onAddLayer: async (index, _label) => {
        const year = years[index];
        console.log(`Adding persistent layer for year: ${year}`);

        try {
          // Show loading indicator
          showLoading(`Adding ${year} layer...`);

          // Fetch the tile URL for the selected year
          const tileUrl = await fetchTileUrl(year);

          // Create unique IDs for the persistent layer with year
          persistentLayerCounter++;
          const sourceId = `NAIP-source-${year}`;
          const layerId = `NAIP Layer ${year}`;

          // Add the source
          map.addSource(sourceId, {
            type: 'raster',
            tiles: [tileUrl],
            tileSize: 256,
          });

          // Add the layer before the time slider layer so it appears beneath it
          map.addLayer(
            {
              id: layerId,
              type: 'raster',
              source: sourceId,
              paint: {
                'raster-opacity': 0.7,
              },
            },
            RASTER_LAYER_ID // Insert before the main time slider layer
          );

          // Track the persistent layer
          persistentLayers.push({ id: layerId, year, sourceId });

          console.log(`Added persistent layer: ${layerId} for year ${year}`);

          // Hide loading indicator
          hideLoading();

          // Show success message
          const message = document.createElement('div');
          message.style.cssText = `
            position: absolute;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(74, 144, 217, 0.95);
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            font-size: 14px;
            z-index: 1001;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          `;
          message.textContent = `Added ${year} as persistent layer`;
          document.body.appendChild(message);

          setTimeout(() => {
            message.remove();
          }, 3000);
        } catch (error) {
          console.error(`Error adding persistent layer for year ${year}:`, error);
          hideLoading();
          alert(`Failed to add layer for year ${year}. Please try again.`);
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

    console.log('NAIP time slider control added to map');

    // Prefetch tile URLs in the background
    prefetchTileUrls().catch((err) => {
      console.error('Error during prefetching:', err);
    });
  } catch (error) {
    console.error('Error initializing map:', error);
    hideLoading();
    alert('Failed to initialize the map. Please refresh the page.');
  }
});
