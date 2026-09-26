import type { Config } from "tailwindcss";
import basePreset from "@kps/config/tailwind-preset.js";

const config: Config = {
  presets: [basePreset],
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
};

export default config;
