import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The client is served by the live-rate server in production; in development `npm run dev` serves it through Vite middleware.
export default defineConfig({
  plugins: [react()],
  test: { exclude: ['**/node_modules/**', '**/dist/**', '**/dist-server/**'] },
  server: { allowedHosts: process.env.VITE_ALLOW_ANY_HOST === 'true' ? true : undefined }
});
