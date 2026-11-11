/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        // Phone turned sideways (short landscape screen)
        ls: { raw: '(orientation: landscape) and (max-height: 540px)' },
      },
    },
  },
  plugins: [],
}
