/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // Same origin in development too: the browser talks to localhost:5173 only, and Vite forwards
    // /api to the API. In production the Cloudflare Pages Function does this (spec §4), so cookies
    // stay first-party and there's no CORS anywhere.
    proxy: { '/api': 'http://127.0.0.1:4000' },
  },
  build: {
    sourcemap: true,
    // Spec §7: initial JS under 250 KB gzipped. Vite warns above this (uncompressed) size.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
