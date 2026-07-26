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
