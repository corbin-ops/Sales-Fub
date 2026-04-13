const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.DASHBOARD_PASSWORD || "AIDewClawReady%";

// ── API Keys from environment ─────────────────────────────────────────────────
const FUB_API_KEY  = process.env.FUB_API_KEY  || "";
const FUB_SYS_NAME = process.env.FUB_SYSTEM_NAME || "SalesDashboard";
const FUB_SYS_KEY  = process.env.FUB_SYSTEM_KEY  || "";
const SINCE_DATE   = process.env.SINCE_DATE || "2026-01-01";

app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "10mb" }));

// ── In-memory cache ───────────────────────────────────────────────────────────
const CACHE = {
  people: [], calls: [], notes: [], appointments: [], users: [],
  totalPeople: 0, lastSync: null, syncing: false, syncProgress: "",
};

function isAuthed(req) {
  return (req.headers.cookie || "").split(";").map(c => c.trim()).includes("fub_auth=1");
}

app.use((req, res, next) => {
  const pub = ["/login", "/auth/login", "/auth/logout"];
  if (pub.includes(req.path) || req.path.startsWith("/css/") || req.path.startsWith("/js/")) return next();
  if (!isAuthed(req) && req.path.startsWith("/api/")) return res.status(401).json({ error: "Not authenticated" });
  if (!isAuthed(req)) return res.redirect("/login");
  next();
});

app.get("/login",  (req, res) => { if (isAuthed(req)) return res.redirect("/"); res.send(loginHTML("")); });
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

