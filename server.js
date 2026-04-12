const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.DASHBOARD_PASSWORD || "AIDewClawReady%";

app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "2mb" }));

function isAuthed(req) {
  const cookies = req.headers.cookie || "";
  return cookies.split(";").map(c => c.trim()).includes("fub_auth=1");
}

app.use((req, res, next) => {
  if (req.path === "/login" || req.path === "/auth/login" || req.path === "/auth/logout" ||
      req.path.startsWith("/css/") || req.path.startsWith("/js/") || req.path === "/favicon.ico") return next();
  if (!isAuthed(req) && req.path.startsWith("/api/")) return res.status(401).json({ error: "Not authenticated" });
  if (!isAuthed(req)) return res.redirect("/login");
  next();
});

app.get("/login", (req, res) => { if (isAuthed(req)) return res.redirect("/"); res.send(loginHTML("")); });
app.post("/auth/login", (req, res) => {
  if ((req.body.password || "").trim() === PASSWORD) {
    res.setHeader("Set-Cookie", "fub_auth=1; Path=/; HttpOnly; Max-Age=28800; SameSite=Strict");
    return res.redirect("/");
  }
  res.send(loginHTML("Wrong password."));
});
app.get("/auth/logout", (req, res) => {
  res.setHeader("Set-Cookie", "fub_auth=1; Path=/; HttpOnly; Max-Age=0");
  res.redirect("/login");
});

app.use(express.static(path.join(__dirname, "public")));

// ── FUB fetch with 429 retry ──────────────────────────────────────────────────
async function fubFetch(apiKey, url, sysName, sysKey, retries = 5) {
  const token = Buffer.from(apiKey + ":").toString("base64");
  const fullUrl = url.startsWith("http") ? url : `https://api.followupboss.com/v1/${url}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const resp = await fetch(fullUrl, {
      headers: {
        "Authorization": `Basic ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-System": sysName,
        ...(sysKey && { "X-System-Key": sysKey }),
      },
    });

    if (resp.status === 429) {
      const wait = Math.pow(2, attempt) * 2000;
      console.log(`[FUB] 429 — waiting ${wait}ms (attempt ${attempt + 1})`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err = new Error(body.errorMessage || body.error || `FUB ${resp.status}`);
      err.status = resp.status;
      throw err;
    }
    return body;
  }
  throw new Error("Max retries exceeded");
}

// ── Paginator using _metadata.nextLink ───────────────────────────────────────
async function fetchAllPages(apiKey, endpoint, dataKey, sysName, sysKey) {
  const LIMIT = 100;
  let all = [];
  let page = 0;
  let currentUrl = `${endpoint}${endpoint.includes("?") ? "&" : "?"}limit=${LIMIT}`;

  console.log(`[FUB] fetchAllPages: ${endpoint}`);

  while (currentUrl) {
    page++;
    const data = await fubFetch(apiKey, currentUrl, sysName, sysKey);
    const records = data[dataKey] || (data._embedded && data._embedded[dataKey]) || [];
    all = all.concat(records);

    const meta = data._metadata || {};
    const total = meta.total || 0;
    const nextLink = meta.nextLink || null;

    console.log(`[FUB] Page ${page}: +${records.length} = ${all.length}/${total}`);

    if (nextLink && records.length === LIMIT && all.length < total) {
      currentUrl = nextLink;
    } else {
      currentUrl = null;
    }

    if (currentUrl) await new Promise(r => setTimeout(r, 250));
  }

  console.log(`[FUB] Done: ${all.length} ${dataKey}`);
  return all;
}

function creds(req) {
  return {
    apiKey:  req.headers["x-fub-key"] || "",
    sysName: process.env.FUB_SYSTEM_NAME || "SalesDashboard",
    sysKey:  process.env.FUB_SYSTEM_KEY  || "",
  };
}

function needKey(req, res) {
  if (!req.headers["x-fub-key"]) { res.status(400).json({ error: "Missing x-fub-key" }); return false; }
  return true;
}

// ── FUB generic proxy ─────────────────────────────────────────────────────────
app.get("/api/fub", async (req, res) => {
  if (!needKey(req, res)) return;
  const { apiKey, sysName, sysKey } = creds(req);
  const p = req.query.path;
  if (!p) return res.status(400).json({ error: "Missing ?path=" });
  try { return res.json(await fubFetch(apiKey, p, sysName, sysKey)); }
  catch (e) { return res.status(e.status || 500).json({ error: e.message }); }
});

