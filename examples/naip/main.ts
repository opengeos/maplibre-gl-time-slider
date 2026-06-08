import maplibregl from 'maplibre-gl';
import { TimeSliderControl } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

// Earth Engine tile request endpoint (returns an XYZ template per year).
const EE_TILE_ENDPOINT = 'https://giswqs-ee-tile-request.hf.space/tile';
const START_YEAR = 2009;
const END_YEAR = 2023;

// Cache resolved tile templates by year.
const tileUrlCache: Record<number, string> = {};

/**
 * Fetches (and caches) the XYZ tile template for a given NAIP year.
 */
async function fetchTileUrl(year: number): Promise<string> {
  if (tileUrlCache[year]) return tileUrlCache[year];

  const response = await fetch(EE_TILE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      asset_id: 'USDA/NAIP/DOQQ',
      start_date: `${year}-01-01`,
      end_date: `${year}-12-31`,
      vis_params: { bands: ['N', 'R', 'G'] },
    }),
  });
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

  const data = await response.json();
  tileUrlCache[year] = data.tile_url;
  return data.tile_url;
}

function showLoading(message: string): void {
  let el = document.querySelector('.loading');
  if (!el) {
    el = document.createElement('div');
    el.className = 'loading';
    document.body.appendChild(el);
  }
  el.innerHTML = `<span class="loading-spinner"></span>${message}`;
}

function hideLoading(): void {
  document.querySelector('.loading')?.remove();
}

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
  center: [-95, 38],
  zoom: 4,
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.FullscreenControl(), 'top-right');

map.on('load', () => {
  // The XYZ tiles come from an async Earth Engine call per year, so the source
  // uses a resolver function instead of a token template. Use the built-in
  // layers popover to add more years and compare them with opacity.
  const timeSlider = new TimeSliderControl({
    startDate: `${START_YEAR}-01-01`,
    endDate: `${END_YEAR}-12-31`,
    granularity: 'year',
    granularities: ['year'],
    speed: 1500,
    sources: [
      {
        type: 'xyz',
        id: 'naip',
        name: 'NAIP Imagery',
        opacity: 0.85,
        tiles: async (date: Date) => {
          const year = date.getUTCFullYear();
          showLoading(`Loading ${year} imagery...`);
          try {
            return await fetchTileUrl(year);
          } finally {
            hideLoading();
          }
        },
      },
    ],
    onChange: (date) => console.log('NAIP year:', date.getUTCFullYear()),
  });

  map.addControl(timeSlider, 'bottom-left');
});
