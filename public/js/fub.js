const FUB = (() => {

  // ── Fetch everything in one call ────────────────────────────────────────────
  async function fetchDashboard(apiKey, onProgress) {
    onProgress && onProgress("Fetching all FUB data...");
    const resp = await fetch("/api/fub/dashboard", {
      headers: { "x-fub-key": apiKey },
    });
    const body = await resp.json().catch(() => { throw new Error("Bad response " + resp.status); });
    if (!resp.ok) throw new Error(body.error || "Fetch error " + resp.status);
    onProgress && onProgress(body.meta.totalPeople.toLocaleString() + " contacts loaded");
    return body;
  }

  // ── Motivation level ────────────────────────────────────────────────────────
  function motLevel(p) {
    const stage = (p.stage || "").trim();
    if (CONFIG.MOTIVATION[stage]) return CONFIG.MOTIVATION[stage];
    const s = stage.toLowerCase();
    if (s.includes("hot") || s.includes("contract") || s.includes("booked") || s.includes("negotiat")) return "hot";
    if (s.includes("warm") || s.includes("value add") || s.includes("range offer")) return "warm";
    if (s.includes("ltfu") || s.includes("not ready") || s.includes("archive") || s.includes("rejected") || s.includes("no response")) return "nurture";
    return "cold";
  }

  // ── Collection for a stage ──────────────────────────────────────────────────
  function getCollection(stage) {
    const s = (stage || "").trim().toLowerCase();
    for (const [, col] of Object.entries(CONFIG.COLLECTIONS)) {
      if (col.stages.some(cs => cs.toLowerCase() === s)) return col.label;
    }
    return "Other";
  }

  // ── Recent leads ────────────────────────────────────────────────────────────
  function recentLeads(people, days) {
    const cutoff = Date.now() - days * 86400000;
    return people.filter(p => new Date(p.created).getTime() > cutoff);
  }

  // ── First call map ──────────────────────────────────────────────────────────
  function buildFirstCallMap(calls) {
    const map = {};
    calls.forEach(c => {
      const pid = c.personId || c.person_id;
      if (!pid) return;
      const t = new Date(c.created || c.createdAt || c.created_at).getTime();
      if (!isNaN(t) && (!map[pid] || t < map[pid])) map[pid] = t;
    });
    return map;
  }

  // ── Speed to dial ───────────────────────────────────────────────────────────
  function speedToDialStats(leads, firstCallMap) {
    let times = [], under5 = 0, under60 = 0, notCalled = 0;
    leads.forEach(p => {
      const fc = firstCallMap[p.id];
      if (!fc) { notCalled++; return; }
      const mins = Math.round((fc - new Date(p.created).getTime()) / 60000);
      if (mins < 0) return;
      times.push(mins);
      if (mins <= CONFIG.SPEED_EXCELLENT) under5++;
      if (mins <= CONFIG.SPEED_GOOD) under60++;
    });
    return {
      avg: times.length ? Math.round(times.reduce((a,b)=>a+b,0)/times.length) : null,
      under5, under60, notCalled,
    };
  }

  // ── Motivation breakdown ────────────────────────────────────────────────────
  function motivationBreakdown(people) {
    const counts = { hot:0, warm:0, nurture:0, cold:0 };
    people.forEach(p => counts[motLevel(p)]++);
    return counts;
  }

  // ── Collection breakdown ────────────────────────────────────────────────────
  function collectionBreakdown(people) {
    const counts = {};
    Object.values(CONFIG.COLLECTIONS).forEach(c => counts[c.label] = 0);
    counts["Other"] = 0;
    people.forEach(p => {
      const col = getCollection(p.stage);
      counts[col] = (counts[col] || 0) + 1;
    });
    return counts;
  }

  // ── Stage breakdown (top 15) ────────────────────────────────────────────────
  function stageBreakdown(people) {
    const counts = {};
    people.forEach(p => {
      const s = p.stage || "No stage";
      counts[s] = (counts[s] || 0) + 1;
    });
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,15);
  }

  // ── Source breakdown ────────────────────────────────────────────────────────
  function sourceBreakdown(people) {
    const counts = {};
    people.forEach(p => {
      const s = p.source || "Unknown";
      counts[s] = (counts[s] || 0) + 1;
    });
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10);
  }

  // ── Agent performance ───────────────────────────────────────────────────────
  function agentPerformance(calls, appointments, notes, users, people, firstCallMap, days) {
    const cutoff = Date.now() - days * 86400000;
    const agentMap = {};

    // Index users by id and name
    const userById = {};
    users.forEach(u => { userById[u.id] = u.name || u.email || "Agent " + u.id; });

    // Helper to get agent name
    function agentName(id) {
      return userById[id] || (id ? "Agent " + id : "Unknown");
    }

    // Calls per agent
    calls.filter(c => new Date(c.created||c.createdAt||c.created_at).getTime() > cutoff)
      .forEach(c => {
        const aid = c.userId || c.user_id || c.assignedUserId;
        const name = agentName(aid);
        if (!agentMap[name]) agentMap[name] = { name, calls:0, connects:0, appts:0, notes:0, totalCallMins:0, avgSpeed:null, speeds:[] };
        agentMap[name].calls++;
        if ((c.outcome||"").toLowerCase().includes("connect") || (c.disposition||"").toLowerCase().includes("connect")) {
          agentMap[name].connects++;
        }
        const dur = Number(c.duration || c.durationSeconds || 0);
        agentMap[name].totalCallMins += Math.round(dur / 60);
      });

    // Appointments per agent
    appointments.filter(a => new Date(a.created||a.createdAt).getTime() > cutoff)
      .forEach(a => {
        const aid = a.userId || a.user_id || a.assignedUserId;
        const name = agentName(aid);
        if (!agentMap[name]) agentMap[name] = { name, calls:0, connects:0, appts:0, notes:0, totalCallMins:0, speeds:[] };
        agentMap[name].appts++;
      });

    // Notes per agent (includes AI summaries)
    notes.filter(n => new Date(n.created||n.createdAt).getTime() > cutoff)
      .forEach(n => {
        const aid = n.userId || n.user_id;
        const name = agentName(aid);
        if (!agentMap[name]) agentMap[name] = { name, calls:0, connects:0, appts:0, notes:0, totalCallMins:0, speeds:[] };
        agentMap[name].notes++;
      });

    // Speed to dial per agent — for leads they were assigned
    const agentLeads = {};
    people.filter(p => new Date(p.created).getTime() > cutoff).forEach(p => {
      const aid = p.assignedUserId || p.ownerId || p.userId;
      const name = agentName(aid);
      if (!agentLeads[name]) agentLeads[name] = [];
      agentLeads[name].push(p);
    });

    Object.entries(agentLeads).forEach(([name, leads]) => {
      if (!agentMap[name]) agentMap[name] = { name, calls:0, connects:0, appts:0, notes:0, totalCallMins:0, speeds:[] };
      leads.forEach(p => {
        const fc = firstCallMap[p.id];
        if (!fc) return;
        const mins = Math.round((fc - new Date(p.created).getTime()) / 60000);
        if (mins >= 0) agentMap[name].speeds.push(mins);
      });
      if (agentMap[name].speeds.length) {
        agentMap[name].avgSpeed = Math.round(agentMap[name].speeds.reduce((a,b)=>a+b,0) / agentMap[name].speeds.length);
      }
    });

    return Object.values(agentMap)
      .filter(a => a.calls > 0 || a.appts > 0)
      .sort((a,b) => b.calls - a.calls);
  }

  // ── Parse concerns from notes + stage ──────────────────────────────────────
  function parseConcerns(people, notes) {
    const counts = {};
    Object.keys(CONFIG.CONCERNS).forEach(k => counts[k] = 0);

    // Index notes by personId
    const notesByPerson = {};
    notes.forEach(n => {
      const pid = n.personId || n.person_id;
      if (!pid) return;
      if (!notesByPerson[pid]) notesByPerson[pid] = [];
      notesByPerson[pid].push(n.body || n.note || n.content || "");
    });

    people.forEach(p => {
      const personNotes = (notesByPerson[p.id] || []).join(" ");
      const text = [p.lastNote||"", personNotes, (p.tags||[]).join(" "), p.stage||""].join(" ").toLowerCase();
      Object.entries(CONFIG.CONCERNS).forEach(([cat, kws]) => {
        if (kws.some(kw => text.includes(kw.toLowerCase()))) counts[cat]++;
      });
    });

    return counts;
  }

  // ── Extract AI call summary insights ───────────────────────────────────────
  function extractCallInsights(notes) {
    const summaries = notes.filter(n => {
      const body = (n.body || n.note || n.content || "").toLowerCase();
      const type = (n.type || "").toLowerCase();
      return type.includes("call") || body.includes("summary") || body.includes("suggested task") || body.includes("the lead") || body.includes("the agent");
    });

    const keyThemes = {};
    const pricePoints = [];
    const actionItems = [];

    summaries.forEach(n => {
      const text = n.body || n.note || n.content || "";

      // Extract price mentions (e.g. $16,000 per acre)
      const prices = text.match(/\$[\d,]+(?:\s+per\s+\w+)?/gi) || [];
      pricePoints.push(...prices);

      // Extract suggested tasks / action items
      const taskMatch = text.match(/suggested tasks?[\s\S]*?(?=\n\n|\z)/gi) || [];
      taskMatch.forEach(t => actionItems.push(t.slice(0,200)));

      // Theme keywords
      const lower = text.toLowerCase();
      ["price","timing","financing","offer","appointment","follow up","not interested","thinking","callback"].forEach(theme => {
        if (lower.includes(theme)) keyThemes[theme] = (keyThemes[theme]||0) + 1;
      });
    });

    return {
      totalSummaries: summaries.length,
      topThemes: Object.entries(keyThemes).sort((a,b)=>b[1]-a[1]).slice(0,6),
      pricePoints: [...new Set(pricePoints)].slice(0,10),
      recentActionItems: actionItems.slice(0,5),
    };
  }

  // ── Call volume by day ──────────────────────────────────────────────────────
  function callVolumeByDay(calls, days) {
    const now = Date.now();
    const labels = [], counts = [];
    for (let i = days-1; i >= 0; i--) {
      const d = new Date(now - i*86400000);
      labels.push(d.toLocaleDateString("en-US",{weekday:"short"}));
      const ds = new Date(d.toDateString()).getTime();
      counts.push(calls.filter(c => {
        const t = new Date(c.created||c.createdAt||c.created_at).getTime();
        return t>=ds && t<ds+86400000;
      }).length);
    }
    return { labels, counts };
  }

  // ── Speed label ─────────────────────────────────────────────────────────────
  function speedLabel(mins) {
    if (mins===null||mins===undefined) return { text:"No call yet", cls:"speed-slow" };
    if (mins<0) return { text:"—", cls:"speed-slow" };
    if (mins<=CONFIG.SPEED_EXCELLENT) return { text:mins+"m", cls:"speed-fast" };
    if (mins<=CONFIG.SPEED_GOOD) return { text:mins+"m", cls:"speed-med" };
    const h=Math.floor(mins/60), m=mins%60;
    return { text:h+"h"+(m?" "+m+"m":""), cls:"speed-slow" };
  }

  function fmtMins(mins) {
    if (!mins && mins!==0) return "—";
    if (mins < 60) return mins+"m";
    return Math.floor(mins/60)+"h "+(mins%60)+"m";
  }

  return {
    fetchDashboard, motLevel, getCollection, recentLeads,
    buildFirstCallMap, speedToDialStats, motivationBreakdown,
    collectionBreakdown, stageBreakdown, sourceBreakdown,
    agentPerformance, parseConcerns, extractCallInsights,
    callVolumeByDay, speedLabel, fmtMins,
  };
})();
