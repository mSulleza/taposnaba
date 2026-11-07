/**
 * A structurally-valid access token for the mock Supabase server.
 *
 * `getClaims()` (used by src/lib/auth.ts and the proxy) decodes the JWT before
 * doing anything else, so an opaque string like "mock-access-token" makes every
 * page look signed-out. The header says HS256, which is exactly the case where
 * auth-js cannot verify locally and falls back to GET /auth/v1/user — an
 * endpoint the mock already serves. The signature is therefore never checked.
 */
const b64url = (obj) => Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");

export function mockAccessToken({
  sub = "11111111-1111-1111-1111-111111111111",
  email = "mark@example.com",
  ttlSeconds = 3600,
} = {}) {
  const iat = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub,
    email,
    aud: "authenticated",
    role: "authenticated",
    iss: "http://127.0.0.1:54321/auth/v1",
    iat,
    exp: iat + ttlSeconds,
    is_anonymous: false,
    app_metadata: { provider: "email" },
    user_metadata: { full_name: "Mark" },
  };
  return `${b64url(header)}.${b64url(payload)}.bW9jay1zaWduYXR1cmU`;
}
