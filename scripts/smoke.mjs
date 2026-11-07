/**
 * Renders every route against the mock Supabase server (scripts/mock-supabase.mjs)
 * and fails on any non-2xx status or render-time error marker.
 *
 * This catches what `tsc` and `next build` cannot: RSC server→client boundary
 * violations, undefined field access while rendering, and missing i18n keys.
 *
 *   node scripts/mock-supabase.mjs 54321 &
 *   next dev -p 3125 &      (with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321)
 *   node scripts/smoke.mjs http://localhost:3125
 */
import { mockAccessToken } from "./mock-jwt.mjs";

const BASE = process.argv[2] ?? "http://localhost:3125";

const session = {
  access_token: mockAccessToken(),
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: "mock-refresh-token",
  user: {
    id: "11111111-1111-1111-1111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "mark@example.com",
    app_metadata: { provider: "email", role: "admin" },
    user_metadata: { full_name: "Mark" },
    created_at: new Date().toISOString(),
  },
};

// @supabase/ssr stores the session as `base64-` + base64url(JSON) under
// sb-<project-ref>-auth-token. Our mock URL host is 127.0.0.1, whose "ref" is
// the first hostname label.
const REF = "127";
const cookieValue =
  "base64-" + Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
const COOKIE = `sb-${REF}-auth-token=${cookieValue}`;

const ROUTES = [
  "/",
  "/login",
  "/today",
  "/earnings",
  "/history",
  "/report",
  "/report/new",
  "/rules",
  "/settings",
  "/tasks/bbbbbbbb-0000-0000-0000-00000000000a",
  "/tasks/bbbbbbbb-0000-0000-0000-00000000000f", // admin-bypassed task
  "/admin",
  "/admin/review",
  "/admin/templates",
  "/admin/templates/new",
  "/admin/templates/aaaaaaaa-0000-0000-0000-00000000000a",
  "/admin/calendar",
  `/admin/calendar?date=${new Date().toISOString().slice(0, 10)}`,
  "/admin/calendar?date=not-a-date",
  "/admin/calendar?date=2026-02-31",
  "/admin/payouts",
  "/admin/issues",
  "/admin/users",
  "/manifest.webmanifest",
  "/api/cron/generate",
];

const ERROR_MARKERS = [
  "Functions cannot be passed directly",
  "not serializable",
  "Cannot read properties of undefined",
  "Cannot read properties of null",
  "Application error",
  "Internal Server Error",
  "TypeError:",
  "ReferenceError:",
];

// Routes that legitimately do not return 200.
const EXPECTED = {
  "/": [307, 302],
  "/login": [307, 302, 200],
  "/api/cron/generate": [401],
};

let failures = 0;
let checked = 0;

for (const route of ROUTES) {
  const res = await fetch(BASE + route, {
    headers: { cookie: COOKIE },
    redirect: "manual",
  });
  const text = res.headers.get("content-type")?.includes("image") ? "" : await res.text();
  const allowed = EXPECTED[route] ?? [200];
  const statusOk = allowed.includes(res.status);
  const marker = ERROR_MARKERS.find((m) => text.includes(m));
  checked++;

  if (!statusOk || marker) {
    failures++;
    console.error(`✖ ${route}`);
    console.error(`   status ${res.status} (expected ${allowed.join("/")})`);
    if (marker) console.error(`   error marker: ${marker}`);
    const snippet = text.match(new RegExp(`.{0,200}${marker ? marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "Error"}.{0,300}`, "s"));
    if (snippet) console.error(`   …${snippet[0].replace(/\s+/g, " ").slice(0, 400)}`);
  } else {
    const redirectedTo = res.headers.get("location");
    console.log(`✔ ${route} → ${res.status}${redirectedTo ? ` (${redirectedTo})` : ""}`);
  }
}

console.log(`\n${checked - failures}/${checked} routes rendered cleanly`);
if (failures) {
  console.error(`✖ ${failures} route(s) failed`);
  process.exit(1);
}
