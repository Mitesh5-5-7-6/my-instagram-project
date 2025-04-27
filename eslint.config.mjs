// eslint.config.mjs
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

// Resolve __dirname and __filename (needed in ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// FlatCompat helps bring old configs (like extends) into Flat Config
const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Final ESLint config
const eslintConfig = [
  {
    ignores: [
      "node_modules/",
      ".next/",
      "dist/",
      "out/",
    ],
  },
  ...compat.extends(
    "next",
    "next/core-web-vitals",
    "next/typescript"
  ),
];

export default eslintConfig;
