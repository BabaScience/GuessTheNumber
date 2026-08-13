import type { Metadata, Viewport } from "next";
import { Inter_Tight, Martian_Mono } from "next/font/google";

import "./globals.css";

// Self-hosted by next/font at build time — no render-blocking request to
// Google, and no layout shift when the face swaps in.
const body = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const mono = Martian_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Higher / Lower — a two-player number duel",
  description:
    "Two players, two secret numbers. Take turns guessing, watch each other close in, and the first to land it exactly takes the round.",
  applicationName: "Higher / Lower",
  openGraph: {
    title: "Higher / Lower",
    description: "A two-player number duel. Make a room, share the code, start hunting.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0F1319",
  width: "device-width",
  initialScale: 1,
  // The keypad sits near the bottom edge on phones; let the page paint under
  // the home indicator rather than leaving a dead strip.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
