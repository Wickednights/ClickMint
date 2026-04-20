import type { Config } from "tailwindcss";
import { BLOCK_BET_RING_OUTER_WIDTH_REM } from "./lib/block-bet-ring-layout";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#131313",
        surface: "#131313",
        "surface-dim": "#131313",
        "surface-container-lowest": "#0e0e0e",
        "surface-container-low": "#1b1b1b",
        "surface-container": "#1f1f1f",
        "surface-container-high": "#2a2a2a",
        "surface-container-highest": "#353535",
        "surface-bright": "#393939",
        "surface-variant": "#353535",
        primary: "#ffffff",
        "primary-container": "#00fbfb",
        "primary-fixed": "#00fbfb",
        "primary-fixed-dim": "#00dddd",
        secondary: "#93d2d1",
        "secondary-fixed": "#aeeeed",
        "secondary-container": "#035252",
        tertiary: "#ffffff",
        "on-surface": "#e2e2e2",
        "on-background": "#e2e2e2",
        "on-primary": "#003737",
        "on-primary-fixed": "#002020",
        outline: "#839493",
        "outline-variant": "#3a4a49",
        "on-surface-variant": "#b9cac9",
      },
      fontFamily: {
        headline: ["var(--font-space-grotesk)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
        label: ["var(--font-space-grotesk)", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0",
        lg: "0",
        xl: "0",
        full: "9999px",
      },
      maxWidth: {
        "block-bet-ring": `${BLOCK_BET_RING_OUTER_WIDTH_REM}rem`,
      },
    },
  },
  plugins: [],
} satisfies Config;
