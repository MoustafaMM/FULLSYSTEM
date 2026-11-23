import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // used by the Logistics module pages
    VitePWA({
      registerType: 'prompt',
      workbox: {
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api/, /^\/firebase-messaging-sw\.js/],
      },
      manifest: {
        name: 'Express Tracker',
        short_name: 'Express Tracker',
        description: 'Pipeline · Visa Tracker · Admission · Logistics · Quality Control',
        theme_color: '#293b8f',
        background_color: '#ffffff',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001', '/firebase-messaging-sw.js': 'http://localhost:3001' },
  },
  build: { chunkSizeWarningLimit: 4000 },
});
