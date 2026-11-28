// src/analytics.js: the analytics service. It counts clicks per short code.
const express = require("express");

const app = express();
app.use(express.json());

const clicks = new Map(); // code -> number of clicks

app.post("/clicks", (req, res) => {
  const { code } = req.body || {};
  clicks.set(code, (clicks.get(code) || 0) + 1);
  res.status(204).end();
});

app.get("/clicks/:code", (req, res) => {
  res.json({ code: req.params.code, clicks: clicks.get(req.params.code) || 0 });
});

app.listen(3000, () => console.log("[analytics] listening on port 3000"));
