import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: '/maplibre-gl-time-slider/',
  build: {
    outDir: 'dist-examples',
    // The EMIT example's date lists are small enough that Vite would inline
    // them as base64 `data:` URIs. Keep them as real files: they are meant to be
    // fetched (and pasted into the timeline's Dates field) like any other
    // catalog, which a data URI cannot demonstrate.
    assetsInlineLimit: (filePath: string) =>
      /chla_dates\.(json|csv)$/.test(filePath) ? false : undefined,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        raster: resolve(__dirname, 'examples/raster/index.html'),
        mosaic: resolve(__dirname, 'examples/mosaic/index.html'),
        naip: resolve(__dirname, 'examples/naip/index.html'),
        vector: resolve(__dirname, 'examples/vector/index.html'),
        pace: resolve(__dirname, 'examples/pace/index.html'),
        worldview: resolve(__dirname, 'examples/worldview/index.html'),
        landsat: resolve(__dirname, 'examples/landsat/index.html'),
        emit: resolve(__dirname, 'examples/emit/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
