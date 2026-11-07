/**
 * A tiny stand-in for Supabase (Auth + PostgREST + Storage) used to render the
 * whole app locally without a real project. It returns canned, realistically
 * shaped rows so every page renders with content instead of empty states.
 *
 *   node scripts/mock-supabase.mjs [port]
 *
 * Not used in production — this exists purely so `scripts/smoke.mjs` can catch
 * render-time errors (RSC boundary violations, bad field access, missing i18n
 * keys) that a type-check and `next build` cannot see.
 */
import { createServer } from "node:http";
import { mockAccessToken } from "./mock-jwt.mjs";

const PORT = Number(process.argv[2] ?? 54321);

const USER_ID = "11111111-1111-1111-1111-111111111111";
const HELPER_ID = "22222222-2222-2222-2222-222222222222";
const TODAY = new Date().toISOString().slice(0, 10);
const NOW = new Date().toISOString();
const plusDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export const user = {
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "mark@example.com",
  email_confirmed_at: NOW,
  phone: "",
  confirmed_at: NOW,
  last_sign_in_at: NOW,
  app_metadata: { provider: "email", providers: ["email"], role: "admin" },
  user_metadata: { full_name: "Mark" },
  identities: [],
  created_at: NOW,
  updated_at: NOW,
  is_anonymous: false,
};

const profiles = [
  { id: USER_ID, full_name: "Mark", role: "admin", locale: "en", created_at: NOW, updated_at: NOW },
  { id: HELPER_ID, full_name: "Ate Helper", role: "helper", locale: "tl", created_at: NOW, updated_at: NOW },
];

const template = (over = {}) => ({
  id: "aaaaaaaa-0000-0000-0000-00000000000a",
  slug: "daily-mop",
  title_tl: "Mag-mop (kasama ang air purifier filter)",
  title_en: "Mop the floor",
  description_tl: "Mag-mop ng sahig ng cat condo gamit ang nakalaang mop.",
  description_en: "Mop the cat condo floor with the dedicated mop.",
  category: "cleaning",
  recurrence: "daily",
  weekdays: [],
  month_days: [],
  interval_months: 1,
  anchor_month: TODAY.slice(0, 8) + "01",
  time_of_day: "anytime",
  due_time: null,
  grace_before: 0,
  grace_after: 0,
  evidence_required: true,
  min_photos: 1,
  sort_order: 20,
  peso_value: 3,
  active: true,
  starts_on: TODAY,
  ends_on: null,
  created_by: USER_ID,
  created_at: NOW,
  updated_at: NOW,
  ...over,
});

const templates = [
  template(),
  template({
    id: "aaaaaaaa-0000-0000-0000-00000000000b",
    slug: "mon-comb-cats",
    title_tl: "Suklayan ang mga pusa",
    title_en: "Comb the cats",
    category: "grooming",
    recurrence: "weekly",
    weekdays: [1, 5],
    grace_after: 1,
    sort_order: 200,
    peso_value: 6,
  }),
  template({
    id: "aaaaaaaa-0000-0000-0000-00000000000c",
    slug: "monthly-nail-trim",
    title_tl: "Gupitan ng kuko ang mga pusa",
    title_en: "Trim the cats' nails",
    category: "grooming",
    recurrence: "monthly",
    month_days: [15, 30],
    grace_before: 1,
    grace_after: 1,
    time_of_day: "morning",
    due_time: "08:00:00",
    sort_order: 420,
    peso_value: 12,
  }),
  template({
    id: "aaaaaaaa-0000-0000-0000-00000000000d",
    slug: "inactive-one",
    title_tl: "Lumang gawain",
    title_en: "Old task",
    active: false,
    evidence_required: false,
    min_photos: 0,
    sort_order: 900,
  }),
];

const photo = (id, over = {}) => ({
  id,
  completion_id: "cccccccc-0000-0000-0000-00000000000a",
  issue_id: null,
  storage_path: `${HELPER_ID}/2026-08/${id}.jpg`,
  uploaded_by: HELPER_ID,
  created_at: NOW,
  ...over,
});

const completion = (over = {}) => ({
  id: "cccccccc-0000-0000-0000-00000000000a",
  instance_id: "bbbbbbbb-0000-0000-0000-00000000000a",
  submitted_by: HELPER_ID,
  submitted_at: NOW,
  note: "Tapos na po, nilinis ko rin ang ilalim ng lamesa.",
  review_status: "pending",
  reviewed_by: null,
  reviewed_at: null,
  review_note: null,
  admin_override: false,
  peso_value: 3,
  unpaid: false,
  created_at: NOW,
  photos: [photo("p1"), photo("p2")],
  submitter: { id: HELPER_ID, full_name: "Ate Helper" },
  reviewer: null,
  ...over,
});

