/**
 * Only allow same-origin path redirects. Browsers normalise backslashes to
 * forward slashes, so "/\\evil.com" would become "//evil.com" — a
 * protocol-relative URL pointing off-site. Reject anything that is not a plain
 * single-slash path.
 */
export function safeNextPath(next: unknown, fallback = "/"): string {
  if (typeof next !== "string") return fallback;
  const value = next.trim();
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (/[\\\s]/.test(value)) return fallback;
  if (value.includes("://")) return fallback;
  return value;
}
