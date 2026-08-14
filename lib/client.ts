"use client";

import type {
  Credentials,
  ErrorCode,
  GuessResponse,
  JoinResponse,
  PublicRoom,
  RoomResponse,
  UnchangedResponse,
} from "./protocol";

const CREDENTIALS_KEY = "hld:credentials";
const NAME_KEY = "hld:name";

/** Thrown for any non-2xx reply, carrying the server's human-readable message. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: ErrorCode;
  constructor(status: number, message: string, code?: ErrorCode) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** `auth`, not `credentials` — RequestInit already owns that name. */
async function request<T>(
  path: string,
  init: Omit<RequestInit, "credentials"> & { auth?: Credentials } = {},
): Promise<T> {
  const { auth, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (rest.body) headers.set("Content-Type", "application/json");
  if (auth) {
    headers.set("x-player-id", auth.playerId);
    headers.set("x-player-token", auth.token);
  }

  let res: Response;
  try {
    res = await fetch(path, { ...rest, headers, cache: "no-store" });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!res.ok) {
    const shaped = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const message =
      typeof shaped.error === "string" ? shaped.error : `Something went wrong (${res.status}).`;
    const code = typeof shaped.code === "string" ? (shaped.code as ErrorCode) : undefined;
    throw new ApiError(res.status, message, code);
  }
  return body as T;
}

/* -------------------------------------------------------------------------- */
/* endpoints                                                                  */
/* -------------------------------------------------------------------------- */

export function createRoom(name: string, levelId: string) {
  return request<JoinResponse>("/api/rooms", {
    method: "POST",
    body: JSON.stringify({ name, levelId }),
  });
}

export function joinRoom(code: string, name: string) {
  return request<JoinResponse>(`/api/rooms/${encodeURIComponent(code)}/join`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function fetchRoom(credentials: Credentials, since?: number) {
  const query = since === undefined ? "" : `?since=${since}`;
  return request<RoomResponse | UnchangedResponse>(
    `/api/rooms/${encodeURIComponent(credentials.code)}${query}`,
    { auth: credentials },
  );
}

export function lockSecret(credentials: Credentials, value: number) {
  return request<RoomResponse>(`/api/rooms/${encodeURIComponent(credentials.code)}/secret`, {
    method: "POST",
    body: JSON.stringify({ value }),
    auth: credentials,
  });
}

export function sendGuess(credentials: Credentials, value: number) {
  return request<GuessResponse>(`/api/rooms/${encodeURIComponent(credentials.code)}/guess`, {
    method: "POST",
    body: JSON.stringify({ value }),
    auth: credentials,
  });
}

export function requestRematch(credentials: Credentials) {
  return request<RoomResponse>(`/api/rooms/${encodeURIComponent(credentials.code)}/rematch`, {
    method: "POST",
    auth: credentials,
  });
}

export function leaveRoom(credentials: Credentials) {
  return request<{ left: boolean }>(`/api/rooms/${encodeURIComponent(credentials.code)}/leave`, {
    method: "POST",
    auth: credentials,
  });
}

export function isUnchanged(
  res: RoomResponse | UnchangedResponse,
): res is UnchangedResponse {
  return "unchanged" in res;
}

/**
 * Fold an `unchanged` reply into the room we already hold. Only presence can
 * have moved, so that's all we copy across.
 */
export function applyPresence(room: PublicRoom, online: string[]): PublicRoom {
  const present = new Set(online);
  let changed = false;
  const players = { ...room.players };
  for (const [id, player] of Object.entries(players)) {
    const nowOnline = present.has(id);
    if (player.online !== nowOnline) {
      players[id] = { ...player, online: nowOnline };
      changed = true;
    }
  }
  return changed ? { ...room, players } : room;
}

/* -------------------------------------------------------------------------- */
/* local session                                                              */
/* -------------------------------------------------------------------------- */

/** Survives a refresh so a reload drops you back into your seat, not the lobby. */
export function saveCredentials(credentials: Credentials) {
  try {
    window.localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
  } catch {
    // Private browsing or a full quota — the game still works, just not across reloads.
  }
}

export function loadCredentials(): Credentials | null {
  try {
    const raw = window.localStorage.getItem(CREDENTIALS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as Credentials).code === "string" &&
      typeof (parsed as Credentials).playerId === "string" &&
      typeof (parsed as Credentials).token === "string"
    ) {
      return parsed as Credentials;
    }
  } catch {
    // fall through
  }
  return null;
}

export function clearCredentials() {
  try {
    window.localStorage.removeItem(CREDENTIALS_KEY);
  } catch {
    // ignore
  }
}

export function saveName(name: string) {
  try {
    window.localStorage.setItem(NAME_KEY, name);
  } catch {
    // ignore
  }
}

export function loadName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}
