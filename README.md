# maplibre-gl-time-slider

A MapLibre GL JS plugin for visualizing time series raster and vector data with a NASA-Worldview-style bottom-docked timeline.

> **v1.0 is a breaking redesign.** The control is now a full-width timeline docked at the bottom of the map. Time is modeled as a continuous **date range + interval** (not a `labels[]` array), and the plugin manages map layers for you through built-in data adapters (COG, XYZ/WMTS, WMS-Time, GeoJSON), with an "Add data" GUI and a callback escape hatch. See [Migrating from 0.x](#migrating-from-0x).

[![npm version](https://badge.fury.io/js/maplibre-gl-time-slider.svg)](https://www.npmjs.com/package/maplibre-gl-time-slider)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Open in CodeSandbox](https://img.shields.io/badge/Open%20in-CodeSandbox-blue?logo=codesandbox)](https://codesandbox.io/p/github/opengeos/maplibre-gl-time-slider)
[![Open in StackBlitz](https://img.shields.io/badge/Open%20in-StackBlitz-blue?logo=stackblitz)](https://stackblitz.com/github/opengeos/maplibre-gl-time-slider)

## Features

- Full-width, bottom-docked timeline inspired by [NASA Worldview](https://worldview.earthdata.nasa.gov/) that **reserves its own row** (the map shrinks above it, so nothing is overlaid) and **collapses** to a corner toggle
- Continuous **date range + interval** time model with hour / day / month / year granularities, or an explicit **`dates` list** for irregularly spaced data — only real dates get a tick, so a sparse archive stops rendering as a wall of no-data steps
- Scrubbable, zoomable axis with a draggable marker and play / pause / loop / speed controls
- The plugin **manages map layers for you** through built-in data adapters:
  - **COG** via TiTiler (colormap + rescale)
  - **Mosaic** (STAC / MosaicJSON) — a per-date `.json` of many COGs stitched into one deck.gl mosaic (via the optional `maplibre-gl-raster` peer)
  - **XYZ / WMTS** raster tiles
  - **WMS-Time** (OGC `TIME` parameter)
  - **GeoJSON** filtered by a time property
- **"Add data" GUI** (a resizable panel) to configure the timeline (range, an explicit **Dates** list for irregular data, interval, initial date), tweak settings (granularity, which granularities show as pills, speed, loop, theme, date format, auto-play), and add layers at runtime. Picking a source type loads a ready-to-run example (URL, timeline, and settings) you can edit. Per-layer controls include opacity, a visibility toggle, and for COG a colormap dropdown with a "None" option for RGB / multi-band imagery, rescale, nodata, and band selection (a mosaic exposes the same, with NoData in the renderer's auto/off/number form)
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

### Mosaic (STAC / MosaicJSON)

Steps through a series of **mosaic manifests** — one `.json` per date — each a
[MosaicJSON](https://github.com/developmentseed/mosaicjson-spec) or a STAC
`FeatureCollection` listing many COGs. Every date's manifest is rendered as a
single stitched deck.gl mosaic, so each timeline step is a full spatial mosaic
(e.g. a monthly Sentinel-2 composite). This is the counterpart to `cog` for when
each date is a *collection* of images rather than one COG.

```typescript
{
  type: 'mosaic',
  url: 'https://example.com/{date:YYYY}/{date:MM}/mosaic.json', // or (date) => url
  engine: 'gpu',           // 'gpu' (default) or 'wasm' — see below
  colormap: 'viridis',     // single-band mosaics only; omit for RGB imagery
  rescale: [0, 3000],      // applied per channel (needs bidx or a colormap)
  bidx: [1, 2, 3],         // band indexes; 3+ = RGB, 1 = single-band
  nodata: 'auto',          // 'auto' (default) | 'off' | a number — see below
  opacity: 0.9,
}
```

**NoData.** `'auto'` (the default) uses the value each COG declares and treats
NaN as nodata for float data; `'off'` renders every pixel; a number overrides the
declared value in source units. Note this is *not* the same spelling as the `cog`
source's `nodata`, which is a TiTiler query parameter (a number or `'nan'`) — a
mosaic is composited client-side, so it takes the renderer's own vocabulary.

**Engine.** Two rendering backends are available:

- **`'gpu'`** (default) — the deck.gl mosaic engine. Fast and GPU-composited, but
  it cannot render under MapLibre's globe view, so adding the mosaic **forces a
  mercator projection**.
- **`'wasm'`** — the [`cog-tiler-wasm`](https://github.com/opengeos/maplibre-gl-raster#rendering-engines)
  engine. It composites each tile on the CPU and serves it as a normal MapLibre
  raster source, so it renders in **globe** as well as mercator (the projection
  is left untouched). Slower than the GPU engine, and it needs `cog-tiler-wasm`
  and its peers installed alongside `maplibre-gl-raster` (both are lazy-loaded).

  > **Use `cog-tiler-wasm` >= 0.3.1.** Earlier versions draw a one-pixel
  > coloured border around every nodata boundary — a blue ring under `jet`
  > tracing coastlines and swath edges. Their bilinear samplers interpolated raw
  > pixels and only then tested the result against the nodata sentinel, so a
  > pixel beside nodata blended toward it, matched neither the sentinel nor NaN,
  > and clamped to the bottom of the rescale window. The `'gpu'` engine is
  > unaffected.

Rendering is delegated to
[`maplibre-gl-raster`](https://github.com/opengeos/maplibre-gl-raster) (an
**optional peer dependency**), imported lazily the first time a mosaic source is
added, so the deck.gl engine never enters the base bundle. Install it alongside
its deck.gl / luma.gl peers to use this source type:

```bash
npm install maplibre-gl-raster @deck.gl/core @deck.gl/geo-layers @deck.gl/layers @deck.gl/mapbox @deck.gl/mesh-layers @luma.gl/core @luma.gl/shadertools
```

The first mosaic added fits the view to its extent; later date steps swap the
manifest in place without moving the map. Adding a mosaic **switches the map to a
mercator projection** — the deck.gl tiler cannot render in MapLibre's globe view,
so a mosaic would otherwise draw nothing there. Each COG the manifest references
must be CORS-enabled and reachable from the browser (see the `maplibre-gl-raster`
docs for the mosaic manifest formats and the `make_stac.py` / `search_stac.py`
helpers that build them).

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

## Irregular dates (hiding no-data steps)

By default the timeline is continuous: it walks `startDate` → `endDate` in fixed
granularity units, regardless of whether each step has data. For a sparse
archive that means mostly empty frames — a daily timeline over a three-year
satellite series with 16 usable scenes draws ~1,000 ticks, and playback sits on
"No data" for weeks at a time between them.

Pass `dates` to step through **only the dates that exist**:

```typescript
const timeSlider = new TimeSliderControl({
  dates: ['2023-01-28', '2023-02-20', '2023-03-27', '2024-04-01', '2025-10-03'],
  sources: [
    {
      type: 'cog',
      url: 'https://example.com/chla_{date:YYYYMMDD}.tif',
      colormap: 'jet',
      rescale: [0, 30],
    },
  ],
});
```

The timeline becomes **ordinal**: each date gets one tick, all evenly spaced, so
a three-week gap and a three-year gap look the same on the axis. Scrubbing and
playback can only land on a listed date, `startDate`/`endDate` are optional (the
list sets the range, and if given they clip it), and the granularity pills are
hidden because the list — not the granularity — now sets the step size.
`interval` still works, stepping N entries at a time.

The list is parsed, sorted, and de-duplicated on the way in, and accepts `Date`
objects, parseable strings, or epoch milliseconds. Dates falling in the same
granularity unit collapse to a single step, keeping the earliest timestamp: a
catalog that reports one record per tile gives several timestamps seconds apart
for one acquisition, and at day granularity that is one step, not a run of
identical ticks. Raise the granularity to `'hour'` if sub-day steps are real.

### Where the dates come from

Anywhere. The plugin never contacts your data host — it only consumes a list of
dates, so any catalog works: a bucket listing, a STAC search, a `datetime` column,
a static manifest you ship alongside the tiles, or a hardcoded array. Derive them
however you like, then hand them over.

When the list is only known after an async lookup, add the control first and
call `setDates()` when it resolves:

```typescript
const timeSlider = new TimeSliderControl({
  startDate: '2023-01-01',
  sources: [{ type: 'cog', url: 'https://example.com/chla_{date:YYYYMMDD}.tif' }],
});
map.addControl(timeSlider, 'bottom-left');

// e.g. an S3/R2 listing — swap in whatever lists your archive.
const res = await fetch('https://example.com/chla/?list-type=2');
const dates = [...(await res.text()).matchAll(/chla_(\d{8})\.tif/g)].map(
  ([, ymd]) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6)}`
);
timeSlider.setDates(dates);
```

A STAC catalog is the same shape — search, then map the items to their
timestamps:

```typescript
const { features } = await (
  await fetch('https://earth-search.aws.element84.com/v1/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ collections: ['sentinel-2-l2a'], bbox, limit: 200 }),
  })
).json();
timeSlider.setDates(features.map((f) => f.properties.datetime));
```

`getConfig()` serializes the list (unclipped) so a saved project restores the
same timeline, and `setDates(null)` drops back to a continuous one.

### Loading the list from a URL

`loadDates(url)` fetches the list instead, so it can live next to the data
rather than in your code:

```typescript
await timeSlider.loadDates('https://example.com/scenes.json');
```

JSON, CSV, and plain text are all accepted, detected from the extension, the
`Content-Type`, and the body:

| Format | Shapes recognized |
|--------|-------------------|
| JSON | A bare array (`["2023-01-28", ...]`); an array of records with a `date` / `datetime` / `time` / `timestamp` / `acquired` field; a wrapper object (`{"dates": [...]}`); a GeoJSON or STAC `FeatureCollection`, reading each feature's `properties.datetime` |
| CSV | The `date` / `datetime` / … column when there is a header row, otherwise the first column |
| Text | One date per line, or separated by commas, semicolons, or spaces |

A STAC search response or an `ogr2ogr`-style CSV export therefore works as-is,
with no reshaping. The same parser is exported standalone as `fetchDateList(url,
init?)` if you want the dates without applying them. A failed load throws and
leaves the current timeline untouched.

`examples/emit/` ships both shapes for its 16 irregular scenes —
[`chla_dates.json`](examples/emit/chla_dates.json) (a plain array) and
[`chla_dates.csv`](examples/emit/chla_dates.csv) (a `datetime` column beside the
granule ids) — as a template for a list you host yourself.

`getConfig()` records the URL next to the resolved dates, so restoring a saved
project is offline-safe and never refetches.

### From the "Add data" panel

The same thing is available without writing code: the panel's **Timeline**
section has a **Dates** field. Put either form in it —

- the dates themselves, separated by commas, spaces, or newlines
- a URL to a `.json`, `.csv`, or `.txt` file listing them, which is fetched and
  parsed exactly as `loadDates` would, reporting underneath how many dates it
  found (or why it could not)

— and the timeline becomes ordinal. Start/End then clip that list rather than
defining the range, and clearing the field returns to a continuous timeline.

The per-date "No data" badge still applies on top of this: sources probe each
date as you reach it, so a list that has drifted out of sync with the archive
still tells you rather than showing the previous frame.

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
| `startDate` | `Date \| string` | - | Inclusive range start. Required unless `dates` is given, where it acts as a lower clip on the list |
| `endDate` | `Date \| string` | current date | Inclusive range end. Omit it to leave the range open: it defaults to the current date, and a persisted config (`getConfig`) leaves it out so a restored timeline re-resolves to the then-current date and always reaches the latest data. With `dates`, an upper clip on the list |
| `dates` | `Array<Date \| string \| number>` | - | Explicit dates to step through, for irregularly spaced data — see [Irregular dates](#irregular-dates-hiding-no-data-steps) |
| `interval` | `number` | `1` | Steps between marker positions: granularity units, or entries of `dates` |
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
| `setRange(start, end, interval?, granularity?)` | Update the range (a clip on `dates`, when set) |
| `setDates(dates?)` | Set the explicit dates to step through; pass `null` for a continuous timeline |
| `loadDates(url, init?)` | Fetch the dates from a JSON / CSV / text URL and apply them |
| `getDates()` / `getDatesUrl()` | The explicit dates (unclipped) and the URL they came from, if any |
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
