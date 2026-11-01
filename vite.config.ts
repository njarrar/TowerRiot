import { defineConfig } from 'vite';

// Relative base so the same build runs from a web server, a file inside the
// iOS/Android app bundle (Capacitor), or a sub-folder on GitHub Pages.
export default defineConfig({
  base: './',
  build: { target: 'es2020', assetsInlineLimit: 0, sourcemap: false },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as never);
