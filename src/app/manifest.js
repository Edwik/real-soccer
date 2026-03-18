export default function manifest() {
  return {
    name: "RealSoccer IA",
    short_name: "RealSoccer",
    description:
      "Análisis de partidos de fútbol y estimación de probabilidades para mercados de apuesta.",
    start_url: "/",
    display: "standalone",
    background_color: "#050b1a",
    theme_color: "#050b1a",
    orientation: "portrait",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "64x64",
        type: "image/x-icon",
      },
    ],
  };
}
