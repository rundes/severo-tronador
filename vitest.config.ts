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
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      // Sólo la lógica: los componentes se cubren con E2E, no con unit tests,
      // y meterlos acá bajaría el número sin decir nada útil.
      include: ["lib/**/*.ts"],
      exclude: ["lib/mock/**", "lib/**/*.d.ts"],
      // Umbral piso, no meta. Está calibrado sobre la cobertura real de hoy
      // para que CI falle ante una regresión (un módulo grande sin tests),
      // no para exigir un salto de golpe. Subirlo a medida que F6 cubra los
      // módulos que faltan.
      // Medido: statements 52%, branches 42%, functions 61%, lines 54%.
      thresholds: {
        lines: 50,
        functions: 58,
        statements: 48,
        branches: 40,
      },
    },
  },
  resolve: { alias: { "@": resolve(__dirname, ".") } },
});
