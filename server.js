const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.DASHBOARD_PASSWORD || "AIDewClawReady%";

app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "10mb" }));

// ── In-memory cache ───────────────────────────────────────────────────────────
// Survives for the lifetime of the server process.
// On Render free tier the server stays alive as long as there's traffic.
const CACHE = {
  people:       [],
  calls:        [],
  notes:        [],
  appointments: [],
  users:        [],
  totalPeople:  0,
  stageCounts:  {},
  lastFullSync: null,   // ISO string of last full sync
  lastIncrSync: null,   // ISO string of last incremental sync
  syncing:      false,
};

function isAuthed(req) {
  return (req.headers.cookie || "").split(";").map(c => c.trim()).includes("fub_auth=1");
}

app.use((req, res, next) => {
  const pub = ["/login","/auth/login","/auth/logout"];
  if (pub.includes(req.path) || req.path.startsWith("/css/") || req.path.startsWith("/js/")) return next();
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

// ── FUB fetch ─────────────────────────────────────────────────────────────────
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
      console.log(`[FUB] 429 — waiting ${wait}ms`);
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

// ── Paginator with optional since= date filter ────────────────────────────────
async function fetchAllPages(apiKey, endpoint, dataKey, sysName, sysKey, since = null) {
  const LIMIT = 100;
  let all = [], page = 0;
  let baseUrl = endpoint;
  if (since) {
    const sep = baseUrl.includes("?") ? "&" : "?";
    baseUrl += `${sep}since=${encodeURIComponent(since)}`;
  }
  let currentUrl = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}limit=${LIMIT}`;
  console.log(`[FUB] Fetching: ${baseUrl}`);

  while (currentUrl) {
    page++;
    const data = await fubFetch(apiKey, currentUrl, sysName, sysKey);
    const records = data[dataKey] || (data._embedded && data._embedded[dataKey]) || [];
    all = all.concat(records);
    const meta = data._metadata || {};
    const total = meta.total || 0;
    const nextLink = meta.nextLink || null;
    console.log(`[FUB] Page ${page}: +${records.length} = ${all.length}${total ? "/" + total : ""}`);
    if (nextLink && records.length === LIMIT && all.length < total) {
      currentUrl = nextLink;
    } else {
      currentUrl = null;
    }
    if (currentUrl) await new Promise(r => setTimeout(r, 150));
  }
  console.log(`[FUB] Done: ${all.length} ${dataKey}`);
  return all;
}

// Merge new records into cache — deduplicates by id
function mergeIntoCache(existing, incoming) {
  if (!incoming.length) return existing;
  const existingIds = new Set(existing.map(r => r.id));
  const newRecords = incoming.filter(r => !existingIds.has(r.id));
  // Also update any existing records that may have changed
  const updatedMap = {};
  incoming.forEach(r => updatedMap[r.id] = r);
  const updated = existing.map(r => updatedMap[r.id] || r);
  const merged = [...updated, ...newRecords.filter(r => !existingIds.has(r.id))];
  console.log(`[CACHE] Merged ${incoming.length} incoming → ${newRecords.length} new, ${updated.length} updated. Total: ${merged.length}`);
  return merged;
}

// ── FULL SYNC — runs once, fetches everything ─────────────────────────────────
async function fullSync(apiKey, sysName, sysKey) {
  console.log("[SYNC] Starting FULL sync...");
  CACHE.syncing = true;

  const people      = await fetchAllPages(apiKey, "people?sort=-created",       "people",       sysName, sysKey);
  const calls       = await fetchAllPages(apiKey, "calls?sort=-created",        "calls",        sysName, sysKey);
  const notes       = await fetchAllPages(apiKey, "notes?sort=-created",        "notes",        sysName, sysKey);
  const appointments= await fetchAllPages(apiKey, "appointments?sort=-created", "appointments", sysName, sysKey);
  const users       = await fetchAllPages(apiKey, "users",                      "users",        sysName, sysKey);

  // Stage counts
  const peopleMeta = await fubFetch(apiKey, "people?limit=1", sysName, sysKey);
  const totalPeople = (peopleMeta._metadata && peopleMeta._metadata.total) || people.length;

  CACHE.people       = people;
  CACHE.calls        = calls;
  CACHE.notes        = notes;
  CACHE.appointments = appointments;
  CACHE.users        = users;
  CACHE.totalPeople  = totalPeople;
  CACHE.lastFullSync = new Date().toISOString();
  CACHE.lastIncrSync = new Date().toISOString();
  CACHE.syncing      = false;

  console.log(`[SYNC] Full sync complete — people:${people.length} calls:${calls.length} notes:${notes.length} appts:${appointments.length}`);
}

// ── INCREMENTAL SYNC — fetches only records created since last sync ────────────
async function incrementalSync(apiKey, sysName, sysKey) {
  if (!CACHE.lastIncrSync) return; // no cache yet, skip
  console.log(`[SYNC] Incremental sync since ${CACHE.lastIncrSync}`);
  CACHE.syncing = true;

  const since = CACHE.lastIncrSync;

  const [newPeople, newCalls, newNotes, newAppts] = await Promise.all([
    fetchAllPages(apiKey, "people?sort=-created",       "people",       sysName, sysKey, since),
    fetchAllPages(apiKey, "calls?sort=-created",        "calls",        sysName, sysKey, since),
    fetchAllPages(apiKey, "notes?sort=-created",        "notes",        sysName, sysKey, since),
    fetchAllPages(apiKey, "appointments?sort=-created", "appointments", sysName, sysKey, since),
  ]);

  CACHE.people       = mergeIntoCache(CACHE.people,       newPeople);
  CACHE.calls        = mergeIntoCache(CACHE.calls,        newCalls);
  CACHE.notes        = mergeIntoCache(CACHE.notes,        newNotes);
  CACHE.appointments = mergeIntoCache(CACHE.appointments, newAppts);
  CACHE.lastIncrSync = new Date().toISOString();
  CACHE.syncing      = false;

  // Update total from metadata
  const peopleMeta = await fubFetch(apiKey, "people?limit=1", sysName, sysKey);
  CACHE.totalPeople = (peopleMeta._metadata && peopleMeta._metadata.total) || CACHE.people.length;

  console.log(`[SYNC] Incremental complete — cache now: people:${CACHE.people.length} calls:${CACHE.calls.length}`);
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

// ── Cache status endpoint ─────────────────────────────────────────────────────
app.get("/api/cache/status", (req, res) => {
  res.json({
    hasCache:     CACHE.lastFullSync !== null,
    syncing:      CACHE.syncing,
    lastFullSync: CACHE.lastFullSync,
    lastIncrSync: CACHE.lastIncrSync,
    counts: {
      people:       CACHE.people.length,
      calls:        CACHE.calls.length,
      notes:        CACHE.notes.length,
      appointments: CACHE.appointments.length,
      users:        CACHE.users.length,
      totalPeople:  CACHE.totalPeople,
    },
  });
});

// ── Trigger full sync (runs in background) ────────────────────────────────────
app.post("/api/cache/full-sync", async (req, res) => {
  if (!needKey(req, res)) return;
  const { apiKey, sysName, sysKey } = creds(req);
  if (CACHE.syncing) return res.json({ message: "Sync already in progress" });
  // Start sync in background — respond immediately
  res.json({ message: "Full sync started in background. Check /api/cache/status for progress." });
  fullSync(apiKey, sysName, sysKey).catch(e => {
    CACHE.syncing = false;
    console.error("[SYNC] Full sync error:", e.message);
  });
});

// ── Trigger incremental sync ──────────────────────────────────────────────────
app.post("/api/cache/incr-sync", async (req, res) => {
  if (!needKey(req, res)) return;
  const { apiKey, sysName, sysKey } = creds(req);
  if (CACHE.syncing) return res.json({ message: "Sync already in progress" });
  if (!CACHE.lastFullSync) return res.status(400).json({ error: "Run a full sync first" });
  res.json({ message: "Incremental sync started." });
  incrementalSync(apiKey, sysName, sysKey).catch(e => {
    CACHE.syncing = false;
    console.error("[SYNC] Incremental sync error:", e.message);
  });
});

// ── Dashboard — serves from cache instantly ───────────────────────────────────
app.get("/api/fub/dashboard", async (req, res) => {
  if (!needKey(req, res)) return;
  const { apiKey, sysName, sysKey } = creds(req);

  // No cache yet — do a fast initial load (recent 30 days) then trigger full sync
  if (!CACHE.lastFullSync) {
    if (CACHE.syncing) {
      return res.json({
        people: [], calls: [], notes: [], appointments: [], users: [], texts: [],
        stageCounts: {}, totalPeople: 0,
        meta: { syncing: true, message: "Full sync in progress — check back in a few minutes", totalPeople: 0, fetchedAt: new Date().toISOString() }
      });
    }

    // Quick load: since Jan 1 2026 only for instant response
    console.log("[DASH] No cache — doing quick 30-day load then triggering full sync...");
    const sinceJan = new Date("2026-01-01").toISOString();

    const [people, calls, notes, appointments, users] = await Promise.all([
      fetchAllPages(apiKey, "people?sort=-created", "people", sysName, sysKey, sinceJan),
      fetchAllPages(apiKey, "calls?sort=-created",  "calls",  sysName, sysKey, sinceJan),
      fetchAllPages(apiKey, "notes?sort=-created",  "notes",  sysName, sysKey, sinceJan),
      fetchAllPages(apiKey, "appointments?sort=-created", "appointments", sysName, sysKey),
      fetchAllPages(apiKey, "users", "users", sysName, sysKey),
    ]);

    const peopleMeta = await fubFetch(apiKey, "people?limit=1", sysName, sysKey);
    const totalPeople = (peopleMeta._metadata && peopleMeta._metadata.total) || people.length;

    // Store partial cache
    CACHE.people = people;
    CACHE.calls  = calls;
    CACHE.notes  = notes;
    CACHE.appointments = appointments;
    CACHE.users  = users;
    CACHE.totalPeople = totalPeople;
    CACHE.lastIncrSync = sinceJan;

    // Trigger full sync in background
    setTimeout(() => {
      fullSync(apiKey, sysName, sysKey).catch(e => {
        CACHE.syncing = false;
        console.error("[SYNC] Background full sync error:", e.message);
      });
    }, 2000);

    return res.json({
      people, calls, notes, appointments, users, texts: [],
      stageCounts: {}, totalPeople,
      meta: {
        totalPeople, totalCalls: calls.length, totalNotes: notes.length,
        totalAppointments: appointments.length, totalUsers: users.length, totalTexts: 0,
        fetchedAt: new Date().toISOString(),
        note: `Showing since Jan 1 2026. Full sync running in background — refresh in ~5 min for complete data.`,
        fullSyncPending: true,
      },
    });
  }

  // Cache exists — serve instantly from memory
  console.log(`[DASH] Serving from cache — people:${CACHE.people.length} calls:${CACHE.calls.length}`);
  return res.json({
    people:       CACHE.people,
    calls:        CACHE.calls,
    notes:        CACHE.notes,
    appointments: CACHE.appointments,
    users:        CACHE.users,
    texts:        [],
    stageCounts:  CACHE.stageCounts,
    totalPeople:  CACHE.totalPeople,
    meta: {
      totalPeople:       CACHE.totalPeople,
      totalCalls:        CACHE.calls.length,
      totalNotes:        CACHE.notes.length,
      totalAppointments: CACHE.appointments.length,
      totalUsers:        CACHE.users.length,
      totalTexts:        0,
      fetchedAt:         CACHE.lastIncrSync,
      lastFullSync:      CACHE.lastFullSync,
      fromCache:         true,
      note:              `Data from cache. Last synced: ${new Date(CACHE.lastIncrSync).toLocaleTimeString()}`,
    },
  });
});

// ── Generic proxy ─────────────────────────────────────────────────────────────
app.get("/api/fub", async (req, res) => {
  if (!needKey(req, res)) return;
  const { apiKey, sysName, sysKey } = creds(req);
  const p = req.query.path;
  if (!p) return res.status(400).json({ error: "Missing ?path=" });
  try { return res.json(await fubFetch(apiKey, p, sysName, sysKey)); }
  catch (e) { return res.status(e.status || 500).json({ error: e.message }); }
});

// ── Claude AI proxy ───────────────────────────────────────────────────────────
app.post("/api/claude", async (req, res) => {
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in Render environment" });
  try {
    const { system, prompt, model, max_tokens } = req.body;
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: model || "claude-sonnet-4-20250514",
        max_tokens: max_tokens || 1200,
        system, messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json({ error: data.error?.message || "Claude error" });
    return res.json(data);
  } catch (e) { return res.status(500).json({ error: e.message }); }
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
