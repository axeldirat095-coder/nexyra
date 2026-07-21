import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    optimizeDeps: {
      exclude: ["@webcontainer/api"],
    },
  },
});
