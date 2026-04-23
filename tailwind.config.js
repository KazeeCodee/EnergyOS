/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#F6F8FA",
          medium: "#FFFFFF",
          border: "#DDE5EA",
          soft: "#FFFFFF",
          ink: "#0F172A",
        },
        forest: {
          DEFAULT: "#168056",
          dark: "#0F6542",
          light: "#137A4F",
        },
        ivory: "#101828",
        mist: "#667085",
        alert: "#B7791F",
        danger: "#D44F4F",
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
