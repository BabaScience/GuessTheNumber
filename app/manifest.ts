import type { MetadataRoute } from "next";

/**
 * Lets the game be added to a home screen and opened without browser chrome —
 * on a phone that alone accounts for much of the difference between "a website"
 * and "an app".
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Higher / Lower",
    short_name: "Higher/Lower",
    description:
      "A two-player number duel. Pick a number, share the code, and take turns closing in.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fffcfd",
    theme_color: "#fffcfd",
    categories: ["games"],
    // One SVG rather than a spread of PNG sizes: it's a flat mark, so it scales
    // without help, and iOS gets its own PNG from app/apple-icon.tsx.
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
