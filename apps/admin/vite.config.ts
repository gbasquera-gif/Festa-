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
  optimizeDeps: {
    // @festae/shared is a pnpm-symlinked workspace package resolving
    // outside node_modules' real path, so Vite treats it as project
    // source instead of a dependency and skips esbuild's CJS→ESM
    // pre-bundling — its dist/index.js (CommonJS) then fails to expose
    // named exports to the dev server. Forcing it into optimizeDeps
    // makes esbuild convert it like any other dependency.
    include: ["@festae/shared"],
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
