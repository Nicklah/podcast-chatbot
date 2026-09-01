import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Vitest doesn't read the "paths" in tsconfig.json — that's only for the type
  // checker and for Next's own bundler. So "@/..." has to be spelled out again
  // here, or test files that use it fail to resolve.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Only the pure logic is unit tested. The React components are exercised by
    // running the app, not by mocking half of Next.js.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
