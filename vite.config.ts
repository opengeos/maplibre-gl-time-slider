import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Type declarations are emitted by `tsc -p tsconfig.build.json`
// (emitDeclarationOnly) into `dist/types`, which is what package.json
// `types`/`exports` advertise. The tsc step runs after `vite build` so its
// output survives Vite's emptyOutDir clean.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  // The `mosaic` source's WASM engine lazy-loads `cog-tiler-wasm` (an optional
  // peer of `maplibre-gl-raster`). Without these hints the dev server serves an
  // optional-peer stub for it and the tiler silently renders nothing. Mirrors
  // the config a consumer app needs (e.g. GeoLibre): serve the wasm-bindgen
  // packages as-is (their `new URL(...wasm, import.meta.url)` asset references
  // break under esbuild pre-bundling) and pre-bundle their plain-JS deps.
  optimizeDeps: {
    exclude: ['cog-tiler-wasm', 'whitebox-wasm'],
    include: ['proj4', 'geotiff', 'geotiff-geokeys-to-proj4'],
  },
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        react: resolve(__dirname, 'src/react.ts'),
      },
      name: 'MapLibreTimeSlider',
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => {
        const ext = format === 'es' ? 'mjs' : 'cjs';
        return `${entryName}.${ext}`;
      },
    },
    rollupOptions: {
      // `maplibre-gl-raster` is an optional peer, loaded lazily by the mosaic
      // adapter's dynamic import; keep it external so it never enters the bundle.
      external: ['react', 'react-dom', 'maplibre-gl', 'maplibre-gl-raster'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'maplibre-gl': 'maplibregl',
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') return 'maplibre-gl-time-slider.css';
          return assetInfo.name || '';
        },
      },
    },
    cssCodeSplit: false,
    sourcemap: true,
    minify: false,
  },
});
