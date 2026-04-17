import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// v2.10: split into two projects — renderer (jsdom) and electron main (node).
// Tests are colocated next to the code they cover:
//   src/**/*.test.{ts,tsx}       → renderer project (jsdom)
//   electron/**/*.test.ts        → main project (node)
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "renderer",
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/*.{test,spec}.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "main",
          environment: "node",
          include: ["electron/**/*.{test,spec}.ts"],
        },
      },
    ],
  },
});
