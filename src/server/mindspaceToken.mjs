import { createHmac } from "node:crypto";

// MagerLife is the only place the user signs in. MindSpace (the "Tâm sự" chatbot, a separate
// Python service) trusts a short-lived JWT that this server signs after checking the MagerLife
// session. The JWT uses its own secret, so a leaked MindSpace secret cannot forge MagerLife sessions.

export const MINDSPACE_TOKEN_TTL_SECONDS = 60 * 60;
const MIN_SECRET_LENGTH = 32;

function base64url(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

export function isMindspaceConfigured() {
  return String(process.env.MINDSPACE_SHARED_SECRET || "").length >= MIN_SECRET_LENGTH;
}

// session: the result of verifySessionToken, { sub: email, role }.
export function createMindspaceToken(session, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!isMindspaceConfigured() || !session?.sub) return null;
  const header = base64url({ alg: "HS256", typ: "JWT" });
  const payload = base64url({
    iss: "magerlife",
    aud: "mindspace",
    sub: session.sub,
    role: session.role === "admin" ? "admin" : "user",
    iat: nowSeconds,
    exp: nowSeconds + MINDSPACE_TOKEN_TTL_SECONDS,
  });
  const signature = createHmac("sha256", process.env.MINDSPACE_SHARED_SECRET).update(`${header}.${payload}`).digest("base64url");
  return { token: `${header}.${payload}.${signature}`, expiresAt: new Date((nowSeconds + MINDSPACE_TOKEN_TTL_SECONDS) * 1000).toISOString() };
}
