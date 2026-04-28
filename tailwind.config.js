/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#FFFFFF",
          medium: "#F8FAFC",
          border: "#E2E8F0",
          soft: "#F1F5F9",
          ink: "#163759",
          deep: "#0d2136",
          mid: "#163759",
          accent: "#255a91",
        },
        forest: {
          DEFAULT: "#15caca",
          dark: "#0e8a8a",
          light: "#5de2e2",
        },
        ivory: "#163759",
        mist: "#64748B",
        alert: "#F59E0B",
        danger: "#EF4444",
      },
      fontFamily: {
        fraunces: ["Space Grotesk", "sans-serif"],
        syne: ["Space Grotesk", "sans-serif"],
        inter: ["Inter", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      boxShadow: {
        panel: "0 10px 34px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [],
};
