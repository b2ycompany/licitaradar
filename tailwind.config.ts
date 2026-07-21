import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        papel: "#F5F4EF",
        tinta: "#1B2A21",
        verde: "#0E6245",
        "verde-escuro": "#0A4632",
        ambar: "#B45309",
        vermelho: "#B3261E",
        borda: "#E2E0D6",
        cinza: "#6B7268",
      },
      fontFamily: {
        sans: ["Archivo", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
