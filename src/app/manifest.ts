import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tapos na ba?",
    short_name: "Tapos na ba",
    description: "Cat-care task tracker with photo evidence and QA.",
    // The helper is the one who installs this on her phone, so launching from
    // the home screen goes straight to her task list instead of bouncing
    // through "/" (which redirects by role).
    start_url: "/today",
    display: "standalone",
    background_color: "#f6f1ea",
    theme_color: "#ec6203",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
