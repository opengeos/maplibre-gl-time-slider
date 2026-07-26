import maplibregl from 'maplibre-gl';
import { TimeSliderControl } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

// EMIT chlorophyll-a retrievals over Apalachicola Bay, Florida. EMIT images a
// given place only when its orbit happens to pass over it under clear skies, so
// the archive is *irregular*: 16 scenes scattered across nearly three years,
// with gaps from a few days to eight months.
//
// A continuous daily timeline over that span would draw ~1,000 ticks for 16
// frames, and playback would sit on "No data" for weeks between scenes. Passing
// an explicit `dates` list instead makes the timeline ordinal: one tick per
// scene, evenly spaced, and scrubbing can only land on a date that has data.
const BASE =
  'https://huggingface.co/datasets/HyperCoast/EMIT_products/resolve/main/output/Apalachicola_Bay';

// Each date has a small STAC FeatureCollection listing that scene's COG.
const MOSAIC_URL = `${BASE}/json/{date:YYYYMMDD}_chla.json`;

// The dates the archive actually holds. Hardcoding them is the simplest way to
// use the feature; `listScenes()` below derives the same list from the catalog,
// which is what you would do for an archive that keeps growing.
const KNOWN_DATES = [
  '2023-01-28',
  '2023-02-20',
  '2023-03-27',
  '2023-05-27',
  '2023-08-07',
  '2023-09-22',
  '2024-03-28',
  '2024-04-01',
  '2024-04-16',
  '2024-05-19',
  '2024-08-03',
  '2024-10-19',
  '2024-10-23',
  '2025-02-01',
  '2025-09-29',
  '2025-10-03',
];

/**
 * Derives the available dates from the file listing rather than hardcoding
 * them, so new scenes appear on the timeline as soon as they are published.
 *
 * Nothing about this is specific to Hugging Face — the control only ever
 * consumes an array of dates. Swap this for an S3/R2 listing, a STAC search, a
 * `datetime` column, or a manifest you ship next to the data; the rest of the
 * example is unchanged. Falls back to the known list if the catalog is
 * unreachable.
 *
 * @returns Ascending `YYYY-MM-DD` strings, one per scene
 */
async function listScenes(): Promise<string[]> {
  try {
    const response = await fetch(
      'https://huggingface.co/api/datasets/HyperCoast/EMIT_products/tree/main/' +
        'output/Apalachicola_Bay/json?limit=1000'
    );
    if (!response.ok) return KNOWN_DATES;
    const entries: { path: string }[] = await response.json();
    const dates = entries
      .map((entry) => /(\d{4})(\d{2})(\d{2})_chla\.json$/.exec(entry.path))
      .filter((match): match is RegExpExecArray => match !== null)
      .map(([, year, month, day]) => `${year}-${month}-${day}`);
    // An empty result means the layout changed; the known list still works.
    return dates.length > 0 ? dates : KNOWN_DATES;
  } catch {
    return KNOWN_DATES;
  }
}

// A light basemap so the chlorophyll ramp stands out against the coastline.
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
  center: [-85.17, 30.0],
  zoom: 9,
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.FullscreenControl(), 'top-right');
// A globe toggle: this example uses the WASM engine, which renders through a
// MapLibre raster source and so works in globe as well as mercator.
map.addControl(new maplibregl.GlobeControl(), 'top-right');

map.on('load', async () => {
  const dates = await listScenes();

  const timeSlider = new TimeSliderControl({
    // The list *is* the timeline: no startDate/endDate needed, the range comes
    // from the first and last scene. (Supply them anyway to clip the list.)
    dates,
    granularity: 'day',
    speed: 1200,
    sources: [
      {
        type: 'mosaic',
        id: 'emit-chla',
        name: 'EMIT Chlorophyll-a',
        url: MOSAIC_URL,
        engine: 'wasm',
        // Single-band retrieval, so a colormap applies. Values are heavily
        // skewed (median ~2 mg/m^3, max ~680), so the ramp is cut well below
        // the maximum to keep detail in the estuary rather than in the outliers.
        colormap: 'jet',
        rescale: [0, 30],
        opacity: 0.85,
      },
    ],
    onChange: (date) => console.log('EMIT scene:', date.toISOString().slice(0, 10)),
  });

  map.addControl(timeSlider, 'bottom-left');

  // If the catalog lookup had to happen after the control was already on the
  // map, `timeSlider.setDates(dates)` applies the list live and re-snaps the
  // marker onto the nearest date that has data.
});
