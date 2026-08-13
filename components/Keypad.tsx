"use client";

import { useEffect } from "react";

import { play } from "@/lib/sound";

type Props = {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  maxDigits: number;
};

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * On-screen keypad that also binds the physical keyboard, so the game feels
 * native whether you're on a phone or at a desk.
 */
export function Keypad({ value, onChange, onSubmit, disabled, maxDigits }: Props) {
  const pressDigit = (digit: string) => {
    if (disabled) return;
    // No guess starts with zero, so a leading 0 is always a mis-tap.
    if (!value && digit === "0") return;
    const next = value + digit;
    if (next.length > maxDigits) return;
    play("tap");
    onChange(next);
  };

  const backspace = () => {
    if (disabled || !value) return;
    play("tap");
    onChange(value.slice(0, -1));
  };

  useEffect(() => {
    if (disabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // Don't hijack typing that's meant for a text field.
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        pressDigit(event.key);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        backspace();
      } else if (event.key === "Enter" && value) {
        event.preventDefault();
        onSubmit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="pad" role="group" aria-label="Number keypad">
      {DIGITS.map((digit) => (
        <button
          key={digit}
          type="button"
          className="pad-key"
          onClick={() => pressDigit(digit)}
          disabled={disabled}
        >
          {digit}
        </button>
      ))}
      <button
        type="button"
        className="pad-key pad-key--sub"
        onClick={backspace}
        disabled={disabled || !value}
        aria-label="Delete last digit"
      >
        ⌫
      </button>
      <button type="button" className="pad-key" onClick={() => pressDigit("0")} disabled={disabled}>
        0
      </button>
      <button
        type="button"
        className="pad-key pad-key--go"
        onClick={onSubmit}
        disabled={disabled || !value}
        aria-label="Submit guess"
      >
        ↵
      </button>
    </div>
  );
}
