/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        navy: "#14304C",
        coral: "#F2674C",
        gold: "#D3A24E",
        cream: "#FBF6EE",
        // Bege dos blocos de imagem/áreas de destaque (mais quente que o cream).
        linen: "#F3EADC",
        // Cor das bordas — bege esmaecido, nunca cinza puro.
        sand: "#E8DCC8",
      },
      fontFamily: {
        sans: ["Nunito_400Regular"],
        "sans-semibold": ["Nunito_600SemiBold"],
        "sans-bold": ["Nunito_700Bold"],
        "sans-extrabold": ["Nunito_800ExtraBold"],
      },
    },
  },
  plugins: [],
};
