/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Kingdom palette */
        teal: {
          cathedral: "#00A8A8",
        },
        indigo: {
          cathedral: "#1A1B3A",
          light: "#2A2B5A",
        },
        crimson: {
          cathedral: "#E63946",
        },
        gold: {
          cathedral: "#FFD700",
        },
        /* Supporting tones */
        "soft-gray": {
          DEFAULT: "#F0F2F5",
        },
        "off-white": {
          DEFAULT: "#FAFBFC",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      /* Fibonacci spacing scale */
      spacing: {
        "fib-1": "1px",
        "fib-2": "2px",
        "fib-3": "3px",
        "fib-5": "5px",
        "fib-8": "0.5rem",     /* 8px */
        "fib-13": "0.8125rem", /* 13px */
        "fib-21": "1.3125rem", /* 21px */
        "fib-34": "2.125rem",  /* 34px */
        "fib-55": "3.4375rem", /* 55px */
        "fib-89": "5.5625rem", /* 89px */
        "fib-144": "9rem",     /* 144px */
        "fib-233": "14.5625rem", /* 233px */
      },
      borderRadius: {
        "fib": "8px",
        "fib-lg": "13px",
        "fib-xl": "21px",
      },
      maxWidth: {
        "fib-sm": "377px",  /* Fibonacci */
        "fib-md": "610px",  /* Fibonacci */
        "fib-lg": "987px",  /* Fibonacci */
      },
    },
  },
  plugins: [],
};