const instance = (over = {}) => ({
  id: "bbbbbbbb-0000-0000-0000-00000000000a",
  template_id: templates[0].id,
  scheduled_date: TODAY,
  due_date: TODAY,
  window_start: TODAY,
  window_end: TODAY,
  status: "pending",
  latest_completion_id: null,
  skip_reason: null,
  updated_by: null,
  created_at: NOW,
  updated_at: NOW,
  template: templates[0],
  latest: null,
  ...over,
});

const instances = [
  instance(),
  instance({ id: "bbbbbbbb-0000-0000-0000-00000000000b", status: "submitted", latest_completion_id: completion().id, template: templates[1], template_id: templates[1].id }),
  instance({ id: "bbbbbbbb-0000-0000-0000-00000000000c", status: "approved", template: templates[2], template_id: templates[2].id }),
  instance({ id: "bbbbbbbb-0000-0000-0000-00000000000d", status: "rejected", template: templates[1], template_id: templates[1].id }),
  instance({ id: "bbbbbbbb-0000-0000-0000-00000000000e", status: "skipped", skip_reason: "Nasa vet ang mga pusa", template: templates[2], template_id: templates[2].id }),
  // Marked done by an admin with no evidence — exercises the bypass labelling.
  instance({
    id: "bbbbbbbb-0000-0000-0000-00000000000f",
    status: "approved",
    latest_completion_id: "cccccccc-0000-0000-0000-00000000000c",
    latest: { admin_override: true },
    template: templates[1],
    template_id: templates[1].id,
  }),
  // Monthly work whose window has not opened yet — the "Paparating" section.
  instance({
    id: "bbbbbbbb-0000-0000-0000-000000000010",
    scheduled_date: plusDays(10),
    due_date: plusDays(10),
    window_start: plusDays(9),
    window_end: plusDays(11),
    template: templates[2],
    template_id: templates[2].id,
  }),
];

const completions = [
  completion({ instance: instance() }),
  completion({
    instance: instance({ id: "bbbbbbbb-0000-0000-0000-00000000000d", status: "rejected" }),
    id: "cccccccc-0000-0000-0000-00000000000b",
    review_status: "rejected",
    reviewed_by: USER_ID,
    reviewed_at: NOW,
    review_note: "Malabo ang litrato, pakiulit.",
    reviewer: { id: USER_ID, full_name: "Mark" },
    photos: [photo("p3", { completion_id: "cccccccc-0000-0000-0000-00000000000b" })],
  }),
  completion({
    instance: instance({ id: "bbbbbbbb-0000-0000-0000-00000000000f", status: "approved" }),
    id: "cccccccc-0000-0000-0000-00000000000c",
    instance_id: "bbbbbbbb-0000-0000-0000-00000000000f",
    submitted_by: USER_ID,
    note: "Ako na mismo ang gumawa kagabi.",
    review_status: "approved",
    reviewed_by: USER_ID,
    reviewed_at: NOW,
    review_note: null,
    admin_override: true,
    photos: [],
    submitter: { id: USER_ID, full_name: "Mark" },
    reviewer: { id: USER_ID, full_name: "Mark" },
  }),
  // Approved, but the admin chose not to pay for it.
  completion({
    instance: instance({ id: "bbbbbbbb-0000-0000-0000-00000000000c", status: "approved" }),
    id: "cccccccc-0000-0000-0000-00000000000d",
    instance_id: "bbbbbbbb-0000-0000-0000-00000000000c",
    review_status: "approved",
    reviewed_by: USER_ID,
    reviewed_at: NOW,
    review_note: "Salamat, pero nagawa na ito kanina.",
    unpaid: true,
    peso_value: 12,
    reviewer: { id: USER_ID, full_name: "Mark" },
  }),
];

