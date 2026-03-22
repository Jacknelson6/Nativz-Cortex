import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Server components use try/catch for data fetching errors, not rendering
      "react-hooks/error-boundaries": "off",
      // We use refs for tracking previous values in providers
      "react-hooks/refs": "off",
      // We intentionally set state in effects for route-change cleanup
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent/plugin hooks use CommonJS require(); not part of the Next app bundle
    ".claude/**",
    // Git submodule — lint the app repo only
    "ac-knowledge-graph/**",
  ]),
]);

export default eslintConfig;
