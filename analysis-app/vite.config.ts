import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@wrc-coach/lib': path.resolve(__dirname, '../src/lib'),
      '@wrc-coach/components': path.resolve(__dirname, '../src/components'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 3001,
  },
});

