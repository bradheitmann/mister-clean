import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: appRoot,
  base: "./",
  // Never let mutable dependency optimizer state influence a release build.
  // tsup clears dist before this build, so every generated candidate starts
  // from an empty, candidate-local Vite cache.
  cacheDir: "../dist/.vite-cache",
  plugins: [svelte()],
  publicDir: false,
  build: {
    outDir: "../dist/control-plane",
    emptyOutDir: true,
  },
});
