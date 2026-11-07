import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      thresholds: {
        "src/lib/money.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/lib/dates.ts": { statements: 95, branches: 90, functions: 100, lines: 95 },
        "src/lib/percent.ts": { statements: 95, branches: 90, functions: 100, lines: 95 },
      },
    },
  },
});
