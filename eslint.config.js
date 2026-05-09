import js from "@eslint/js";
import importPlugin from "eslint-plugin-import-x";
import unicorn from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.all,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "import-x": importPlugin,
      unicorn,
    },
    rules: {
      ...importPlugin.configs.recommended.rules,
      ...importPlugin.configs.typescript.rules,
      ...unicorn.configs.recommended.rules,
      "import-x/order": [
        "error",
        {
          alphabetize: {
            caseInsensitive: true,
            order: "asc",
          },
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
            "object",
            "type",
          ],
          "newlines-between": "always",
        },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "off",
      "capitalized-comments": "off",
      "func-style": "off",
      "max-lines-per-function": [
        "error",
        {
          max: 120,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      "max-statements": [
        "error",
        {
          max: 25,
        },
      ],
      "new-cap": [
        "error",
        {
          capIsNewExceptions: [
            "Fastify",
            "Type.Array",
            "Type.Boolean",
            "Type.Literal",
            "Type.Number",
            "Type.Object",
            "Type.Optional",
            "Type.Record",
            "Type.String",
            "Type.Union",
          ],
        },
      ],
      "no-await-in-loop": "off",
      "no-continue": "off",
      "no-magic-numbers": [
        "error",
        {
          ignore: [0, 1, 2, 200, 3000, 503],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
        },
      ],
      "no-ternary": "off",
      "no-undefined": "off",
      "no-use-before-define": [
        "error",
        {
          classes: true,
          functions: false,
          variables: true,
        },
      ],
      "no-void": [
        "error",
        {
          allowAsStatement: true,
        },
      ],
      "one-var": "off",
      "sort-imports": "off",
      "sort-keys": "off",
      "sort-vars": "off",
      "unicorn/import-style": "off",
      "unicorn/prevent-abbreviations": [
        "error",
        {
          allowList: {
            db: true,
            env: true,
            createDbClient: true,
            id: true,
            migrationsDir: true,
            s3: true,
          },
        },
      ],
    },
    settings: {
      "import-x/resolver": {
        node: true,
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
  },
  {
    ignores: ["dist/**", "coverage/**", "openapi/**", "eslint.config.js"],
  },
);
