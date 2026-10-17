import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 相対パスにしておくと GitHub Pages のサブパスでもそのまま動く
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
