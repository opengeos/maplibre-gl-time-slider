import maplibregl from 'maplibre-gl';
import { TimeSliderControl } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

const EARTHQUAKE_DATA_URL =
  'https://maplibre.org/maplibre-gl-js/docs/assets/significant-earthquakes-2015.geojson';

/** Escapes a value for safe interpolation into popup HTML. */
function esc(value: string | number): string {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );
}

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors',
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm', minzoom: 0, maxzoom: 19 }],
  },
  center: [0, 20],
  zoom: 1.5,
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.FullscreenControl(), 'top-right');

map.on('load', () => {
  // The GeoJSON adapter filters features whose `time` property (epoch ms) falls
  // inside the month window around the current date. No manual setFilter needed.
  const timeSlider = new TimeSliderControl({
    startDate: '2015-01-01',
    endDate: '2015-12-31',
    granularity: 'month',
    granularities: ['month'],
    sources: [
      {
        type: 'geojson',
        id: 'earthquakes',
        name: 'Significant Earthquakes 2015',
        data: EARTHQUAKE_DATA_URL,
        timeProperty: 'time',
        window: { unit: 'month', before: 0, after: 1 },
        geometry: 'circle',
        opacity: 0.75,
        paint: {
          circle: {
            'circle-color': [
              'interpolate',
              ['linear'],
              ['get', 'mag'],
              4,
              '#fee5d9',
              5,
              '#fcae91',
              6,
              '#fb6a4a',
              7,
              '#de2d26',
              8,
              '#a50f15',
            ],
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['get', 'mag'],
              4,
              6,
              5,
              10,
              6,
              16,
              7,
              24,
              8,
              36,
            ],
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 1,
          },
        },
      },
    ],
  });

  map.addControl(timeSlider, 'bottom-left');

  // Popup on click.
  map.on('click', 'earthquakes', (e) => {
    if (!e.features || e.features.length === 0) return;
    const feature = e.features[0];
    const coordinates = (feature.geometry as GeoJSON.Point).coordinates.slice();
    const { mag, place, time } = feature.properties as {
      mag: number;
      place: string;
      time: number;
    };
    const date = new Date(time).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    new maplibregl.Popup()
      .setLngLat(coordinates as [number, number])
      .setHTML(
        `<strong>Magnitude ${esc(mag)}</strong><br>${esc(place)}<br><small>${esc(date)}</small>`
      )
      .addTo(map);
  });

  map.on('mouseenter', 'earthquakes', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'earthquakes', () => {
    map.getCanvas().style.cursor = '';
  });
});
