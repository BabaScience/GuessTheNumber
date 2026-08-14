"use client";

import { useState } from "react";

import { buzz } from "@/lib/haptics";
import type { PublicRoom } from "@/lib/protocol";

type Props = { room: PublicRoom; onLeave: () => void };

/** Clipboard needs a secure context; fall back so http:// LAN testing works. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function LobbyScreen({ room, onLeave }: Props) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const shareUrl =
    typeof window === "undefined" ? "" : `${window.location.origin}/?room=${room.code}`;

  const flash = (what: "code" | "link") => {
    buzz("nudge");
    setCopied(what);
    setTimeout(() => setCopied(null), 1800);
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Higher / Lower",
          text: `Join my room — code ${room.code}`,
          url: shareUrl,
        });
        return;
      } catch {
        // Sheet dismissed, or sharing isn't allowed here.
      }
    }
    if (await copyText(shareUrl)) flash("link");
  };

  return (
    <main className="stage stage--center">
      <p className="eyebrow">Room open</p>
      <h2 className="title">Send this to your opponent</h2>

      <button
        type="button"
        className="codebox"
        onClick={async () => {
          if (await copyText(room.code)) flash("code");
        }}
        aria-label={`Room code ${room.code.split("").join(" ")}. Tap to copy.`}
      >
        {room.code.split("").map((char, i) => (
          <span key={i} className="codebox-char">
            {char}
          </span>
        ))}
      </button>

      <p className="note" aria-live="polite">
        {copied === "code"
          ? "Code copied."
          : copied === "link"
            ? "Invite link copied."
            : "Tap the code to copy it."}
      </p>

      <div className="choice">
        <button type="button" className="btn btn--primary btn--block" onClick={share}>
          Share invite link
        </button>
        <button type="button" className="btn btn--block" onClick={onLeave}>
          Close the room
        </button>
      </div>

      <div className="waiting">
        <span className="dot" />
        <span>
          Waiting for someone to join — {room.levelName}, 1 to {room.max}
        </span>
      </div>
    </main>
  );
}
