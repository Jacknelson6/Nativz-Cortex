import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

// Parse .env.local into key-value pairs
function loadDotEnv(filePath: string): Record<string, string> {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const env: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
    }
    return env;
  } catch {
    return {};
  }
}

const projectRoot = path.resolve(__dirname, "..");
const envVars = loadDotEnv(path.resolve(projectRoot, ".env.local"));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", ".next", "scripts"],
    env: envVars,
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, ".."),
    },
  },
});
