import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  server: {
    host: true,
    port: 5174,
  },
  build: {
    commonjsOptions: {
      // pnpm symlinks workspace packages outside of node_modules' real path,
      // so Rollup's default node_modules-only heuristic misses @festae/shared
      // and fails to convert its CJS build, dropping all named exports.
      include: [/packages\/shared/, /node_modules/],
    },
  },
});
