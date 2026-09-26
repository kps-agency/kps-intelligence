// @kps/config eslint flat config base — étendu par apps/web et apps/api.
const tseslint = require("typescript-eslint");
const eslintConfigPrettier = require("eslint-config-prettier");

/** @type {import("eslint").Linter.Config[]} */
module.exports = [
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: ["**/*.config.js", "**/*.config.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    ignores: ["dist/**", ".next/**", "node_modules/**", "coverage/**"],
  },
];
