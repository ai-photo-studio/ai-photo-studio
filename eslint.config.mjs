// R9.2-P5A minimal truthful lint harness.
//
// Smallest ESLint 9 flat config built from currently installed root
// packages only (typescript-eslint, eslint-plugin-react-hooks, globals).
// No historical config was restored; this is a fresh minimal baseline.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.wrangler/**",
      "**/coverage/**",
      "apps/web/playwright-report/**",
      "apps/web/test-results/**",
      "apps/api/prisma/generated/**",
      "**/*.d.ts"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser }
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_"
        }
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-unused-vars": "off"
    }
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error"
    }
  },
  {
    files: ["apps/api/runpod-worker-dev/**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node }
    }
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node }
    }
  }
);
