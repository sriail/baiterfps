import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  publicDir: '../src/recources',
  build: {
    outDir: '../dist/client',
    emptyOutDir: true
  },
  server: {
    port: 3001,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true
      }
    }
  }
});
