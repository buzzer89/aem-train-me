import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        deloitte: {
          green: "#86BC25",
          black: "#000000",
          darkGreen: "#2C5234",
          gray: "#53565A",
          lightGray: "#D0D0CE",
          warmGray: "#C4BFB6",
        },
      },
    },
  },
  plugins: [],
};
export default config;
