import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts on purpose: Vitest must not load the iwsdkDev()
// plugin (dev server, MCP bridge). Unit tests only cover pure logic and data.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