// ── FUB debug ─────────────────────────────────────────────────────────────────
app.get("/api/fub/debug", async (req, res) => {
  if (!needKey(req, res)) return;
  const { apiKey, sysName, sysKey } = creds(req);
  try {
    const data = await fubFetch(apiKey, "people?limit=5", sysName, sysKey);
    return res.json({ _metadata: data._metadata, recordCount: (data.people || []).length, topLevelKeys: Object.keys(data) });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ── FUB full dashboard ────────────────────────────────────────────────────────
app.get("/api/fub/dashboard", async (req, res) => {
  if (!needKey(req, res)) return;
  const { apiKey, sysName, sysKey } = creds(req);
  try {
    console.log("[DASH] Starting full fetch...");
    const people      = await fetchAllPages(apiKey, "people?sort=-created",       "people",       sysName, sysKey);
    await new Promise(r => setTimeout(r, 500));
    const calls       = await fetchAllPages(apiKey, "calls?sort=-created",        "calls",        sysName, sysKey);
    await new Promise(r => setTimeout(r, 500));
    const notes       = await fetchAllPages(apiKey, "notes?sort=-created",        "notes",        sysName, sysKey);
    await new Promise(r => setTimeout(r, 500));
    const appointments= await fetchAllPages(apiKey, "appointments?sort=-created", "appointments", sysName, sysKey);
    await new Promise(r => setTimeout(r, 500));
    const users       = await fetchAllPages(apiKey, "users",                      "users",        sysName, sysKey);

    console.log(`[DASH] Complete — people:${people.length} calls:${calls.length} notes:${notes.length} appts:${appointments.length} users:${users.length}`);
    return res.json({
      people, calls, notes, appointments, users, texts: [],
      meta: {
        totalPeople: people.length, totalCalls: calls.length,
        totalNotes: notes.length, totalAppointments: appointments.length,
        totalUsers: users.length, totalTexts: 0,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error("[DASH] Error:", e.message);
    return res.status(e.status || 500).json({ error: e.message });
  }
});

// ── Claude AI proxy — routes through server to avoid browser CORS ─────────────
app.post("/api/claude", async (req, res) => {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in environment variables" });
  }

  try {
    const { system, prompt, model, max_tokens } = req.body;
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model || "claude-sonnet-4-20250514",
        max_tokens: max_tokens || 1200,
        system: system,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({ error: data.error?.message || "Claude API error" });
    }

    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: "Claude proxy error: " + e.message });
  }
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`FUB Dashboard on port ${PORT}`));

function loginHTML(error) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>FUB Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap" rel="stylesheet"/>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'DM Mono',monospace;background:#0a0c10;color:#e8edf5;min-height:100vh;display:flex;align-items:center;justify-content:center}.card{background:#111318;border:1px solid #1e2530;border-radius:16px;padding:2.5rem 2rem;width:100%;max-width:360px}.brand{display:flex;align-items:center;gap:10px;margin-bottom:2rem}.dot{width:8px;height:8px;background:#00e5a0;border-radius:50%;box-shadow:0 0 10px #00e5a0}.name{font-family:'Syne',sans-serif;font-weight:800;font-size:16px}.sub{font-size:11px;color:#5a6478;margin-top:2px}label{display:block;font-size:10px;color:#5a6478;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px}input{width:100%;background:#181c24;border:1px solid #1e2530;border-radius:8px;color:#e8edf5;font-family:'DM Mono',monospace;font-size:13px;padding:10px 12px;outline:none;margin-bottom:14px}input:focus{border-color:rgba(0,229,160,0.4)}button{width:100%;background:#00e5a0;color:#000;border:none;border-radius:8px;font-family:'DM Mono',monospace;font-size:12px;font-weight:500;padding:11px;cursor:pointer;text-transform:uppercase;letter-spacing:.5px}.err{background:rgba(255,71,87,0.1);border:1px solid rgba(255,71,87,0.3);border-radius:8px;padding:10px 12px;font-size:12px;color:#ff4757;margin-bottom:14px}</style>
  </head><body><div class="card"><div class="brand"><div class="dot"></div><div><div class="name">DEWCLAW LAND</div><div class="sub">Sales Intelligence</div></div></div>
  ${error ? `<div class="err">${error}</div>` : ""}
  <form method="POST" action="/auth/login"><label>Password</label><input type="password" name="password" placeholder="Enter password" autofocus required/><button type="submit">Sign in →</button></form>
  </div></body></html>`;
}
