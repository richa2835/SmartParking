/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Outfit", "system-ui", "sans-serif"],
      },
      colors: {
        ink: { DEFAULT: "#0f172a", muted: "#64748b" },
      },
      boxShadow: {
        glass: "0 25px 50px -12px rgba(0, 0, 0, 0.45)",
      },
    },
  },
  plugins: [],
};
