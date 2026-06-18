import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#1f2933",
        field: "#f7faf9",
        line: "#d8e0df",
        mint: "#2f7d68",
        gold: "#b57931"
      }
    }
  },
  plugins: []
};

export default config;
