import { readFile } from "node:fs/promises"

import { test as base } from "@playwright/test"

import { type E2ESeedMetadata, e2eSeedMetadataSchema, seedMetadataPath } from "./seed-fixture"

type DashboardFixtures = Readonly<{
  seed: E2ESeedMetadata
}>

export const test = base.extend<DashboardFixtures>({
  seed: [
    async ({ browserName: _browserName }, use) => {
      const contents = await readFile(seedMetadataPath, "utf8")
      await use(e2eSeedMetadataSchema.parse(JSON.parse(contents)))
    },
    { scope: "worker" },
  ],
})

export { expect } from "@playwright/test"
