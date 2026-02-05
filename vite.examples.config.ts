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
        vector: resolve(__dirname, 'examples/vector/index.html'),
        pace: resolve(__dirname, 'examples/pace/index.html'),
        naip: resolve(__dirname, 'examples/naip/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
