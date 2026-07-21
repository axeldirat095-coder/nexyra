import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    optimizeDeps: {
      exclude: ["@webcontainer/api"],
    },
    resolve: {
      dedupe: ['@tanstack/react-query', '@tanstack/query-core'],
    },
  },
});
