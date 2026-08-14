"use client";

/**
 * Short vibrations for the moments that matter on a phone.
 *
 * On a touchscreen this carries more of the feel than animation does — you
 * register a buzz before you've read the word. Silently absent on desktop and
 * on iOS Safari, which doesn't implement the Vibration API; nothing depends on
 * it working.
 */

type Pattern = number | number[];

const PATTERNS = {
  /** A key on the pad. */
  tap: 8,
  /** Your guess came back higher or lower. */
  miss: 18,
  /** Something landed — a locked number, an opponent's move. */
  nudge: [12, 40, 12],
  /** You won. */
  win: [18, 60, 18, 60, 90],
  /** They won. */
  lose: [60, 80, 30],
  /** Rejected input. */
  refuse: [30, 50, 30],
} satisfies Record<string, Pattern>;

export type HapticName = keyof typeof PATTERNS;

export function buzz(name: HapticName) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(PATTERNS[name]);
  } catch {
    // Some browsers refuse without a user gesture; never let it throw upward.
  }
}
