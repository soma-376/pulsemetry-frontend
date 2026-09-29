import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-themes", "msw-storybook-addon"],
  framework: "@storybook/nextjs-vite",
  staticDirs: ["../public", "./public"],
  viteFinal(config) {
    config.define = {
      ...config.define,
      "process.env.NEXT_PUBLIC_ENROLLMENT_API_URL": JSON.stringify("https://enrollment.storybook.invalid"),
      "process.env.NEXT_PUBLIC_DASHBOARD_API_URL": JSON.stringify("https://dashboard.storybook.invalid"),
    };
    return config;
  },
  core: { disableTelemetry: true },
};

export default config;