// ── FUB fetch with retry ──────────────────────────────────────────────────────
async function fubFetch(url, retries = 5) {
  const token = Buffer.from(FUB_API_KEY + ":").toString("base64");
  const fullUrl = url.startsWith("http") ? url : `https://api.followupboss.com/v1/${url}`;
  for (let i = 0; i <= retries; i++) {
    const resp = await fetch(fullUrl, {
      headers: {
        "Authorization": `Basic ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-System": FUB_SYS_NAME,
        ...(FUB_SYS_KEY && { "X-System-Key": FUB_SYS_KEY }),
      },
    });
    if (resp.status === 429) {
      const w = Math.pow(2, i) * 2000;
      console.log(`[FUB] 429 — waiting ${w}ms`);
      await new Promise(r => setTimeout(r, w));
      continue;
    }
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) { const e = new Error(body.errorMessage || body.error || `FUB ${resp.status}`); e.status = resp.status; throw e; }
    return body;
  }
  throw new Error("Max retries exceeded");
}

// ── Paginator ────────────────────────────────────────────────────────────────
async function fetchAllPages(endpoint, dataKey, since = null) {
  const LIMIT = 100;
  let all = [], page = 0;
  let base = endpoint;
  if (since) base += `${base.includes("?") ? "&" : "?"}since=${encodeURIComponent(since)}`;
  let cur = `${base}${base.includes("?") ? "&" : "?"}limit=${LIMIT}`;

  while (cur) {
    page++;
    const data = await fubFetch(cur);
    const records = data[dataKey] || (data._embedded && data._embedded[dataKey]) || [];
    all = all.concat(records);
    const meta = data._metadata || {};
    const total = meta.total || 0;
    CACHE.syncProgress = `${dataKey}: ${all.length}${total ? "/" + total : ""}`;
    if (meta.nextLink && records.length === LIMIT && all.length < total) {
      cur = meta.nextLink;
    } else { cur = null; }
    if (cur) await new Promise(r => setTimeout(r, 150));
  }
  return all;
}

// ── Merge helper ──────────────────────────────────────────────────────────────
function merge(existing, incoming) {
  if (!incoming.length) return existing;
  const ids = new Set(existing.map(r => r.id));
  const updated = new Map(incoming.map(r => [r.id, r]));
  return [...existing.map(r => updated.get(r.id) || r), ...incoming.filter(r => !ids.has(r.id))];
}

// ── Background sync ───────────────────────────────────────────────────────────
async function runSync(since = null) {
  if (!FUB_API_KEY) { console.log("[SYNC] No FUB_API_KEY set — skipping sync"); return; }
  if (CACHE.syncing) return;
  CACHE.syncing = true;
  const label = since ? `incremental since ${since}` : `full since ${SINCE_DATE}`;
  console.log(`[SYNC] Starting ${label}`);

  try {
    const from = since || SINCE_DATE;
    const [people, calls, notes, appts, users] = await Promise.all([
      fetchAllPages("people?sort=-created",        "people",       from),
      fetchAllPages("calls?sort=-created",         "calls",        from),
      fetchAllPages("notes?sort=-created",         "notes",        from),
      fetchAllPages("appointments?sort=-created",  "appointments", from),
      since ? Promise.resolve([]) : fetchAllPages("users", "users"),
    ]);

    if (since) {
      CACHE.people       = merge(CACHE.people, people);
      CACHE.calls        = merge(CACHE.calls, calls);
      CACHE.notes        = merge(CACHE.notes, notes);
      CACHE.appointments = merge(CACHE.appointments, appts);
    } else {
      CACHE.people = people; CACHE.calls = calls;
      CACHE.notes = notes; CACHE.appointments = appts;
      CACHE.users = users;
    }

    const meta = await fubFetch("people?limit=1");
    CACHE.totalPeople = (meta._metadata && meta._metadata.total) || CACHE.people.length;
    CACHE.lastSync = new Date().toISOString();
    CACHE.syncProgress = "Done";
    console.log(`[SYNC] Complete — people:${CACHE.people.length} calls:${CACHE.calls.length} notes:${CACHE.notes.length}`);
  } catch (e) {
    console.error("[SYNC] Error:", e.message);
    CACHE.syncProgress = "Error: " + e.message;
  }
  CACHE.syncing = false;
}

// ── Auto-sync on startup ──────────────────────────────────────────────────────
if (FUB_API_KEY) {
  console.log("[STARTUP] FUB_API_KEY found — starting background sync...");
  setTimeout(() => runSync(), 3000); // 3s delay to let server start first

  // Re-sync every 30 minutes with only new records
  setInterval(() => {
    if (CACHE.lastSync && !CACHE.syncing) {
      runSync(CACHE.lastSync);
    }
  }, 30 * 60 * 1000);
} else {
  console.log("[STARTUP] No FUB_API_KEY set — add it to Render environment variables");
}

// ── Sync status ───────────────────────────────────────────────────────────────
app.get("/api/cache/status", (req, res) => {
  res.json({
    hasCache: CACHE.lastSync !== null,
    syncing: CACHE.syncing,
    progress: CACHE.syncProgress,
    lastSync: CACHE.lastSync,
    counts: {
      people: CACHE.people.length,
      calls: CACHE.calls.length,
      notes: CACHE.notes.length,
      appointments: CACHE.appointments.length,
      totalPeople: CACHE.totalPeople,
    },
  });
});

// Manual re-sync trigger
app.post("/api/cache/sync", (req, res) => {
  if (CACHE.syncing) return res.json({ message: "Already syncing — " + CACHE.syncProgress });
  const since = req.query.since || null;
  runSync(since).catch(e => console.error(e));
  res.json({ message: since ? `Incremental sync started since ${since}` : "Full sync started" });
});

// ── Dashboard endpoint — serves from cache ────────────────────────────────────
app.get("/api/fub/dashboard", (req, res) => {
  if (CACHE.syncing && !CACHE.lastSync) {
    return res.json({
      people: [], calls: [], notes: [], appointments: [], users: [], texts: [],
      totalPeople: 0,
      meta: {
        syncing: true,
        progress: CACHE.syncProgress,
        message: "Initial sync in progress — check back in 1–2 minutes",
        totalPeople: 0, fetchedAt: new Date().toISOString(),
      },
    });
  }
  return res.json({
    people: CACHE.people, calls: CACHE.calls, notes: CACHE.notes,
    appointments: CACHE.appointments, users: CACHE.users, texts: [],
    totalPeople: CACHE.totalPeople,
    meta: {
      totalPeople: CACHE.totalPeople, totalCalls: CACHE.calls.length,
      totalNotes: CACHE.notes.length, totalAppointments: CACHE.appointments.length,
      totalUsers: CACHE.users.length, totalTexts: 0,
      fetchedAt: CACHE.lastSync || new Date().toISOString(),
      fromCache: true, syncing: CACHE.syncing, progress: CACHE.syncProgress,
    },
  });
});

// ── Claude proxy ──────────────────────────────────────────────────────────────
app.post("/api/claude", async (req, res) => {
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in Render environment" });
  try {
    const { system, prompt, model, max_tokens } = req.body;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: model || "claude-sonnet-4-20250514", max_tokens: max_tokens || 1200, system, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.error?.message || "Claude error" });
    return res.json(data);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`FUB Dashboard on port ${PORT}`));

function loginHTML(err) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>FUB Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap" rel="stylesheet"/>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'DM Mono',monospace;background:#0a0c10;color:#e8edf5;min-height:100vh;display:flex;align-items:center;justify-content:center}.card{background:#111318;border:1px solid #1e2530;border-radius:16px;padding:2.5rem 2rem;width:100%;max-width:360px}.brand{display:flex;align-items:center;gap:10px;margin-bottom:2rem}.dot{width:8px;height:8px;background:#00e5a0;border-radius:50%;box-shadow:0 0 10px #00e5a0}.name{font-family:'Syne',sans-serif;font-weight:800;font-size:16px}.sub{font-size:11px;color:#5a6478;margin-top:2px}label{display:block;font-size:10px;color:#5a6478;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px}input{width:100%;background:#181c24;border:1px solid #1e2530;border-radius:8px;color:#e8edf5;font-family:'DM Mono',monospace;font-size:13px;padding:10px 12px;outline:none;margin-bottom:14px}input:focus{border-color:rgba(0,229,160,0.4)}button{width:100%;background:#00e5a0;color:#000;border:none;border-radius:8px;font-family:'DM Mono',monospace;font-size:12px;font-weight:500;padding:11px;cursor:pointer;text-transform:uppercase;letter-spacing:.5px}.err{background:rgba(255,71,87,0.1);border:1px solid rgba(255,71,87,0.3);border-radius:8px;padding:10px 12px;font-size:12px;color:#ff4757;margin-bottom:14px}</style>
  </head><body><div class="card"><div class="brand"><div class="dot"></div><div><div class="name">DEWCLAW LAND</div><div class="sub">Sales Intelligence</div></div></div>
  ${err ? `<div class="err">${err}</div>` : ""}
  <form method="POST" action="/auth/login"><label>Password</label><input type="password" name="password" placeholder="Enter password" autofocus required/><button type="submit">Sign in →</button></form>
  </div></body></html>`;
}
