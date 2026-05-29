import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Module load weight (leaflet, @react-pdf, jszip) puede tirar el
    // default 5s al borde bajo paralelismo. 30s da margen sin esconder
    // bugs reales.
    testTimeout: 30000,
  },
  resolve: { alias: { "@": resolve(__dirname, ".") } },
});