const issues = [
  {
    id: "dddddddd-0000-0000-0000-00000000000a",
    reported_by: HELPER_ID,
    category: "health",
    title: "Sumusuka si Mingming",
    description: "Simula kaninang umaga, tatlong beses na.",
    status: "open",
    acknowledged_by: null,
    acknowledged_at: null,
    resolved_by: null,
    resolved_at: null,
    resolution_note: null,
    created_at: NOW,
    updated_at: NOW,
    photos: [photo("p4", { completion_id: null, issue_id: "dddddddd-0000-0000-0000-00000000000a" })],
    reporter: { id: HELPER_ID, full_name: "Ate Helper" },
  },
  {
    id: "dddddddd-0000-0000-0000-00000000000b",
    reported_by: HELPER_ID,
    category: "supplies",
    title: "Paubos na ang litter sand",
    description: null,
    status: "resolved",
    acknowledged_by: USER_ID,
    acknowledged_at: NOW,
    resolved_by: USER_ID,
    resolved_at: NOW,
    resolution_note: "Bumili na ako ng bago.",
    created_at: NOW,
    updated_at: NOW,
    photos: [],
    reporter: { id: HELPER_ID, full_name: "Ate Helper" },
  },
];

const payouts = [
  {
    id: "eeeeeeee-0000-0000-0000-00000000000a",
    helper_id: HELPER_ID,
    amount: 480,
    status: "requested",
    note: "Pang-grocery po sana.",
    requested_at: NOW,
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    paid_at: null,
    admin_recorded: false,
    created_at: NOW,
    updated_at: NOW,
    helper: { id: HELPER_ID, full_name: "Ate Helper" },
    reviewer: null,
  },
  {
    id: "eeeeeeee-0000-0000-0000-00000000000b",
    helper_id: HELPER_ID,
    amount: 1020,
    status: "paid",
    note: null,
    requested_at: NOW,
    reviewed_by: USER_ID,
    reviewed_at: NOW,
    review_note: "Nabigay na cash.",
    paid_at: NOW,
    admin_recorded: false,
    created_at: NOW,
    updated_at: NOW,
    helper: { id: HELPER_ID, full_name: "Ate Helper" },
    reviewer: { id: USER_ID, full_name: "Mark" },
  },
  // Cash handed over with no request behind it.
  {
    id: "eeeeeeee-0000-0000-0000-00000000000c",
    helper_id: HELPER_ID,
    amount: 500,
    status: "paid",
    note: null,
    requested_at: NOW,
    reviewed_by: USER_ID,
    reviewed_at: NOW,
    review_note: "Cash kagabi.",
    paid_at: NOW,
    admin_recorded: true,
    created_at: NOW,
    updated_at: NOW,
    helper: { id: HELPER_ID, full_name: "Ate Helper" },
    reviewer: { id: USER_ID, full_name: "Mark" },
  },
];

const TABLES = {
  profiles,
  task_templates: templates,
  task_instances: instances,
  task_completions: completions,
  issues,
  payouts,
  photos: [photo("p1")],
};

export const session = {
  access_token: mockAccessToken(),
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: "mock-refresh-token",
  user,
};

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    ...headers,
  });
  res.end(payload);
}

function rowsFor(pathname, url) {
  const table = pathname.replace("/rest/v1/", "").split("?")[0];
  let rows = TABLES[table] ?? [];
  // Honour a couple of filters so pages that expect specific rows get them.
  // Honour instance_id first: a task page asks for one instance's completions,
  // and returning every completion would hide which one the instance points at.
  const eqInstance = url.searchParams.get("instance_id");
  if (eqInstance?.startsWith("eq.")) {
    const want = eqInstance.slice(3);
    const hits = rows.filter((r) => r.instance_id === want);
    return hits.length ? hits : [];
  }
  const eqId = url.searchParams.get("id");
  if (eqId?.startsWith("eq.")) {
    const want = eqId.slice(3);
    const hit = rows.find((r) => r.id === want);
    rows = hit ? [hit] : rows.slice(0, 1);
  }
  return rows.filter((r) => matchesFilters(r, url.searchParams));
}

/**
 * Honour the comparison filters PostgREST understands, including ones on an
 * embedded resource (`template.recurrence=eq.monthly`). Without this every
 * query on a table returned every row of it, so date-scoped lists — "monthly
 * work coming up" — showed things that are not coming up at all.
 */
const OPS = {
  eq: (a, b) => String(a) === b,
  neq: (a, b) => String(a) !== b,
  gt: (a, b) => String(a) > b,
  gte: (a, b) => String(a) >= b,
  lt: (a, b) => String(a) < b,
  lte: (a, b) => String(a) <= b,
};
const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns", "id", "instance_id"]);

