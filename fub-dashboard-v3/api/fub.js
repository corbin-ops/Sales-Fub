/**
 * api/fub.js — Vercel Serverless Proxy
 * ─────────────────────────────────────────────
 * Sits between the browser and Follow Up Boss API.
 * Solves CORS and injects all required FUB auth headers.
 *
 * FUB requires THREE things on every request:
 *   1. Authorization: Basic base64(apiKey + ":")
 *   2. X-System: your registered system name
 *   3. X-System-Key: your registered system key
 *
 * Register your system free at:
 * https://followupboss.com/2/register.pl
 *
 * Usage from browser:
 *   GET /api/fub?path=people%3Flimit%3D100
 *   Header: x-fub-key: fka_...
 */

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-fub-key");

  if (req.method === "OPTIONS") return res.status(200).end();

  const apiKey = req.headers["x-fub-key"];
  if (!apiKey) {
    return res.status(400).json({ error: "Missing x-fub-key header" });
  }

  const path = req.query.path;
  if (!path) {
    return res.status(400).json({ error: "Missing ?path= query param" });
  }

  const authToken = Buffer.from(apiKey + ":").toString("base64");

  // X-System headers — register free at https://followupboss.com/2/register.pl
  const X_SYSTEM = process.env.FUB_SYSTEM_NAME || "SalesDashboard";
  const X_SYSTEM_KEY = process.env.FUB_SYSTEM_KEY || "";

  const url = `https://api.followupboss.com/v1/${path}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${authToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-System": X_SYSTEM,
        ...(X_SYSTEM_KEY && { "X-System-Key": X_SYSTEM_KEY }),
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.errorMessage || data.error || `FUB returned ${response.status}`,
        details: data,
      });
    }

    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate");
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: "Proxy fetch failed: " + err.message });
  }
}
