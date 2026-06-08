# maplibre-gl-time-slider

A MapLibre GL JS plugin for visualizing time series raster and vector data with a NASA-Worldview-style bottom-docked timeline.

> **v1.0 is a breaking redesign.** The control is now a full-width timeline docked at the bottom of the map. Time is modeled as a continuous **date range + interval** (not a `labels[]` array), and the plugin manages map layers for you through built-in data adapters (COG, XYZ/WMTS, WMS-Time, GeoJSON), with an "Add data" GUI and a callback escape hatch. See [Migrating from 0.x](#migrating-from-0x).

[![npm version](https://badge.fury.io/js/maplibre-gl-time-slider.svg)](https://www.npmjs.com/package/maplibre-gl-time-slider)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Open in CodeSandbox](https://img.shields.io/badge/Open%20in-CodeSandbox-blue?logo=codesandbox)](https://codesandbox.io/p/github/opengeos/maplibre-gl-time-slider)
[![Open in StackBlitz](https://img.shields.io/badge/Open%20in-StackBlitz-blue?logo=stackblitz)](https://stackblitz.com/github/opengeos/maplibre-gl-time-slider)

## Features

- Full-width, bottom-docked timeline inspired by [NASA Worldview](https://worldview.earthdata.nasa.gov/) that **reserves its own row** (the map shrinks above it, so nothing is overlaid) and **collapses** to a corner toggle
- Continuous **date range + interval** time model with hour / day / month / year granularities
- Scrubbable, zoomable axis with a draggable marker and play / pause / loop / speed controls
- The plugin **manages map layers for you** through built-in data adapters:
  - **COG** via TiTiler (colormap + rescale)
  - **XYZ / WMTS** raster tiles
  - **WMS-Time** (OGC `TIME` parameter)
  - **GeoJSON** filtered by a time property
- **"Add data" GUI** (a resizable panel) to configure the timeline (range, interval, initial date), tweak settings (granularity, which granularities show as pills, speed, loop, theme, date format, auto-play), and add layers at runtime. Picking a source type loads a ready-to-run example (URL, timeline, and settings) you can edit. Per-layer controls include opacity, a visibility toggle, and for COG a colormap dropdown with a "None" option for RGB / multi-band imagery, rescale, nodata, and band selection
- Time-to-URL templating with tokens (`{YYYY}`, `{MM}`, `{DD}`, `{HH}`, `{date:FORMAT}`) **or** a `(date) => url` function
- `onChange` callback escape hatch for fully custom wiring
- Serializable config (`getConfig` / `setConfig`) for sharing state
- Automatic light/dark theming (with an explicit `theme` override)
- React component and `useTimeSlider` hook
- TypeScript-first with full type definitions

## Installation

```bash
npm install maplibre-gl-time-slider
```

## Quick Start

### Basic Usage (Vanilla JavaScript/TypeScript)

```typescript
import maplibregl from 'maplibre-gl';
import { TimeSliderControl } from 'maplibre-gl-time-slider';
import 'maplibre-gl-time-slider/style.css';

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [0, 0],
  zoom: 2,
});

map.on('load', () => {
  const timeSlider = new TimeSliderControl({
    startDate: '2024-04-18',
    endDate: '2024-04-28',
    granularity: 'day',
    // The plugin creates and updates the layer for you.
    sources: [
      {
        type: 'cog',
        name: 'Chlorophyll-a',
        url: 'https://example.com/chla_{date:YYYY-MM-DD}.tif',
        colormap: 'jet',
        rescale: [0, 1],
      },
    ],
  });

  map.addControl(timeSlider, 'bottom-left');
});
```

### React Usage

```tsx
import { useState, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { TimeSliderControlReact } from 'maplibre-gl-time-slider/react';
import 'maplibre-gl-time-slider/style.css';

function MyMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;
    const instance = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [0, 0],
      zoom: 2,
    });
    instance.on('load', () => setMap(instance));
    return () => instance.remove();
  }, []);

  return (
    <>
      <div ref={mapContainer} style={{ width: '100%', height: '100vh' }} />
      {map && (
        <TimeSliderControlReact
          map={map}
          startDate="2024-04-18"
          endDate="2024-04-28"
          granularity="day"
          sources={[
            {
              type: 'cog',
              id: 'chla',
              url: 'https://example.com/chla_{date:YYYY-MM-DD}.tif',
              colormap: 'viridis',
            },
          ]}
          onChange={(date) => console.log(date)}
        />
      )}
    </>
  );
}
```

There is also a `useTimeSlider(map, options)` hook that creates the control and
returns a reactive state snapshot plus `play` / `pause` / `goTo` / `next` /
`prev` / `setGranularity` helpers.

## Data sources

Pass one or more `sources` (or add them later with `addSource`, or via the
"Add data" button in the UI). Every source maps the current date to data; URL
fields accept a **token template** or a **`(date) => string` function**.

All source types share these optional fields: `id`, `name` (shown in the layers
panel), `opacity`, `visible` (toggle a layer on/off without removing it), and
`beforeId`. Raster types (`cog` / `xyz` / `wms`) also accept `bounds`
(`[west, south, east, north]`) to limit tile requests to the data footprint,
which avoids 404 floods from tile servers that error on out-of-bounds tiles.

### COG (via TiTiler)

```typescript
{
  type: 'cog',
  url: 'https://example.com/{date:YYYY-MM-DD}.tif', // or (date) => url
  colormap: 'viridis',     // omit for RGB / multi-band imagery
  rescale: [0, 1],
  bidx: [1, 2, 3],         // band indexes; e.g. RGB from a multi-band COG
  nodata: 'nan',
  opacity: 0.8,
  bounds: [-74.7, -8.6, -74.2, -8.3], // optional data footprint
}
```

### XYZ / WMTS raster

```typescript
{
  type: 'xyz',
  tiles: 'https://example.com/{z}/{x}/{y}.png?date={YYYY}-{MM}-{DD}',
}
```

`{z}/{x}/{y}` are left untouched; only date tokens are substituted.

### WMS-Time

```typescript
{
  type: 'wms',
  baseUrl: 'https://example.com/wms?service=WMS&request=GetMap&format=image/png',
  layers: 'temperature',
  timeFormat: 'YYYY-MM-DD', // appended as TIME=...
}
```

### GeoJSON (time filter)

```typescript
{
  type: 'geojson',
  data: 'https://example.com/events.geojson', // URL or FeatureCollection
  timeProperty: 'time',                        // epoch ms
  window: { unit: 'month', before: 0, after: 1 },
  geometry: 'circle',
  paint: { circle: { 'circle-color': '#de2d26', 'circle-radius': 6 } },
}
```

### Custom escape hatch

For anything else, use a `custom` source that resolves a concrete spec per date,
or the top-level `onChange(date)` callback to drive your own layers.

```typescript
{ type: 'custom', resolve: (date) => ({ type: 'xyz', tiles: myTemplateFor(date) }) }
```

## Time tokens

Token strings used in URLs and `dateFormat` (resolved in UTC):

`YYYY` `YY` `MMMM` `MMM` `MM` `M` `DD` `D` `HH` `H` `mm` `m` `ss` `s`, plus the
`{date:FORMAT}` form inside URLs (e.g. `{date:YYYY-MM-DD}`).

## API Reference

### TimeSliderControl

Main control class implementing MapLibre's `IControl` interface.

#### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `startDate` | `Date \| string` | - | Inclusive range start (required) |
| `endDate` | `Date \| string` | - | Inclusive range end (required) |
| `interval` | `number` | `1` | Steps between marker positions, in granularity units |
| `granularity` | `'hour' \| 'day' \| 'month' \| 'year'` | `'day'` | Active granularity |
| `granularities` | `Granularity[]` | all four | Granularities offered as zoom pills |
| `initialDate` | `Date \| string` | `startDate` | Date the marker starts at |
| `speed` | `number` | `1000` | Playback speed in ms per step |
| `loop` | `boolean` | `true` | Whether playback loops |
| `autoPlay` | `boolean` | `false` | Start playback automatically once the control is added to the map |
| `theme` | `'auto' \| 'light' \| 'dark'` | `'auto'` | Color theme |
| `dateFormat` | `string` | by granularity | Token format for the marker's date label. Defaults to a granularity-appropriate format (hour→`YYYY MMM DD HH:00`, day→`YYYY MMM DD`, month→`MMM YYYY`, year→`YYYY`) |
| `collapsible` | `boolean` | `true` | Show a corner toggle button to collapse/expand the dock |
| `collapsed` | `boolean` | `false` | Start with the dock collapsed (hidden) |
| `className` | `string` | - | Extra CSS class on the dock |
| `sources` | `SourceSpec[]` | `[]` | Data sources added on mount |
| `beforeId` | `string` | - | Insert managed layers before this map layer |
| `onChange` | `(date: Date) => void` | - | Fired on every date change |

#### Methods

| Method | Description |
|--------|-------------|
| `play()` / `pause()` / `togglePlayback()` | Playback control |
| `next()` / `prev()` | Step one interval (honoring loop) |
| `goTo(date)` | Navigate to a date (snapped to a step) |
| `setSpeed(ms)` / `setLoop(enabled)` | Playback settings |
| `setAutoPlay(enabled)` | Set whether playback auto-starts on add (affects re-adds and serialized config) |
| `setTheme(theme)` | Change the color theme (applied live) |
| `setDateFormat(format?)` | Set the date-label token format (applied live; omit for the granularity default) |
| `setRange(start, end, interval?, granularity?)` | Update the range |
| `setGranularity(granularity)` | Change the active granularity |
| `setGranularities(granularities)` | Set which granularities are offered as pills |
| `collapse()` / `expand()` / `toggle()` | Hide / show the dock |
| `addSource(spec)` | Add a managed source; returns its id |
| `removeSource(id)` | Remove a managed source |
| `setSourceOpacity(id, opacity)` | Set a layer's opacity |
| `setSourceProperty(id, patch)` | Patch a source (e.g. COG colormap/rescale) |
| `getSources()` | Current source specs |
| `getState()` / `getCurrentDate()` | Read state |
| `getConfig()` / `setConfig(config)` | Serialize / restore full config |
| `on(event, handler)` / `off(event, handler)` | Events |

#### Events

`change`, `play`, `pause`, `granularitychange`, `rangechange`, `sourceadd`,
`sourceremove`, `collapse`, `expand`, `statechange`. Handlers receive
`{ type, state }`.

### TiTiler Utilities

`buildTiTilerTileUrl(options)`, `getTiTilerBounds(url, endpoint?)`,
`getTiTilerInfo(url, endpoint?)`, and `getTiTilerStatistics(url, endpoint?)` are
still exported for advanced use (the COG adapter uses them internally).

```typescript
const bounds = await getTiTilerBounds('https://example.com/my-cog.tif');
map.fitBounds(bounds);
```

## Theming

The dock follows the system color scheme by default (light palette + a
`@media (prefers-color-scheme: dark)` dark palette). Set `theme: 'light'` or
`theme: 'dark'` to pin a palette. All colors are CSS custom properties on the
`.maplibregl-time-slider-dock` root, so you can override them:

```css
.maplibregl-time-slider-dock {
  --ts-accent: #e0533d;
  --ts-accent-hover: #c8472f;
  /* ...see src/lib/styles/time-slider-control.css for the full list */
}
```

## Migrating from 0.x

| 0.x | 1.0 |
|-----|-----|
| `labels: string[]` | `startDate` + `endDate` + `granularity` (+ `interval`) |
| `onChange(index, label)` | `onChange(date: Date)` |
| You wired sources/layers in `onChange` | Declare `sources: [...]`; the plugin manages layers |
| `onAddLayer` / "Add Layer" button | Built-in "Add data" GUI + `addSource()` |
| Corner panel, `collapsed` / `panelWidth` / `position` | Full-width bottom dock |
| `initialIndex` / `goTo(index)` / `getCurrentIndex()` | `initialDate` / `goTo(date)` / `getCurrentDate()` |
| `useTimeSliderState()` | `useTimeSlider(map, options)` |

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build library
npm run build

# Build examples
npm run build:examples

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## Docker

The examples can be run using Docker. The image is automatically built and published to GitHub Container Registry.

### Pull and Run

```bash
# Pull the latest image
docker pull ghcr.io/opengeos/maplibre-gl-time-slider:latest

# Run the container
docker run -p 8080:80 ghcr.io/opengeos/maplibre-gl-time-slider:latest
```

Then open http://localhost:8080/maplibre-gl-time-slider/ in your browser to view the examples.

### Build Locally

```bash
# Build the image
docker build -t maplibre-gl-time-slider .

# Run the container
docker run -p 8080:80 maplibre-gl-time-slider
```

### Available Tags

| Tag | Description |
|-----|-------------|
| `latest` | Latest release |
| `x.y.z` | Specific version (e.g., `1.0.0`) |
| `x.y` | Minor version (e.g., `1.0`) |


## License

MIT License - see [LICENSE](LICENSE) for details.
