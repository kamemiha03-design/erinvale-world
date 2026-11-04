import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    sourcemap: false,
    assetsInlineLimit: 4096,
  },
  server: {
    host: "0.0.0.0",
  },
});