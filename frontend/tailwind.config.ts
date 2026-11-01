import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0B0D10", surface: "#12161C", elevated: "#191F27", line: "#242B35",
        ink: "#F3F4F6", mute: "#929BA8", accent: "#8B9CF6",
        ok: "#35B779", warn: "#E7AD52", bad: "#E36C75",
      },
      fontFamily: {
        serif: ["Charter", "Iowan Old Style", "Palatino Linotype", "Book Antiqua", "Georgia", "serif"],
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: { DEFAULT: "4px", md: "6px", lg: "8px" },
    },
  },
  plugins: [],
};
export default config;
