import type { MetadataRoute } from "next";

/** Lets people add the site to their phone's home screen like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Family Reunion",
    short_name: "Family",
    description: "Our family tree, and how everyone is related.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f1e8",
    theme_color: "#2f6b4f",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
