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
      external: ['react', 'react-dom', 'maplibre-gl'],
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
