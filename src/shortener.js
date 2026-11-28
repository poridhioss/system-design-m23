// src/shortener.js: the only service users talk to. Creates short links and redirects.
const express = require("express");
const { createBreaker, stateOf } = require("./breaker");

const LINKS_URL = process.env.LINKS_URL || "http://localhost:3001";
const ANALYTICS_URL = process.env.ANALYTICS_URL || "http://localhost:3002";
const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:3000";
const PROTECTION = process.env.PROTECTION || "none"; // none | timeout | breaker
const FALLBACK = process.env.FALLBACK || "none";     // none | cache

const TIMEOUT_MS = 500; // how long we wait for links before giving up
const CACHE_SIZE = 20;  // how many recently used links we keep a copy of

const app = express();
app.use(express.json());

// ---- 1. Ask the links service where a code goes ---------------------------------

async function askLinks(code) {
  // With PROTECTION=none we wait as long as links takes. Otherwise we give up after 500 ms.
  const options = PROTECTION === "none" ? {} : { signal: AbortSignal.timeout(TIMEOUT_MS) };
  const res = await fetch(`${LINKS_URL}/links/${encodeURIComponent(code)}`, options);
  if (res.status === 404) return null; // a correct answer ("no such link"), not a failure
  if (!res.ok) throw new Error(`links answered ${res.status}`);
  return (await res.json()).url;
}

const breaker = createBreaker(askLinks, "links");

function lookup(code) {
  if (PROTECTION === "breaker") return breaker.fire(code); // goes through the breaker
  return askLinks(code);                                   // calls links directly
}

// ---- 2. The fallback cache: copies of recently used links ------------------------

const cache = new Map(); // code -> long URL, oldest first

function remember(code, url) {
  cache.delete(code); // remove and add again, so this code becomes the newest
  cache.set(code, url);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value); // forget the oldest
}

// ---- 3. Tell analytics about the click -------------------------------------------

async function recordClick(code) {
  try {
    await fetch(`${ANALYTICS_URL}/clicks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
  } catch (err) {
    // a lost click count is not a reason to fail the redirect
  }
}

// ---- 4. Routes ---------------------------------------------------------------------

app.get("/health", (req, res) => res.json({ status: "ok" }));

// The current settings and breaker state, read by scripts/load.js every second.
app.get("/admin/stats", (req, res) => {
  res.json({
    protection: PROTECTION,
    fallback: FALLBACK,
    breaker: PROTECTION === "breaker" ? stateOf(breaker) : "off",
    cached: cache.size,
  });
});

// Create a short link.
app.post("/links", async (req, res) => {
  const { url } = req.body || {};
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "a valid url is required" });
  }
  const answer = await fetch(`${LINKS_URL}/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!answer.ok) return res.status(503).json({ error: "could not save the link, try again soon" });
  const { code } = await answer.json();
  res.status(201).json({ code, shortUrl: `${PUBLIC_URL}/${code}`, url });
});

// Follow a short link.
app.get("/:code", async (req, res) => {
  const { code } = req.params;
  let url;
  let source = "links";

  try {
    url = await lookup(code);
  } catch (err) {
    // links was too slow, failed, or the breaker refused the call
    if (FALLBACK !== "cache" || !cache.has(code)) {
      return res.status(503).json({ error: "links is unavailable, try again soon" });
    }
    url = cache.get(code);
    source = "cache";
  }

  if (!url) return res.status(404).json({ error: "link not found" });
  if (source === "links") remember(code, url);

  await recordClick(code);
  res.set("X-Source", source).redirect(302, url);
});

app.listen(3000, () =>
  console.log(`[shortener] listening on port 3000 (protection: ${PROTECTION}, fallback: ${FALLBACK})`));
