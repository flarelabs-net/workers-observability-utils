import { cloudflarePool } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: cloudflarePool({
      miniflare: {
        compatibilityDate: "2025-04-01",
      },
    }),
  },
});
