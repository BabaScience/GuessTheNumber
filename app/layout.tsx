import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";

import { THEME_BOOTSTRAP } from "@/lib/theme";

import "./globals.css";

/**
 * Fraunces carries the wordmark and the big moments — a soft optical serif,
 * warm without being cute. Plus Jakarta Sans runs the interface; its numerals
 * are even-width, which matters when every screen is full of them.
 *
 * Both are self-hosted by next/font at build time, so there is no render-blocking
 * request and no flash of a fallback face.
 */
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["SOFT", "WONK"],
});

const ui = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Higher / Lower",
  description:
    "A two-player number duel. Pick a number, share the code, and take turns closing in — first to land it exactly wins the round.",
  applicationName: "Higher / Lower",
  appleWebApp: { capable: true, title: "Higher / Lower", statusBarStyle: "default" },
  openGraph: {
    title: "Higher / Lower",
    description: "A two-player number duel. Make a room, share the code, start hunting.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The keypad sits against the bottom edge; let the page paint under the home
  // indicator instead of leaving a dead strip above it.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffcfd" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1218" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
