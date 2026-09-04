import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "apps/web/src/lib/**/*.test.ts", "apps/api/src/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false,
  },
})