function matchesFilters(row, params) {
  for (const [key, raw] of params) {
    if (RESERVED.has(key)) continue;
    const [op, ...rest] = raw.split(".");
    const cmp = OPS[op];
    if (!cmp) continue;
    const value = key.split(".").reduce((acc, part) => (acc == null ? acc : acc[part]), row);
    if (value === undefined) continue; // column the mock does not model — don't filter it away
    if (!cmp(value, rest.join("."))) return false;
  }
  return true;
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const { pathname } = url;
  const accept = req.headers.accept ?? "";
  const wantsObject = accept.includes("pgrst.object");

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    // ---- Auth ----------------------------------------------------------
    if (pathname === "/auth/v1/user") return send(res, 200, user);
    if (pathname === "/auth/v1/token") return send(res, 200, session);
    if (pathname === "/auth/v1/logout") return send(res, 204);
    if (pathname.startsWith("/auth/v1/admin/users")) return send(res, 200, { user });
    if (pathname.startsWith("/auth/v1/")) return send(res, 200, {});

    // ---- Storage -------------------------------------------------------
    if (pathname.startsWith("/storage/v1/object/sign/")) {
      let paths = [];
      try {
        paths = JSON.parse(body).paths ?? [];
      } catch {
        paths = [];
      }
      return send(
        res,
        200,
        paths.map((p) => ({ path: p, signedURL: `/icons/icon-192.png?p=${encodeURIComponent(p)}` }))
      );
    }
    if (pathname.startsWith("/storage/v1/")) return send(res, 200, { Key: "evidence/x" });

    // ---- PostgREST -----------------------------------------------------
    if (pathname.startsWith("/rest/v1/rpc/")) {
      const fn = pathname.replace("/rest/v1/rpc/", "");
      if (fn === "ensure_task_instances") return send(res, 200, 0);
      if (fn === "manila_today") return send(res, 200, TODAY);
      if (fn === "is_admin") return send(res, 200, true);
      if (fn === "submit_completion") return send(res, 200, completion());
      if (fn === "create_issue") return send(res, 200, issues[0]);
      if (fn === "review_completion") return send(res, 200, completion({ review_status: "approved" }));
      if (fn === "set_completion_paid")
        return send(res, 200, completion({ review_status: "approved", unpaid: true }));
      if (fn === "sole_helper") return send(res, 200, HELPER_ID);
      if (fn === "skip_task_instance" || fn === "reschedule_task_instance") return send(res, 200, instance());
      if (fn === "admin_wallets")
        return send(res, 200, [
          {
            helper_id: HELPER_ID, full_name: "Ate Helper", role: "helper",
            earned: 2347, committed: 1500, balance: 847, this_month: 612, open_requests: 1,
          },
          {
            helper_id: USER_ID, full_name: "Mark", role: "admin",
            earned: 0, committed: 0, balance: 0, this_month: 0, open_requests: 0,
          },
        ]);
      // `returns table` RPCs come back as an array of rows.
      if (fn === "earnings_outlook")
        return send(res, 200, [
          { today_potential: 30, today_earned: 12, month_potential: 1330, month_earned: 612 },
        ]);
      if (fn === "helper_earned_total") return send(res, 200, 2347);
      if (fn === "helper_payouts_committed") return send(res, 200, 1500);
      if (fn === "helper_balance") return send(res, 200, 847);
      if (fn === "request_payout") return send(res, 200, payouts[0]);
      if (fn === "review_payout") return send(res, 200, payouts[1]);
      if (fn === "admin_record_payout") return send(res, 200, payouts[2]);
      if (fn === "admin_complete_task")
        return send(res, 200, completion({ review_status: "approved", admin_override: true, photos: [] }));
      if (fn === "create_adhoc_task") return send(res, 200, instance());
      return send(res, 200, null);
    }

    if (pathname.startsWith("/rest/v1/")) {
      const rows = rowsFor(pathname, url);
      if (req.method === "HEAD") {
        return send(res, 200, undefined, { "content-range": `0-${rows.length}/${rows.length}` });
      }
      if (req.method !== "GET") {
        return send(res, 201, wantsObject ? (rows[0] ?? {}) : rows.slice(0, 1), {
          "content-range": `0-0/1`,
        });
      }
      return send(res, 200, wantsObject ? (rows[0] ?? null) : rows, {
        "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}`,
      });
    }

    send(res, 404, { error: "not found", pathname });
  });
});

server.listen(PORT, () => {
  console.log(`mock-supabase listening on http://127.0.0.1:${PORT}`);
});
