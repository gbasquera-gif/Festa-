/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        navy: "#0F2A4F",
        coral: "#F06853",
        gold: "#C7A360",
        cream: "#FDF9F4",
      },
      fontFamily: {
        sans: ["Nunito_400Regular"],
        "sans-bold": ["Nunito_700Bold"],
        "sans-extrabold": ["Nunito_800ExtraBold"],
      },
    },
  },
  plugins: [],
};
