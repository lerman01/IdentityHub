import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // The OAuth callback URL and session cookies assume fixed ports — fail
    // loudly if 5173 is taken instead of silently shifting.
    strictPort: true,
    // Same-origin API in dev: the browser only ever talks to :5173, so no CORS.
    // IPv4 explicitly — on some setups `localhost` resolves to ::1 while
    // Express listens on IPv4.
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
});
