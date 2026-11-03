import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    env: {
      DATABASE_ENABLED: 'false',
      DISCORD_ENABLED: 'false',
    },
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
