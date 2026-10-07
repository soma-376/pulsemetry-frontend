import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import storybook from "eslint-plugin-storybook";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...storybook.configs["flat/recommended"],
  {
    files: ["**/*.{jsx,tsx}"],
    settings: {
      "jsx-a11y": {
        // Icon은 장식용 SVG이므로 버튼의 텍스트 이름으로 간주하지 않습니다.
        components: { Icon: "svg" },
      },
    },
    rules: {
      "jsx-a11y/label-has-associated-control": [
        "error",
        {
          controlComponents: ["Input", "Select"],
          assert: "either",
          depth: 3,
        },
      ],
      "jsx-a11y/control-has-associated-label": [
        "error",
        {
          controlComponents: ["Button", "ButtonLink"],
          // 이 규칙은 상위·외부 label을 해석하지 못합니다. label 연결은 위 규칙으로 검사합니다.
          ignoreElements: ["input", "select", "textarea"],
          depth: 3,
        },
      ],
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "storybook-static/**",
    ".storybook/public/mockServiceWorker.js",
    "next-env.d.ts",
  ]),
  // 포맷은 Prettier가 담당하며, 충돌하는 ESLint 스타일 규칙은 끕니다.
  prettier,
]);

export default eslintConfig;
