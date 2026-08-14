"use client";

import { MAX_NAME_LENGTH, ROOM_CODE_LENGTH, isValidCode, normalizeCode } from "@/lib/game";
import type { Duel } from "@/lib/use-duel";

type Props = {
  duel: Duel;
  name: string;
  onNameChange: (next: string) => void;
  code: string;
  onCodeChange: (next: string) => void;
};

export function JoinScreen({ duel, name, onNameChange, code, onCodeChange }: Props) {
  const ready = isValidCode(code);
  const submit = () => {
    if (ready && !duel.busy) duel.join(code, name);
  };

  return (
    <main className="stage stage--center">
      <p className="eyebrow">Join a room</p>
      <h2 className="title">What&apos;s the code?</h2>

      <input
        className="input input--code"
        value={code}
        maxLength={ROOM_CODE_LENGTH}
        placeholder="••••"
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Room code"
        autoFocus
        onChange={(event) => onCodeChange(normalizeCode(event.target.value))}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit();
        }}
      />

      {/* Arriving by invite link skips the home screen, so this is the guest's
          only chance to say who they are. */}
      <label className="field">
        <span className="field-label">What should we call you?</span>
        <input
          className="input"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          placeholder="Anonymous"
          autoComplete="nickname"
          onChange={(event) => onNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
        />
      </label>

      {duel.error && <p className="note note--warn">{duel.error}</p>}

      <div className="choice">
        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={submit}
          disabled={duel.busy || !ready}
        >
          {duel.busy ? "Looking…" : "Join the room"}
        </button>
        <button type="button" className="btn btn--block" onClick={() => duel.goHome()}>
          Back
        </button>
      </div>
    </main>
  );
}
