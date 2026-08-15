/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          coral: "#FF4D4D",
          crimson: "#F43F5E",
          indigo: "#4F46E5",
          violet: "#6366F1",
        },
        tint: {
          mint: "#E6FFFA",
          lilac: "#F3E8FF",
          peach: "#FFF1F2",
          sky: "#EFF6FF",
        }
      }
    },
  },
  plugins: [],
}

