const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({ baseDirectory: __dirname });

module.exports = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["**/*.config.js", "**/*.config.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
  },
];
