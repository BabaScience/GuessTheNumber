"use client";

/**
 * Light and dark are both first-class. With nothing stored we follow the
 * phone's own setting, and a stored choice overrides it in either direction.
 */

export type Theme = "light" | "dark";

const KEY = "hld:theme";

/**
 * Runs before first paint, inlined into the document head. Without it the page
 * renders light, then corrects itself once React mounts — a white flash in a
 * dark room, which is exactly when it's most unpleasant.
 */
export const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})()`;

export function storedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

/** What the viewer is actually looking at, stored choice or not. */
export function activeTheme(): Theme {
  const stored = storedTheme();
  if (stored) return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    // Private browsing — the choice just won't survive a reload.
  }
}
