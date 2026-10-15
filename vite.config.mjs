import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  build: {
    rollupOptions: {
      input: { app: resolve("index.html"), seo: resolve("seo.html") },
    },
  },
});
