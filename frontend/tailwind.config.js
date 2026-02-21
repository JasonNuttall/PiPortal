/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        crystal: {
          void: "#060612",
          blue: "#38bdf8",
          teal: "#2dd4bf",
          white: "#f0f0ff",
          "deep-teal": "#0f766e",
          seafoam: "#5eead4",
        },
        glass: {
          DEFAULT: "rgba(56, 189, 248, 0.04)",
          hover: "rgba(56, 189, 248, 0.08)",
          border: "rgba(56, 189, 248, 0.1)",
          "border-hover": "rgba(56, 189, 248, 0.22)",
        },
        ctext: {
          DEFAULT: "rgba(240, 240, 255, 0.92)",
          mid: "rgba(200, 200, 240, 0.55)",
          dim: "rgba(160, 160, 220, 0.32)",
        },
      },
      fontFamily: {
        spectral: ['"Spectral"', "serif"],
        "source-code": ['"Source Code Pro"', "monospace"],
      },
      borderRadius: {
        crystal: "4px",
      },
      keyframes: {
        "cdrift-a": {
          from: { transform: "translate(0, 0) scale(1)" },
          to: { transform: "translate(50px, 35px) scale(1.1)" },
        },
        "cdrift-b": {
          from: { transform: "translate(0, 0) scale(1)" },
          to: { transform: "translate(-40px, 50px) scale(1.08)" },
        },
        "crystal-pulse": {
          from: { opacity: "0.12", transform: "scale(0.98)" },
          to: { opacity: "0.35", transform: "scale(1.02)" },
        },
        rise: {
          from: { opacity: "0", transform: "translateY(22px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 4px #38bdf8" },
          "50%": {
            boxShadow: "0 0 14px #38bdf8, 0 0 24px rgba(56, 189, 248, 0.4)",
          },
        },
      },
      animation: {
        "cdrift-a": "cdrift-a 18s ease-in-out infinite alternate",
        "cdrift-b": "cdrift-b 22s ease-in-out infinite alternate",
        "crystal-pulse": "crystal-pulse ease-in-out infinite alternate",
        rise: "rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both",
        "pulse-glow": "pulse-glow 2.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
