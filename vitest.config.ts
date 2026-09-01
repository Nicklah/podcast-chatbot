import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only the pure logic is unit tested. The React components and the network
    // call are exercised by running the app, not by mocking half of Next.js.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
