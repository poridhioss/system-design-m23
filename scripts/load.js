// scripts/load.js: send a steady stream of clicks and print one summary line per second.
// Usage: node scripts/load.js [clicks per second]   (default 30). Stop with Ctrl+C.
const SHORTENER = process.env.SHORTENER_URL || "http://localhost:3000";
const LINKS = process.env.LINKS_URL || "http://localhost:3001";
const RATE = Number(process.argv[2] || 30);

// Like on the real web, most clicks go to a few popular links:
// 80% to c001-c010, 20% to the other 90 links (c011-c100).
function pickCode() {
  const n = Math.random() < 0.8
    ? 1 + Math.floor(Math.random() * 10)
    : 11 + Math.floor(Math.random() * 90);
  return `c${String(n).padStart(3, "0")}`;
}

let inFlight = 0;                                          // clicks sent but not answered yet
let second = { ok: 0, fallback: 0, failed: 0, times: [] }; // results of the current second
const total = { ok: 0, fallback: 0, failed: 0, worstP95: 0, mostInFlight: 0 };
const startedAt = Date.now();

// One click: ask for the redirect, but don't follow it (we only care about the 302).
async function click() {
  inFlight++;
  total.mostInFlight = Math.max(total.mostInFlight, inFlight);
  const start = Date.now();
  let result = "failed";
  try {
    const res = await fetch(`${SHORTENER}/${pickCode()}`, { redirect: "manual" });
    await res.arrayBuffer(); // read the body so the connection can be reused
    if (res.status === 302) result = res.headers.get("x-source") === "cache" ? "fallback" : "ok";
  } catch {
    // connection refused or reset: counts as failed
  }
  inFlight--;
  second[result]++;
  second.times.push(Date.now() - start);
}

// 95% of the clicks this second were at least this fast.
function p95(times) {
  if (times.length === 0) return null;
  const sorted = [...times].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

async function getJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(500) });
    return await res.json();
  } catch {
    return null;
  }
}

const pad = (value, width) => String(value).padStart(width);
let lastLinksCalls = null;

async function report() {
  const done = second;
  second = { ok: 0, fallback: 0, failed: 0, times: [] };
  const latency = p95(done.times);
  const flying = inFlight;

  const [stats, links] = await Promise.all([
    getJson(`${SHORTENER}/admin/stats`),
    getJson(`${LINKS}/admin/stats`),
  ]);
  const callsNow = links ? links.calls : null;
  const callsThisSecond = callsNow !== null && lastLinksCalls !== null ? callsNow - lastLinksCalls : "?";
  if (callsNow !== null) lastLinksCalls = callsNow;

  total.ok += done.ok;
  total.fallback += done.fallback;
  total.failed += done.failed;
  if (latency !== null) total.worstP95 = Math.max(total.worstP95, latency);

  const t = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `t=${pad(t, 4)}s | ok ${pad(done.ok, 3)}  fallback ${pad(done.fallback, 3)}  failed ${pad(done.failed, 3)}` +
    ` | p95 ${pad(latency === null ? "-" : latency, 5)} ms | in flight ${pad(flying, 3)}` +
    ` | breaker ${(stats ? stats.breaker : "?").padEnd(8)} | calls to links ${pad(callsThisSecond, 3)}`
  );
}

console.log(`Sending ${RATE} clicks per second to ${SHORTENER}. Press Ctrl+C to stop.`);
setInterval(click, 1000 / RATE);
setInterval(report, 1000);

process.on("SIGINT", () => {
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\n--- Summary over ${seconds} s ---`);
  console.log(`ok ${total.ok}  fallback ${total.fallback}  failed ${total.failed}`);
  console.log(`worst p95: ${total.worstP95} ms   most in flight: ${total.mostInFlight}`);
  process.exit(0);
});
