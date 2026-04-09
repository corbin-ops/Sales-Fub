const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Password protection ───────────────────────────────────────────────────────
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "AIDewClawReady%";

// Serve login page and static assets freely, protect everything else
app.use((req, res, next) => {
  // Always allow static assets (css, js, fonts)
  if (req.path.startsWith("/css/") || req.path.startsWith("/js/") || req.path === "/favicon.ico") {
    return next();
  }
  // Always allow the login endpoint
  if (req.path === "/auth/login") return next();

  // Check session cookie
  const cookie = req.headers.cookie || "";
  const authenticated = cookie.split(";").some(c => c.trim() === "auth=true");

  if (!authenticated) {
    // API calls get a 401
    if (req.path.startsWith("/api/")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    // Everything else gets the login page
    return res.send(loginPage());
  }

  next();
});

// Parse body for login form
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Login endpoint
app.post("/auth/login", (req, res) => {
  const { password } = req.body;
  if (password === DASHBOARD_PASSWORD) {
    // Set auth cookie — httpOnly, 8 hour expiry
    res.setHeader("Set-Cookie", `auth=true; Path=/; HttpOnly; Max-Age=28800; SameSite=Strict`);
    return res.redirect("/");
  }
  return res.send(loginPage("Incorrect password. Please try again."));
});

// Logout
app.get("/auth/logout", (req, res) => {
  res.setHeader("Set-Cookie", "auth=true; Path=/; HttpOnly; Max-Age=0");
  res.redirect("/");
});

// Serve dashboard files
app.use(express.static(path.join(__dirname, "public")));

// ── FUB helpers ───────────────────────────────────────────────────────────────
async function fubFetch(apiKey, endpoint, systemName, systemKey) {
  const auth = Buffer.from(apiKey + ":").toString("base64");
  const resp = await fetch(`https://api.followupboss.com/v1/${endpoint}`, {
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-System": systemName,
      ...(systemKey && { "X-System-Key": systemKey }),
    },
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    const err = new Error(e.errorMessage || e.error || `FUB ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  return resp.json();
}

async function fetchAllPages(apiKey, endpoint, dataKey, systemName, systemKey) {
  const limit = 100;
  let offset = 0, all = [], total = null;
  while (true) {
    const sep = endpoint.includes("?") ? "&" : "?";
    const data = await fubFetch(apiKey, `${endpoint}${sep}limit=${limit}&offset=${offset}`, systemName, systemKey);
    const records = data[dataKey] || (data._embedded && data._embedded[dataKey]) || [];
    all = all.concat(records);
    if (total === null) {
      total = (data._metadata && data._metadata.total) ||
              (data.metadata  && data.metadata.total)  ||
              data.total || 0;
    }
    offset += limit;
    if (records.length < limit || (total > 0 && offset >= total)) break;
  }
  return all;
}

function getAuth(req) {
  return {
    apiKey:     req.headers["x-fub-key"] || "",
    systemName: process.env.FUB_SYSTEM_NAME || "SalesDashboard",
    systemKey:  process.env.FUB_SYSTEM_KEY  || "",
  };
}

function requireKey(req, res) {
  if (!req.headers["x-fub-key"]) { res.status(400).json({ error: "Missing x-fub-key header" }); return false; }
  return true;
}

// ── API routes ────────────────────────────────────────────────────────────────
app.get("/api/fub", async (req, res) => {
  if (!requireKey(req, res)) return;
  const { apiKey, systemName, systemKey } = getAuth(req);
  const p = req.query.path;
  if (!p) return res.status(400).json({ error: "Missing ?path=" });
  try { return res.json(await fubFetch(apiKey, p, systemName, systemKey)); }
  catch (e) { return res.status(e.status || 500).json({ error: e.message }); }
});

app.get("/api/fub/dashboard", async (req, res) => {
  if (!requireKey(req, res)) return;
  const { apiKey, systemName, systemKey } = getAuth(req);
  try {
    const [people, calls, notes, appointments, users, texts] = await Promise.all([
      fetchAllPages(apiKey, "people?sort=-created",       "people",       systemName, systemKey),
      fetchAllPages(apiKey, "calls?sort=-created",        "calls",        systemName, systemKey),
      fetchAllPages(apiKey, "notes?sort=-created",        "notes",        systemName, systemKey),
      fetchAllPages(apiKey, "appointments?sort=-created", "appointments", systemName, systemKey),
      fetchAllPages(apiKey, "users",                      "users",        systemName, systemKey),
      fetchAllPages(apiKey, "textMessages?sort=-created", "textMessages", systemName, systemKey),
    ]);
    return res.json({
      people, calls, notes, appointments, users, texts,
      meta: {
        totalPeople: people.length, totalCalls: calls.length,
        totalNotes: notes.length, totalAppointments: appointments.length,
        totalUsers: users.length, totalTexts: texts.length,
        fetchedAt: new Date().toISOString(),
      }
    });
  } catch (e) { return res.status(e.status || 500).json({ error: e.message }); }
});

// ── Fallback ──────────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Login page HTML ───────────────────────────────────────────────────────────
function loginPage(error = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>FUB Dashboard — Sign in</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'DM Sans', sans-serif;
      background: #0d0d0d;
      color: #f0ede8;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #141414;
      border: 0.5px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 2.5rem 2rem;
      width: 100%;
      max-width: 360px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 2rem;
    }
    .brand-mark {
      width: 36px; height: 36px;
      background: #e8d5a3;
      color: #0d0d0d;
      font-family: 'DM Mono', monospace;
      font-size: 11px;
      font-weight: 500;
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
    }
    .brand-name { font-size: 15px; font-weight: 500; color: #f0ede8; }
    .brand-sub  { font-size: 12px; color: #5a5754; margin-top: 1px; }
    label { display: block; font-size: 11px; color: #5a5754; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6px; }
    input[type=password] {
      width: 100%;
      background: #1a1a1a;
      border: 0.5px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      color: #f0ede8;
      font-family: 'DM Mono', monospace;
      font-size: 14px;
      padding: 10px 12px;
      outline: none;
      margin-bottom: 14px;
      transition: border-color .15s;
    }
    input[type=password]:focus { border-color: rgba(255,255,255,0.25); }
    button {
      width: 100%;
      background: #e8d5a3;
      color: #0d0d0d;
      border: none;
      border-radius: 8px;
      font-family: 'DM Sans', sans-serif;
      font-size: 14px;
      font-weight: 500;
      padding: 10px;
      cursor: pointer;
      transition: opacity .15s;
    }
    button:hover { opacity: .88; }
    .error {
      background: rgba(232,97,74,0.1);
      border: 0.5px solid rgba(232,97,74,0.3);
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 13px;
      color: #e8614a;
      margin-bottom: 14px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <div class="brand-mark">FUB</div>
      <div><div class="brand-name">Sales Dashboard</div><div class="brand-sub">DewClaw Land</div></div>
    </div>
    ${error ? `<div class="error">${error}</div>` : ""}
    <form method="POST" action="/auth/login">
      <label>Password</label>
      <input type="password" name="password" placeholder="Enter dashboard password" autofocus required/>
      <button type="submit">Sign in</button>
    </form>
  </div>
</body>
</html>`;
}

app.listen(PORT, () => console.log(`FUB Dashboard → http://localhost:${PORT}`));
