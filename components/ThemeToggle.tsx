"use client";

import { useEffect, useState } from "react";

import { activeTheme, applyTheme, type Theme } from "@/lib/theme";

/**
 * Follows the phone's setting until you say otherwise, then remembers what you
 * chose. The icon shows what you'd switch *to*, which is the convention people
 * already read without thinking about it.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    // Reading the stored choice and the OS preference is a client-only job, so
    // it can't be a lazy initialiser without a hydration mismatch. Fires once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(activeTheme());

    // Keep following the system while no explicit choice has been made.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setTheme(activeTheme());
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const flip = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  };

  // Render nothing until mounted: the server has no idea which theme the
  // viewer is in, and guessing wrong swaps the icon on hydration.
  if (!theme) return <span className="icon-btn" aria-hidden="true" />;

  const toDark = theme === "light";

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={flip}
      aria-label={toDark ? "Switch to dark theme" : "Switch to light theme"}
    >
      {toDark ? (
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M16.5 12.6A7 7 0 0 1 7.4 3.5a7 7 0 1 0 9.1 9.1Z"
            fill="currentColor"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <circle cx="10" cy="10" r="3.6" />
          <path
            d="M10 1.6v2M10 16.4v2M1.6 10h2M16.4 10h2M4.1 4.1l1.4 1.4M14.5 14.5l1.4 1.4M15.9 4.1l-1.4 1.4M5.5 14.5l-1.4 1.4"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
