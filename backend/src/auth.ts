// Guest auth stub (Phase 7). No passwords yet (Phase 8+ OAuth/JWT).
// Token = base64url(playerId). Verify O(1) string ops. MEMORY#20.

export function mintGuestToken(playerId: string): string {
  // O(n) base64 on tiny id, effectively O(1).
  const clean = String(playerId || "guest").slice(0, 64) || "guest";
  return Buffer.from(clean, "utf8").toString("base64url");
}

export function verifyToken(token: string): string | null {
  // O(n) decode on tiny token. Returns playerId or null.
  try {
    const s = Buffer.from(String(token), "base64url").toString("utf8");
    if (!s || s.length > 64) return null;
    return s;
  } catch {
    return null;
  }
}

export function authPlayerId(req: { headers?: Record<string, unknown>; body?: Record<string, unknown>; query?: Record<string, unknown> }): string | null {
  // O(1): header Bearer > body.playerId > query.playerId.
  const h = req.headers?.["authorization"] ?? req.headers?.["Authorization"];
  if (typeof h === "string" && h.startsWith("Bearer ")) {
    const pid = verifyToken(h.slice(7));
    if (pid) return pid;
  }
  const b = (req.body as Record<string, unknown> | undefined)?.["playerId"];
  if (typeof b === "string" && b) return b.slice(0, 64);
  const q = (req.query as Record<string, unknown> | undefined)?.["playerId"];
  if (typeof q === "string" && q) return q.slice(0, 64);
  return null;
}
