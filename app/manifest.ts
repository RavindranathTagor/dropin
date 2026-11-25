import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dropin",
    short_name: "Dropin",
    description: "Share one vehicle home. The fare splits as people hold seats.",
    start_url: "/",
    display: "standalone",
    background_color: "#F2F3F5",
    theme_color: "#FFC107",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
