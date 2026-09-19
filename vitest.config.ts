import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Two projects, because they have different costs and different failure modes.
 *
 * `unit` runs in milliseconds with no external dependencies, so it can run on
 * every save. `integration` needs a real PostgreSQL database — the things worth
 * testing here (SERIALIZABLE double-booking prevention, transactional outbox
 * writes, cascade behaviour) are exactly the things a mocked Prisma client
 * would happily let through.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    // Integration files share one database and truncate between tests, so
    // running two files at once would have them clearing each other's data
    // mid-test. Set at the top level because project configs do not take it.
    fileParallelism: false,
    projects: [
      {
        plugins: [tsconfigPaths()],
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        plugins: [tsconfigPaths()],
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
