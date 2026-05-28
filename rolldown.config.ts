import { defineConfig } from "rolldown";
import { dts } from "rolldown-plugin-dts";

export default defineConfig({
  input: {
    index: "src/index.ts",
    metrics: "src/metrics.ts",
    tail: "src/tail.ts",
  },
  output: {
    dir: "dist",
    format: "esm",
    entryFileNames: "[name].js",
    chunkFileNames: "chunks/[name]-[hash].js",
  },
  platform: "neutral",
  external: [
    "cloudflare:workers",
    /^node:/,
    "flat",
    "ulid-workers",
  ],
  plugins: [dts()],
});
