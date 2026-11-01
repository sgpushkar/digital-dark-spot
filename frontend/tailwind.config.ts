import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-background, #F5F4EF)",
        surface: "var(--color-surface, #FFFFFF)",
        elevated: "var(--color-surface-secondary, #E6E6DF)",
        line: "var(--color-border, #D8DAD1)",
        heading: "var(--color-heading, #242823)",
        ink: "var(--color-text, #343A34)",
        mute: "var(--color-muted, #789487)",
        primary: "var(--color-primary, #183B32)",
        accent: "var(--color-accent, #C5F36A)",
        ok: "var(--color-success, #438568)",
        warn: "var(--color-warning, #D49A42)",
        bad: "var(--color-danger, #C65D55)",
        neutral: "var(--color-neutral, #92978F)",
      },
      fontFamily: {
        heading: ["var(--font-heading)", "Manrope", "sans-serif"],
        sans: ["var(--font-body)", "Inter", "sans-serif"],
        mono: ["var(--font-mono)", "IBM Plex Mono", "monospace"],
        serif: ["var(--font-heading)", "Manrope", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
      },
      boxShadow: {
        sm: "0 1px 2px 0 rgba(24, 59, 50, 0.04)",
        DEFAULT: "0 2px 4px 0 rgba(24, 59, 50, 0.06), 0 1px 2px -1px rgba(24, 59, 50, 0.04)",
        md: "0 4px 8px -1px rgba(24, 59, 50, 0.08), 0 2px 4px -2px rgba(24, 59, 50, 0.05)",
        lg: "0 10px 15px -3px rgba(24, 59, 50, 0.08), 0 4px 6px -4px rgba(24, 59, 50, 0.04)",
      },
    },
  },
  plugins: [],
};
export default config;
