/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        /** LangChain brand — sky blue from official squircle + black mark */
        lc: {
          brand: "#7FC8FF",
          "brand-hover": "#5CB6F7",
          muted: "#E0F3FF",
          surface: "#F3FAFF",
          deep: "#2FA3E8",
          ink: "#0A0A0A",
          "ink-muted": "#525252",
          border: "#C5E3FB",
        },
        /** Warm neutrals (compat aliases used across components) */
        paper: {
          DEFAULT: "#F8FBFF",
          muted: "#EEF6FD",
          border: "#C5E3FB",
        },
        clay: {
          DEFAULT: "#7FC8FF",
          hover: "#5CB6F7",
          muted: "#E0F3FF",
        },
        ink: {
          DEFAULT: "#0A0A0A",
          muted: "#525252",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "sans-serif",
        ],
        ui: [
          "Inter",
          "system-ui",
          "sans-serif",
        ],
        display: [
          "Inter",
          "system-ui",
          "sans-serif",
        ],
      },
      boxShadow: {
        lc: "0 1px 3px rgba(10, 10, 10, 0.06), 0 4px 12px rgba(145, 201, 255, 0.25)",
      },
    },
  },
  plugins: [],
};
