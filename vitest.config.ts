import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const webDependency = (name: string): string =>
  fileURLToPath(new URL(`./apps/web/node_modules/${name}`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      // react is not hoisted to the workspace root; alias so tests/ can render components.
      react: webDependency("react"),
      "react-dom": webDependency("react-dom"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "apps/web/src/lib/**/*.test.ts", "apps/api/src/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false,
  },
})
