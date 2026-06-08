import maplibregl from 'maplibre-gl';
import { TimeSliderControl, getTiTilerBounds, resolveUrl } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

// Annual Landsat composites (1984-2013), one COG per year. The COG URL embeds
// the year via a `{date:YYYY}` token, so a single template drives the whole
// time series at year granularity.
const COG_URL = 'https://data.source.coop/giswqs/opengeos/landsat_ts/{date:YYYY}.tif';

// Create map
const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        tiles: ['https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'],
        tileSize: 256,
        attribution: '&copy; Google',
      },
    },
    layers: [{ id: 'satellite', type: 'raster', source: 'satellite', minzoom: 0, maxzoom: 19 }],
  },
  // Rough starting view; refined by fitting the COG bounds once they load.
  center: [-74.44, -8.42],
  zoom: 9,
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.FullscreenControl(), 'top-right');
map.addControl(new maplibregl.GlobeControl(), 'top-right');

map.on('load', async () => {
  // Fetch the COG footprint first. Every yearly COG shares the same extent, so
  // the first year is representative. The bounds are used both to auto-fit the
  // view and to constrain the raster source: without `bounds`, MapLibre requests
  // tiles across the whole world and TiTiler returns 404 for every tile outside
  // the small footprint, flooding the console and stalling rendering.
  const firstUrl = resolveUrl(COG_URL, new Date('1984-01-01')) as string;
  let bounds: [number, number, number, number] | undefined;
  try {
    bounds = await getTiTilerBounds(firstUrl);
    map.fitBounds(bounds, { padding: 40, duration: 0 });
  } catch (err) {
    console.warn('Could not fetch COG bounds:', err);
  }

  // Each COG is a 3-band uint8 false-color composite (SWIR1 / NIR / Red), so it
  // is rendered as RGB by selecting bands 1-3 with no colormap. `nodata: 0`
  // keeps the empty borders transparent. The pixel values cluster in the low end
  // of the 0-255 range, so a `rescale` stretch (input 0-110 -> output 0-255)
  // brightens the otherwise dark imagery.
  const timeSlider = new TimeSliderControl({
    startDate: '1984-01-01',
    endDate: '2013-01-01',
    granularity: 'year',
    granularities: ['year'],
    speed: 800,
    sources: [
      {
        type: 'cog',
        id: 'landsat-ts',
        name: 'Landsat Annual Composite',
        url: COG_URL,
        bidx: [1, 2, 3],
        rescale: [0, 110],
        nodata: 0,
        bounds,
      },
    ],
    onChange: (date) => console.log('Landsat year:', date.getUTCFullYear()),
  });

  map.addControl(timeSlider, 'bottom-left');
});
