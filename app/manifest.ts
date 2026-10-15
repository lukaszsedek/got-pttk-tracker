import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GOT PTTK Tracker",
    short_name: "GOT Tracker",
    description: "Planuj, przeglądaj i uzupełniaj książeczkę GOT PTTK",
    start_url: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#16a34a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
