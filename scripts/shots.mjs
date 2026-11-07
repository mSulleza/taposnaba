/**
 * Mobile screenshots + a layout audit, driven over the Chrome DevTools
 * Protocol so the viewport is really 390x844 (a phone), not whatever minimum
 * width the desktop window manager allows.
 *
 *   chrome --headless=new --remote-debugging-port=9222
 *   node scripts/shots.mjs <baseUrl> <outDir> <page...>
 */
const BASE = process.argv[2] ?? "http://localhost:54322";
const OUT = process.argv[3] ?? "/tmp/shots";
const PAGES = process.argv.slice(4);
const CDP = process.env.CDP_URL ?? "http://127.0.0.1:9222";

import { writeFileSync, mkdirSync } from "node:fs";

const VIEWPORT = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true };

async function connect() {
  const version = await (await fetch(`${CDP}/json/version`)).json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else {
      listeners.forEach((l) => l(msg));
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  return { send, ws, on: (fn) => listeners.push(fn) };
}

const AUDIT = `(() => {
  const de = document.documentElement;
  const overflowing = [];
  const vw = window.innerWidth;
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) {
      overflowing.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className || "")).slice(0, 70),
        text: (el.textContent || "").trim().slice(0, 40),
        left: Math.round(r.left), right: Math.round(r.right),
      });
    }
  }
  // Interactive targets smaller than 44px in either dimension.
  const small = [];
  for (const el of document.querySelectorAll("a, button, input, select, textarea, [role=button]")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.height < 40 || r.width < 24) {
      small.push({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || el.getAttribute("aria-label") || el.getAttribute("type") || "").trim().slice(0, 30),
        w: Math.round(r.width), h: Math.round(r.height),
      });
    }
  }
  return JSON.stringify({
    innerWidth: vw,
    scrollWidth: de.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    horizontalOverflow: de.scrollWidth > vw,
    overflowing: overflowing.slice(0, 8),
    smallTargets: small.slice(0, 10),
  });
})()`;

const { send } = await connect();
mkdirSync(OUT, { recursive: true });

const problems = [];
for (const page of PAGES) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Emulation.setDeviceMetricsOverride", VIEWPORT, sessionId);
  await send("Page.navigate", { url: `${BASE}/${page}.html` }, sessionId);
  await new Promise((r) => setTimeout(r, 2500));

  const { result } = await send(
    "Runtime.evaluate",
    { expression: AUDIT, returnByValue: true },
    sessionId
  );
  const audit = JSON.parse(result.value);

  const shot = await send(
    "Page.captureScreenshot",
    { format: "png", captureBeyondViewport: true },
    sessionId
  );
  writeFileSync(`${OUT}/${page}.png`, Buffer.from(shot.data, "base64"));

  const flags = [];
  if (audit.horizontalOverflow) {
    flags.push(`horizontal overflow (${audit.scrollWidth}px > ${audit.innerWidth}px)`);
    audit.overflowing.forEach((o) => flags.push(`   ↳ <${o.tag} class="${o.cls}"> ${o.left}..${o.right} "${o.text}"`));
  }
  if (audit.smallTargets.length) {
    flags.push(`${audit.smallTargets.length} small tap target(s)`);
    audit.smallTargets.forEach((s) => flags.push(`   ↳ <${s.tag}> ${s.w}x${s.h} "${s.text}"`));
  }
  console.log(`${flags.length ? "⚠" : "✔"} ${page} — viewport ${audit.innerWidth}, scrollWidth ${audit.scrollWidth}`);
  flags.forEach((f) => console.log(`   ${f}`));
  if (audit.horizontalOverflow) problems.push(page);

  await send("Target.closeTarget", { targetId });
}

console.log(`\nscreenshots in ${OUT}`);
if (problems.length) {
  console.log(`pages with horizontal overflow: ${problems.join(", ")}`);
}
process.exit(0);
