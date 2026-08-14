import { ImageResponse } from "next/og";

/**
 * iOS won't take an SVG for a home-screen icon, so this renders the same mark
 * as a PNG at build time. Without it, adding the game to a home screen gets a
 * screenshot of the page instead of an icon.
 */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fffcfd",
          color: "#2e1f2a",
          fontSize: 104,
          fontWeight: 700,
          letterSpacing: "-0.04em",
        }}
      >
        <span>↑</span>
        <span style={{ color: "#e4607f", margin: "0 2px" }}>/</span>
        <span>↓</span>
      </div>
    ),
    size,
  );
}
