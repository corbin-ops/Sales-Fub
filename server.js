const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const PASSWORD = process.env.DASHBOARD_PASSWORD || "AIDewClawReady%";

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

function isAuthed(req) {
  const cookies = req.headers.cookie || "";
  return cookies.split(";").map(c => c.trim()).includes("fub_auth=1");
}

app.use((req, res, next) => {
  if (
    req.path === "/login" ||
    req.path === "/auth/login" ||
    req.path === "/auth/logout" ||
    req.path.startsWith("/css/") ||
    req.path.startsWith("/js/") ||
    req.path === "/favicon.ico"
  ) return next();
  if (!isAuthed(req) && req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (!isAuthed(req)) return res.redirect("/login");
  next();
});

app.get("/login", (req, res) => {
  if (isAuthed(req)) return res.redirect("/");
  res.send(loginHTML(""));
});

app.post("/auth/login", (req, res) => {
  const pwd = (req.body.password || "").trim();
  if (pwd === PASSWORD) {
    res.setHeader("Set-Cookie", "fub_auth=1; Path=/; HttpOnly; Max-Age=28800; SameSite=Strict");
    return res.redirect("/");
  }
  res.send(loginHTML("Wrong password — try again."));
});

app.get("/auth/logout", (req, res) => {
  res.setHeader("Set-Cookie", "fub_auth=1; Path=/; HttpOnly; Max-Age=0");
  res.redirect("/login");
});

app.use(express.static(path.join(__dirname, "public")));

async function fubFetch(apiKey, endpoint, sysName, sysKey) {
  const token = Buffer.from(apiKey + ":").toString("base64");
  const resp = await fetch(`https://api.followupboss.com/v1/${endpoint}`, {
    headers: {
      "Authorization": `Basic ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-System": sysName,
      ...(sysKey && { "X-System-Key": sysKey }),
    },
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(body.errorMessage || body.error || `FUB ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  return body;
}

async function fetchAll(apiKey, endpoint, dataKey, sysName, sysKey) {
  const LIMIT = 100;
  let offset = 0, all = [], total = null, page = 0;
  console.log(`[FUB] fetchAll: ${endpoint}`);
  while (true) {
    page++;
    const sep = endpoint.includes("?") ? "&" : "?";
    const data = await fubFetch(apiKey, `${endpoint}${sep}limit=${LIMIT}&offset=${offset}`, sysName, sysKey);
    const records = data[dataKey] || (data._embedded && data._embedded[dataKey]) || [];
    all = all.concat(records);
    if (total === null) {
      total = (data._metadata && data._metadata.total) ||
              (data.metadata  && data.metadata.total)  ||
              data.total || 0;
      console.log(`[FUB] Total: ${total} for ${endpoint}`);
    }
    console.log(`[FUB] Page ${page}: got ${records.length}, total so far: ${all.length}`);
    if (records.length < LIMIT || (total > 0 && offset + LIMIT >= total)) break;
    offset += LIMIT;
    if (page >= 2000) break;
  }
  console.log(`[FUB] Done: ${all.length} records for ${endpoint}`);
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

app.get("/api/fub", async (req, res) => {
  if (!needKey(req, res)) return;
  const { apiKey, sysName, sysKey } = creds(req);
  const p = req.query.path;
  if (!p) return res.status(400).json({ error: "Missing ?path=" });
  try { return res.json(await fubFetch(apiKey, p, sysName, sysKey)); }
  catch (e) { return res.status(e.status || 500).json({ error: e.message }); }
});

app.get("/api/fub/dashboard", async (req, res) => {
  if (!needKey(req, res)) return;
  const { apiKey, sysName, sysKey } = creds(req);
  try {
    console.log("[DASH] Starting full fetch...");

    // Fetch in parallel — textMessages removed (requires extra params)
    const [people, calls, notes, appointments, users] = await Promise.all([
      fetchAll(apiKey, "people?sort=-created",        "people",       sysName, sysKey),
      fetchAll(apiKey, "calls?sort=-created",         "calls",        sysName, sysKey),
      fetchAll(apiKey, "notes?sort=-created",         "notes",        sysName, sysKey),
      fetchAll(apiKey, "appointments?sort=-created",  "appointments", sysName, sysKey),
      fetchAll(apiKey, "users",                       "users",        sysName, sysKey),
    ]);

    console.log(`[DASH] Complete — people:${people.length} calls:${calls.length} notes:${notes.length} appts:${appointments.length} users:${users.length}`);

    return res.json({
      people, calls, notes, appointments, users,
      texts: [], // disabled — requires personId param
      meta: {
        totalPeople:       people.length,
        totalCalls:        calls.length,
        totalNotes:        notes.length,
        totalAppointments: appointments.length,
        totalUsers:        users.length,
        totalTexts:        0,
        fetchedAt:         new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error("[DASH] Error:", e.message);
    return res.status(e.status || 500).json({ error: e.message });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`FUB Dashboard running on port ${PORT}`);
});

function loginHTML(error) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>FUB Dashboard — Sign in</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'DM Sans',sans-serif;background:#0d0d0d;color:#f0ede8;min-height:100vh;display:flex;align-items:center;justify-content:center}
    .card{background:#141414;border:0.5px solid rgba(255,255,255,0.08);border-radius:16px;padding:2.5rem 2rem;width:100%;max-width:360px}
    .brand{display:flex;align-items:center;gap:10px;margin-bottom:2rem}
    .mark{width:36px;height:36px;background:#e8d5a3;color:#0d0d0d;font-family:'DM Mono',monospace;font-size:11px;font-weight:500;border-radius:8px;display:flex;align-items:center;justify-content:center}
    .name{font-size:15px;font-weight:500}
    .sub{font-size:12px;color:#5a5754;margin-top:2px}
    label{display:block;font-size:11px;color:#5a5754;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
    input{width:100%;background:#1a1a1a;border:0.5px solid rgba(255,255,255,0.1);border-radius:8px;color:#f0ede8;font-family:'DM Mono',monospace;font-size:14px;padding:10px 12px;outline:none;margin-bottom:14px;transition:border-color .15s}
    input:focus{border-color:rgba(255,255,255,0.25)}
    button{width:100%;background:#e8d5a3;color:#0d0d0d;border:none;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;padding:11px;cursor:pointer;transition:opacity .15s}
    button:hover{opacity:.88}
    .err{background:rgba(232,97,74,0.1);border:0.5px solid rgba(232,97,74,0.3);border-radius:8px;padding:10px 12px;font-size:13px;color:#e8614a;margin-bottom:14px}
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <div class="mark">FUB</div>
      <div><div class="name">Sales Dashboard</div><div class="sub">DewClaw Land</div></div>
    </div>
    ${error ? `<div class="err">${error}</div>` : ""}
    <form method="POST" action="/auth/login">
      <label>Password</label>
      <input type="password" name="password" placeholder="Enter password" autofocus required/>
      <button type="submit">Sign in →</button>
    </form>
  </div>
</body>
</html>`;
}
