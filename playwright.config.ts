import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: "http://127.0.0.1:4173",
    storageState: ".tmp/playwright/auth.json",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "VITE_API_BASE_URL= VITE_API_PROXY_TARGET=http://127.0.0.1:4317 npx --yes pnpm@10.12.4 --filter @waha-command-center/web build && VITE_API_BASE_URL= VITE_API_PROXY_TARGET=http://127.0.0.1:4317 npx --yes pnpm@10.12.4 --filter @waha-command-center/web start --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: "list",
})
