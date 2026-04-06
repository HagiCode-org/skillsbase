import path from "node:path";
import { builtinModules } from "node:module";

import { defineConfig } from "vite";

const nodeExternals = new Set([
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
]);

export default defineConfig({
  build: {
    target: "node22",
    minify: false,
    sourcemap: false,
    emptyOutDir: true,
    outDir: "dist",
    lib: {
      entry: path.resolve("src/cli-entry.ts"),
      formats: ["es"],
      fileName: () => "cli.mjs",
    },
    rollupOptions: {
      external: (id) => nodeExternals.has(id),
    },
  },
});
