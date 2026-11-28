// src/links.js: the links service. It remembers where each short code goes.
const express = require("express");
const { randomBytes } = require("crypto");

const app = express();
app.use(express.json());

// The links, kept in memory: code -> long URL. Seeded with 100 links, c001 ... c100.
const links = new Map();
for (let i = 1; i <= 100; i++) {
  links.set(`c${String(i).padStart(3, "0")}`, `https://example.com/articles/${i}`);
}

// The fault switch. Change it while the service runs, with POST /admin/fault.
let fault = { delayMs: 0, failRate: 0 };
let calls = 0; // how many link requests have arrived since the start

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Admin routes: not affected by the fault, so you can always reach them.
app.post("/admin/fault", (req, res) => {
  const { delayMs = 0, failRate = 0 } = req.body || {};
  fault = { delayMs: Number(delayMs), failRate: Number(failRate) };
  console.log(`[links] fault set: delay ${fault.delayMs} ms, fail rate ${fault.failRate}`);
  res.json(fault);
});

app.get("/admin/stats", (req, res) => res.json({ calls, fault }));

// Every /links request goes through the fault first: wait, and maybe fail.
app.use("/links", async (req, res, next) => {
  calls++;
  if (fault.delayMs > 0) await sleep(fault.delayMs);
  if (Math.random() < fault.failRate) {
    return res.status(500).json({ error: "links is failing (injected)" });
  }
  next();
});

// Where does this code go?
app.get("/links/:code", (req, res) => {
  const url = links.get(req.params.code);
  if (!url) return res.status(404).json({ error: "link not found" });
  res.json({ code: req.params.code, url });
});

// Save a new link under a fresh random code.
app.post("/links", (req, res) => {
  const { url } = req.body || {};
  let code;
  do {
    code = randomBytes(4).toString("base64url").slice(0, 6); // e.g. "aB3x9Q"
  } while (links.has(code));
  links.set(code, url);
  res.status(201).json({ code, url });
});

app.listen(3000, () => console.log(`[links] listening on port 3000 with ${links.size} links`));
