/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          cathedral: "#1B2D4F",
        },
        "sky-accent": {
          DEFAULT: "#6BA3D6",
        },
        sage: {
          cathedral: "#8CAA7E",
        },
        "emerald-accent": {
          DEFAULT: "#2D8659",
        },
        "soft-gray": {
          DEFAULT: "#F0F2F5",
        },
        "off-white": {
          DEFAULT: "#FAFBFC",
        },
        "calm-error": {
          DEFAULT: "#C9474B",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
