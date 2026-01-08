import maplibregl from 'maplibre-gl';
import { TimeSliderControl } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

// Month names for labels
const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// Earthquake data URL
const EARTHQUAKE_DATA_URL =
  'https://maplibre.org/maplibre-gl-js/docs/assets/significant-earthquakes-2015.geojson';

// Create map
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [0, 20],
  zoom: 1.5,
});

// Add navigation controls
map.addControl(new maplibregl.NavigationControl(), 'top-right');

// Add fullscreen control
map.addControl(new maplibregl.FullscreenControl(), 'top-right');

// Filter function
function filterByMonth(month: number): void {
  map.setFilter('earthquake-circles', ['==', ['get', 'month'], month]);
  map.setFilter('earthquake-labels', ['==', ['get', 'month'], month]);
}

// Add earthquake data and time slider when map loads
map.on('load', async () => {
  // Fetch the earthquake data
  const response = await fetch(EARTHQUAKE_DATA_URL);
  const data = await response.json();

  // Add month property to each feature based on the timestamp
  data.features = data.features.map(
    (feature: { properties: { time: number; month?: number } }) => {
      feature.properties.month = new Date(feature.properties.time).getMonth();
      return feature;
    }
  );

  // Add the earthquake source
  map.addSource('earthquakes', {
    type: 'geojson',
    data: data,
  });

  // Add circle layer for earthquakes
  map.addLayer({
    id: 'earthquake-circles',
    type: 'circle',
    source: 'earthquakes',
    paint: {
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
      'circle-opacity': 0.75,
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
  });

  // Add label layer for earthquake magnitudes
  map.addLayer({
    id: 'earthquake-labels',
    type: 'symbol',
    source: 'earthquakes',
    layout: {
      'text-field': ['concat', ['to-string', ['get', 'mag']], 'M'],
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      'text-size': 10,
    },
    paint: {
      'text-color': '#333',
      'text-halo-color': '#fff',
      'text-halo-width': 1,
    },
  });

  // Set initial filter to January
  filterByMonth(0);

  // Create the time slider control
  const timeSlider = new TimeSliderControl({
    title: 'Time Slider',
    labels: months,
    speed: 1000,
    loop: true,
    collapsed: false,
    panelWidth: 320,
    onChange: (index, label) => {
      console.log(`Filtering by month: ${label} (month index: ${index})`);
      filterByMonth(index);
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

  // Add popup on click
  map.on('click', 'earthquake-circles', (e) => {
    if (!e.features || e.features.length === 0) return;

    const feature = e.features[0];
    const coordinates = (feature.geometry as GeoJSON.Point).coordinates.slice();
    const { mag, place, time } = feature.properties as {
      mag: number;
      place: string;
      time: number;
    };

    // Format the date
    const date = new Date(time).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    new maplibregl.Popup()
      .setLngLat(coordinates as [number, number])
      .setHTML(
        `
        <strong>Magnitude ${mag}</strong><br>
        ${place}<br>
        <small>${date}</small>
      `
      )
      .addTo(map);
  });

  // Change cursor on hover
  map.on('mouseenter', 'earthquake-circles', () => {
    map.getCanvas().style.cursor = 'pointer';
  });

  map.on('mouseleave', 'earthquake-circles', () => {
    map.getCanvas().style.cursor = '';
  });

  console.log('Time slider control added to map');
});
