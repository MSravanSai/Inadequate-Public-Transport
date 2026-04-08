import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  // Use default Vite log level so startup URLs are visible
  // Remove or change this only if you want a quieter terminal.
  // logLevel: 'error',
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});