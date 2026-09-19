import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * ESLint flat config.
 *
 * eslint-config-next 16 ships flat config arrays directly, so they are spread
 * here rather than adapted through FlatCompat — the compat layer chokes on the
 * plugin's circular references on ESLint 9.
 */
const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "src/generated/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // Scripts, seeds and the background worker are allowed to log to stdout.
    files: ["prisma/**/*.ts", "scripts/**/*.ts", "src/server/jobs/**/*.ts"],
    rules: { "no-console": "off" },
  },
];

export default config;
