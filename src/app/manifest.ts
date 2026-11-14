import type { MetadataRoute } from "next";

/** Manifeste de l'application installable (« Ajouter à l'écran d'accueil » sur téléphone). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Cerise · SUSU",
    short_name: "Cerise",
    description: "Affaires, rendez-vous et forecast de l'équipe commerciale SUSU",
    lang: "fr",
    start_url: "/affaires",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbfbf9",
    theme_color: "#14213d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Mes rendez-vous", url: "/agenda", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Actions à faire", url: "/affaires?vue=relances", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Ajouter", url: "/ajouter", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
