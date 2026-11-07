/**
 * End-to-end check against the REAL Supabase project, using the same client
 * library and the same query strings the app uses. Creates a temporary user,
 * exercises the whole flow, then deletes everything it made.
 *
 *   node --env-file=.env.local scripts/live-check.mjs
 *
 * Safe to re-run: it cleans up after itself and asserts the "first user becomes
 * admin" slot is left free.
 */
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
assert.ok(SUPA_URL && PUB && SECRET, "env not loaded");

const admin = createClient(SUPA_URL, SECRET, { auth: { persistSession: false } });

const stamp = Date.now();
const EMAIL = `live-check-${stamp}@example.invalid`;
const PASSWORD = `lc-${stamp}-${Math.random().toString(36).slice(2)}Aa1!`;

const made = { userId: null, objects: [], instanceIds: [], templateIds: [], issueIds: [] };

async function cleanup() {
  console.log("\n→ cleanup");
  if (made.objects.length) {
    const { error } = await admin.storage.from("evidence").remove(made.objects);
    console.log(`   storage objects removed: ${made.objects.length}${error ? ` (${error.message})` : ""}`);
  }
  for (const id of made.issueIds) await admin.from("issues").delete().eq("id", id);
  for (const id of made.templateIds) await admin.from("task_templates").delete().eq("id", id);
  if (made.userId) {
    const { error } = await admin.auth.admin.deleteUser(made.userId);
    console.log(`   test user deleted${error ? ` (${error.message})` : ""}`);
  }
  // Completions/photos cascade from the user + templates.
  const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
  console.log(`   admin profiles remaining: ${count}`);
  assert.equal(count, 0, "the first-user-becomes-admin slot must be left free");
}

