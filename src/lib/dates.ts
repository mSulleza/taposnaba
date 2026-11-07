import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { APP_TZ } from "@/lib/env";

/** YYYY-MM-DD for "now" in Asia/Manila. */
export function todayISO(now: Date = new Date()): string {
  return formatInTimeZone(now, APP_TZ, "yyyy-MM-dd");
}

export function addDaysISO(iso: string, days: number): string {
  // Pure UTC arithmetic: date-fns `addDays` works in the *server's* local time,
  // which shifts the resulting UTC day on DST-transition dates.
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole-day difference b - a (both YYYY-MM-DD). */
export function diffDays(a: string, b: string): number {
  return differenceInCalendarDays(parseISO(b + "T00:00:00Z"), parseISO(a + "T00:00:00Z"));
}

/** Format a YYYY-MM-DD as a friendly date. */
export function formatDate(iso: string, locale: "tl" | "en" = "en", opts?: Intl.DateTimeFormatOptions) {
  const d = parseISO(iso + "T00:00:00Z");
  return new Intl.DateTimeFormat(locale === "tl" ? "fil-PH" : "en-PH", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    ...opts,
  }).format(d);
}

/** Format a timestamptz string in Manila time. */
export function formatDateTime(ts: string, locale: "tl" | "en" = "en") {
  return new Intl.DateTimeFormat(locale === "tl" ? "fil-PH" : "en-PH", {
    timeZone: APP_TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ts));
}

export function formatTime(ts: string) {
  return formatInTimeZone(new Date(ts), APP_TZ, "h:mm a");
}

/** "08:00:00" -> "8:00 AM" */
export function formatClock(t: string | null | undefined) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Current hour (0-23) in Manila. */
export function manilaHour(now: Date = new Date()): number {
  return toZonedTime(now, APP_TZ).getHours();
}

export function isValidISODate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  // Round-trip guards against impossible dates like 2026-02-31.
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Days of the month for a YYYY-MM prefix, as YYYY-MM-DD strings. */
export function daysInMonthISO(yyyyMM: string): string[] {
  const [y, m] = yyyyMM.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${yyyyMM}-${String(i + 1).padStart(2, "0")}`);
}
