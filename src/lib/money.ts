/**
 * Peso formatting. Values are whole pesos everywhere — the DB stores integers,
 * so there is no rounding to get wrong.
 */

/** "₱1,234". Compact enough for a badge on a task card. */
export function peso(amount: number): string {
  return "₱" + Math.round(amount).toLocaleString("en-PH");
}

/** Month boundaries (YYYY-MM-DD) for the Manila month that `iso` falls in. */
export function monthRange(iso: string): { start: string; end: string } {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

/** Whole days from `iso` to the last day of its month. 0 = `iso` IS payday. */
export function daysUntilPayday(iso: string): number {
  const { end } = monthRange(iso);
  const a = Date.parse(iso + "T00:00:00Z");
  const b = Date.parse(end + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}

/**
 * Days still available to earn in this month, counting today — today is a
 * working day, so it belongs in the count. On the 18th of a 31-day month this
 * is 14 (the 18th through the 31st), not the 13 a bare countdown would give.
 */
export function earningDaysLeft(iso: string): number {
  return daysUntilPayday(iso) + 1;
}
