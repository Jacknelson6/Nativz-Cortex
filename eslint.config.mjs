import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import cortexRules from "./lib/eslint/rules/try-finally-loading-state.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      // Custom rules live under lib/eslint/rules/. Inline plugin instead of
      // a separate npm package — the rules are project-specific and
      // shipping them as a workspace dep would be ceremony.
      cortex: cortexRules,
    },
    rules: {
      // Server components use try/catch for data fetching errors, not rendering
      "react-hooks/error-boundaries": "off",
      // We use refs for tracking previous values in providers
      "react-hooks/refs": "off",
      // We intentionally set state in effects for route-change cleanup
      "react-hooks/set-state-in-effect": "off",
      // Origin: 2026-04-26 admin-loading audit. Caught 21 components where
      // setLoading(true) had no try/finally — unhandled throws stranded the
      // loader. The rule enforces the codebase convention going forward.
      "cortex/try-finally-loading-state": "error",
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
