// Serverless proxy so the Anthropic API key never reaches the browser.
// Deployed automatically by Vercel from /api. Set ANTHROPIC_API_KEY in
// Vercel → Project → Settings → Environment Variables.

const hits = new Map(); // best-effort per-IP rate limit (per warm instance)

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const ip = (req.headers["x-forwarded-for"] || "?").split(",")[0].trim();
  const now = Date.now();
  const rec = hits.get(ip) || { n: 0, t: now };
  if (now - rec.t > 60_000) { rec.n = 0; rec.t = now; }
  rec.n += 1; hits.set(ip, rec);
  if (rec.n > 30) return res.status(429).json({ error: "Slow down a little — try again in a minute." });

  const { system, messages, max_tokens = 700 } = req.body || {};
  if (typeof system !== "string" || !Array.isArray(messages) || messages.length > 30)
    return res.status(400).json({ error: "bad request" });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: Math.min(Number(max_tokens) || 700, 1000),
      system,
      messages,
    }),
  });
  const data = await r.json();
  res.status(r.status).json(data);
}
