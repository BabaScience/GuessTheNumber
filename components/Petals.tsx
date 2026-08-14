"use client";

import { useMemo } from "react";

/**
 * Blossom falling across the screen when you win. Deliberately brief and only
 * on a win — the moment has to feel like something, but a celebration you can't
 * dismiss stops being one by the third round.
 *
 * Hidden entirely under prefers-reduced-motion (see globals.css).
 */
export function Petals({ count = 18 }: { count?: number }) {
  // Positions are fixed for the life of the component, so a re-render mid-fall
  // doesn't teleport every petal.
  const petals = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: (i * 37 + ((i * i) % 23)) % 100,
        delay: (i % 7) * 0.16,
        duration: 2.6 + ((i * 13) % 9) * 0.18,
        scale: 0.7 + ((i * 5) % 7) * 0.12,
        drift: ((i % 5) - 2) * 14,
      })),
    [count],
  );

  return (
    <div className="petals" aria-hidden="true">
      {petals.map((p, i) => (
        <span
          key={i}
          className="petal"
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `scale(${p.scale}) translateX(${p.drift}px)`,
            opacity: 0.55 + ((i % 4) * 0.12),
          }}
        />
      ))}
    </div>
  );
}
