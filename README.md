# maplibre-gl-time-slider

A MapLibre GL JS plugin for visualizing time series vector and raster data with an interactive time slider control.

[![npm version](https://badge.fury.io/js/maplibre-gl-time-slider.svg)](https://www.npmjs.com/package/maplibre-gl-time-slider)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Open in CodeSandbox](https://img.shields.io/badge/Open%20in-CodeSandbox-blue?logo=codesandbox)](https://codesandbox.io/p/github/opengeos/maplibre-gl-time-slider)
[![Open in StackBlitz](https://img.shields.io/badge/Open%20in-StackBlitz-blue?logo=stackblitz)](https://stackblitz.com/github/opengeos/maplibre-gl-time-slider)

## Features

- Interactive time slider with play/pause controls
- Support for both vector and raster time series data
- Built-in TiTiler integration for Cloud Optimized GeoTIFFs (COGs)
- Customizable playback speed and loop settings
- React component and hooks support
- TypeScript support with full type definitions
- Lightweight and easy to integrate

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
    title: 'Time Slider',
    labels: ['2024-01', '2024-02', '2024-03', '2024-04'],
    speed: 1000,
    loop: true,
    onChange: (index, label) => {
      console.log(`Current: ${label} (index: ${index})`);
      // Update your map layers here
    },
  });

  map.addControl(timeSlider, 'top-right');
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

    const mapInstance = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [0, 0],
      zoom: 2,
    });

    mapInstance.on('load', () => setMap(mapInstance));

    return () => mapInstance.remove();
  }, []);

  return (
    <>
      <div ref={mapContainer} style={{ width: '100%', height: '100vh' }} />
      {map && (
        <TimeSliderControlReact
          map={map}
          title="Time Slider"
          labels={['2024-01', '2024-02', '2024-03']}
          onChange={(index, label) => {
            // Update map layers
          }}
        />
      )}
    </>
  );
}
```

## Examples

### Vector Data (Filtering by Time)

Filter vector features by a time property:

```typescript
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const timeSlider = new TimeSliderControl({
  labels: months,
  onChange: (index, label) => {
    // Filter vector layer by month
    map.setFilter('my-layer', ['==', ['get', 'month'], index]);
  },
});
```

### Raster Data (TiTiler Integration)

Display time series raster data using TiTiler:

```typescript
import { TimeSliderControl, buildTiTilerTileUrl } from 'maplibre-gl-time-slider';

const rasterData = {
  '2024-01': 'https://example.com/cog_2024_01.tif',
  '2024-02': 'https://example.com/cog_2024_02.tif',
  '2024-03': 'https://example.com/cog_2024_03.tif',
};

const labels = Object.keys(rasterData);
const urls = Object.values(rasterData);

// Add initial raster source
map.addSource('raster-data', {
  type: 'raster',
  tiles: [
    buildTiTilerTileUrl({
      url: urls[0],
      colormap: 'viridis',
    }),
  ],
  tileSize: 256,
});

map.addLayer({
  id: 'raster-layer',
  type: 'raster',
  source: 'raster-data',
});

// Create time slider
const timeSlider = new TimeSliderControl({
  labels: labels,
  onChange: (index, label) => {
    const source = map.getSource('raster-data');
    source.setTiles([
      buildTiTilerTileUrl({
        url: urls[index],
        colormap: 'viridis',
      }),
    ]);
  },
});
```

## API Reference

### TimeSliderControl

Main control class that implements MapLibre's `IControl` interface.

#### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `labels` | `string[]` | `[]` | Array of labels to display (required) |
| `title` | `string` | `'Time Slider'` | Title displayed in the panel header |
| `collapsed` | `boolean` | `true` | Whether to start with panel collapsed |
| `position` | `string` | `'top-right'` | Control position on the map |
| `panelWidth` | `number` | `300` | Width of the panel in pixels |
| `initialIndex` | `number` | `0` | Initial index to start at |
| `speed` | `number` | `1000` | Playback speed in milliseconds |
| `loop` | `boolean` | `true` | Whether to loop playback |
| `className` | `string` | `''` | Custom CSS class name |
| `onChange` | `function` | - | Callback when index changes: `(index: number, label: string) => void` |

#### Methods

| Method | Description |
|--------|-------------|
| `play()` | Start playback |
| `pause()` | Pause playback |
| `togglePlayback()` | Toggle play/pause state |
| `next()` | Move to next label |
| `prev()` | Move to previous label |
| `goTo(index)` | Navigate to specific index |
| `setSpeed(ms)` | Set playback speed |
| `setLoop(enabled)` | Set loop state |
| `setLabels(labels, resetIndex?)` | Update labels |
| `getCurrentIndex()` | Get current index |
| `getCurrentLabel()` | Get current label |
| `getLabels()` | Get all labels |
| `getState()` | Get full state object |
| `toggle()` | Toggle panel collapsed state |
| `expand()` | Expand panel |
| `collapse()` | Collapse panel |
| `on(event, handler)` | Register event listener |
| `off(event, handler)` | Remove event listener |

#### Events

| Event | Description |
|-------|-------------|
| `change` | Fired when the current index changes |
| `play` | Fired when playback starts |
| `pause` | Fired when playback pauses |
| `collapse` | Fired when panel collapses |
| `expand` | Fired when panel expands |
| `statechange` | Fired on any state change |

### TiTiler Utilities

#### buildTiTilerTileUrl(options)

Builds a TiTiler XYZ tile URL for MapLibre raster sources.

```typescript
const tileUrl = buildTiTilerTileUrl({
  url: 'https://example.com/my-cog.tif',
  endpoint: 'https://giswqs-titiler-endpoint.hf.space',  // optional, default
  colormap: 'viridis',              // optional, default
  rescale: [-10, 10],               // optional
  bidx: [1],                        // optional, band indexes
});
```

#### getTiTilerBounds(url, endpoint?)

Fetches the bounds of a COG file.

```typescript
const bounds = await getTiTilerBounds('https://example.com/my-cog.tif');
map.fitBounds(bounds);
```

#### getTiTilerInfo(url, endpoint?)

Fetches metadata about a COG file.

#### getTiTilerStatistics(url, endpoint?)

Fetches statistics (min, max, mean, std) for each band.

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
