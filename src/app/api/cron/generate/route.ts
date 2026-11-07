import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDaysISO, todayISO } from "@/lib/dates";

export const dynamic = "force-dynamic";

/**
 * Daily materialization of task instances (Vercel Cron → GET with
 * `Authorization: Bearer $CRON_SECRET`). The app also generates on demand when
 * pages load, so this is belt-and-braces.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "service key not configured" }, { status: 500 });
  }
  const today = todayISO();
  const { data, error } = await admin.rpc("ensure_task_instances", {
    p_from: addDaysISO(today, -1),
    p_to: addDaysISO(today, 45),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, today, inserted: data });
}