try {
  // ---- 1. temporary user -------------------------------------------------
  console.log("→ creating temporary user");
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Live Check", locale: "tl" },
    app_metadata: { role: "helper" },
  });
  assert.ok(!cErr, `createUser: ${cErr?.message}`);
  made.userId = created.user.id;

  // The DB trigger should have made a profile. This user is the first ever, so
  // the trigger promotes it to admin — which is exactly what we want to test.
  const { data: profile } = await admin.from("profiles").select("*").eq("id", made.userId).single();
  assert.ok(profile, "handle_new_user trigger did not create a profile");
  console.log(`   profile created by trigger: role=${profile.role} name="${profile.full_name}" locale=${profile.locale}`);
  assert.equal(profile.role, "admin", "first user should become admin");

  // ---- 2. sign in as that user (anon key + password) ---------------------
  console.log("→ signing in with the publishable key");
  const user = createClient(SUPA_URL, PUB, { auth: { persistSession: false } });
  const { data: signIn, error: sErr } = await user.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  assert.ok(!sErr, `signIn: ${sErr?.message}`);
  assert.ok(signIn.session?.access_token, "no session");
  console.log("   signed in");

  // ---- 3. the exact selects the app uses ---------------------------------
  console.log("→ app queries");
  const INSTANCE_SELECT = "*, template:task_templates(*)";
  const COMPLETION_SELECT =
    "*, photos(*), submitter:profiles!task_completions_submitted_by_fkey(id, full_name), reviewer:profiles!task_completions_reviewed_by_fkey(id, full_name)";
  const QUEUE_INSTANCE_SELECT =
    "instance:task_instances!task_completions_instance_id_fkey(*, template:task_templates(*))";

  const today = (await user.rpc("manila_today")).data;
  console.log(`   manila_today = ${today}`);

  const { data: gen, error: gErr } = await user.rpc("ensure_task_instances", { p_from: today, p_to: today });
  assert.ok(!gErr, `ensure_task_instances: ${gErr?.message}`);
  console.log(`   ensure_task_instances (authenticated) ok, inserted ${gen}`);

  const { data: todays, error: tErr } = await user
    .from("task_instances")
    .select(INSTANCE_SELECT)
    .gte("due_date", today)
    .lte("window_start", today)
    .order("due_date");
  assert.ok(!tErr, `today query: ${tErr?.message}`);
  assert.ok(todays.length > 0, "no instances for today");
  assert.ok(todays[0].template?.title_tl, "template embed is not an object with fields");
  console.log(`   today's instances: ${todays.length}, first = "${todays[0].template.title_tl}"`);

  // This is the embed that returns PGRST201 if the FK hint is missing.
  const { error: qErr } = await user
    .from("task_completions")
    .select(`${COMPLETION_SELECT}, ${QUEUE_INSTANCE_SELECT}`)
    .eq("review_status", "pending")
    .order("submitted_at", { ascending: true });
  assert.ok(!qErr, `review queue embed: ${qErr?.message} (${qErr?.code})`);
  console.log("   review-queue embed ok (no PGRST201)");

  // ---- 4. evidence upload + atomic submission ---------------------------
  console.log("→ evidence upload + submit_completion");
  const target = todays.find((i) => i.template.evidence_required && i.status === "pending");
  assert.ok(target, "no pending task requiring evidence");

  // 1x1 JPEG
  const jpeg = Buffer.from(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
    "base64"
  );
  const goodPath = `${made.userId}/${today.slice(0, 7)}/live-${stamp}.jpg`;
  const { error: upErr } = await user.storage.from("evidence").upload(goodPath, jpeg, { contentType: "image/jpeg" });
  assert.ok(!upErr, `upload: ${upErr?.message}`);
  made.objects.push(goodPath);
  console.log(`   uploaded ${goodPath}`);

  // Uploading into someone else's folder must be refused by storage RLS.
  const { error: badUp } = await user.storage
    .from("evidence")
    .upload(`00000000-0000-0000-0000-000000000000/x/nope-${stamp}.jpg`, jpeg, { contentType: "image/jpeg" });
  assert.ok(badUp, "upload into another user's folder should have been rejected");
  console.log(`   cross-folder upload refused: ${badUp.message}`);

  // Submitting with no photos must fail (min_photos enforced in the DB).
  const { error: noPhoto } = await user.rpc("submit_completion", {
    p_instance_id: target.id,
    p_note: "walang litrato",
    p_paths: [],
  });
  assert.ok(noPhoto, "submission without evidence should have been rejected");
  console.log(`   photo-less submission refused: ${noPhoto.message}`);

  // Claiming a path that was never uploaded must fail.
  const { error: ghost } = await user.rpc("submit_completion", {
    p_instance_id: target.id,
    p_paths: [`${made.userId}/${today.slice(0, 7)}/ghost.jpg`],
  });
  assert.ok(ghost, "unknown photo path should have been rejected");
  console.log(`   unuploaded path refused: ${ghost.message}`);

  // The real thing.
  const { data: comp, error: subErr } = await user.rpc("submit_completion", {
    p_instance_id: target.id,
    p_note: "Tapos na po",
    p_paths: [goodPath],
  });
  assert.ok(!subErr, `submit_completion: ${subErr?.message}`);
  console.log(`   submitted "${target.template.title_tl}" → completion ${comp.id}`);

  const { data: after } = await user.from("task_instances").select("status").eq("id", target.id).single();
  assert.equal(after.status, "submitted", "instance should be 'submitted'");
  console.log("   instance status → submitted");

  // ---- 5. signed URLs ----------------------------------------------------
  const { data: signed, error: signErr } = await user.storage.from("evidence").createSignedUrls([goodPath], 3600);
  assert.ok(!signErr, `createSignedUrls: ${signErr?.message}`);
  assert.ok(signed[0]?.signedUrl && signed[0]?.path === goodPath, "signed URL shape mismatch");
  const head = await fetch(signed[0].signedUrl);
  assert.equal(head.status, 200, "signed URL did not serve the image");
  console.log(`   signed URL serves the photo (${head.headers.get("content-type")})`);

  // ---- 6. QA review ------------------------------------------------------
  console.log("→ QA review");
  const { error: noNote } = await user.rpc("review_completion", {
    p_completion_id: comp.id,
    p_decision: "rejected",
    p_note: "",
  });
  assert.ok(noNote, "rejecting without a note should fail");
  console.log(`   reject-without-note refused: ${noNote.message}`);

  await user.rpc("review_completion", { p_completion_id: comp.id, p_decision: "rejected", p_note: "Malabo, pakiulit" });
  let { data: st } = await user.from("task_instances").select("status").eq("id", target.id).single();
  assert.equal(st.status, "rejected");
  console.log("   rejected → instance status 'rejected'");

  const path2 = `${made.userId}/${today.slice(0, 7)}/live-${stamp}-b.jpg`;
  await user.storage.from("evidence").upload(path2, jpeg, { contentType: "image/jpeg" });
  made.objects.push(path2);
  const { data: comp2 } = await user.rpc("submit_completion", { p_instance_id: target.id, p_paths: [path2] });
  await user.rpc("review_completion", { p_completion_id: comp2.id, p_decision: "approved" });
  ({ data: st } = await user.from("task_instances").select("status").eq("id", target.id).single());
  assert.equal(st.status, "approved");
  console.log("   resubmitted → approved");

  const { error: lockedErr } = await user.rpc("submit_completion", {
    p_instance_id: target.id,
    p_paths: [goodPath],
  });
  assert.ok(lockedErr, "submitting to an approved task should fail");
  console.log(`   approved task is locked: ${lockedErr.message}`);

  // ---- 7. issues ---------------------------------------------------------
  console.log("→ reports");
  const path3 = `${made.userId}/${today.slice(0, 7)}/live-${stamp}-c.jpg`;
  await user.storage.from("evidence").upload(path3, jpeg, { contentType: "image/jpeg" });
  made.objects.push(path3);
  const { data: issue, error: iErr } = await user.rpc("create_issue", {
    p_title: "Live check report",
    p_category: "equipment",
    p_description: "test",
    p_paths: [path3],
  });
  assert.ok(!iErr, `create_issue: ${iErr?.message}`);
  made.issueIds.push(issue.id);
  const { data: withPhotos, error: ipErr } = await user
    .from("issues")
    .select("*, photos(*), reporter:profiles!issues_reported_by_fkey(id, full_name)")
    .eq("id", issue.id)
    .single();
  assert.ok(!ipErr, `issue embed: ${ipErr?.message}`);
  assert.equal(withPhotos.photos.length, 1);
  assert.ok(withPhotos.reporter?.full_name, "reporter embed missing");
  console.log(`   issue + photo + reporter embed ok ("${withPhotos.reporter.full_name}")`);

  // ---- 8. admin-only RPCs + adhoc ---------------------------------------
  console.log("→ admin actions");
  const other = todays.find((i) => i.id !== target.id);
  await user.rpc("skip_task_instance", { p_instance_id: other.id, p_reason: "live check" });
  ({ data: st } = await user.from("task_instances").select("status").eq("id", other.id).single());
  assert.equal(st.status, "skipped");
  await user.rpc("skip_task_instance", { p_instance_id: other.id, p_undo: true });
  console.log("   skip + undo ok");

  const { data: adhoc, error: aErr } = await user.rpc("create_adhoc_task", {
    p_title_tl: "Live check adhoc",
    p_title_en: "Live check adhoc",
    p_due_date: today,
  });
  assert.ok(!aErr, `create_adhoc_task: ${aErr?.message}`);
  made.templateIds.push(adhoc.template_id);
  console.log("   ad-hoc task created");

  const { data: moved } = await user.rpc("reschedule_task_instance", {
    p_instance_id: adhoc.id,
    p_due_date: today,
  });
  assert.equal(moved.due_date, today);
  console.log("   reschedule ok");

  console.log("\n✔ live check passed against the real project");
} catch (err) {
  console.error("\n✖ live check FAILED:", err?.message ?? err);
  await cleanup();
  process.exit(1);
}

await cleanup();
console.log("✔ cleanup complete");
