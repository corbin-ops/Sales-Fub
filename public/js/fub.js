const FUB = (() => {

  async function fetchDashboard(onProgress) {
    onProgress && onProgress("Loading from cache...");
    const resp = await fetch("/api/fub/dashboard");
    const body = await resp.json().catch(() => { throw new Error("Bad response"); });
    if (!resp.ok) throw new Error(body.error || "Fetch error");
    onProgress && onProgress((body.totalPeople || body.people.length).toLocaleString() + " contacts loaded");
    return body;
  }

  function motLevel(p) {
    const stage = (p.stage || "").trim();
    if (CONFIG.MOTIVATION[stage]) return CONFIG.MOTIVATION[stage];
    const s = stage.toLowerCase();
    if (s.includes("hot") || s.includes("contract") || s.includes("booked") || s.includes("negotiat") || s.includes("motivated")) return "hot";
    if (s.includes("warm") || s.includes("value add") || s.includes("range offer")) return "warm";
    if (s.includes("ltfu") || s.includes("not ready") || s.includes("archive") || s.includes("rejected") || s.includes("no response")) return "nurture";
    return "cold";
  }

  function getCollection(stage) {
    const s = (stage || "").trim().toLowerCase();
    for (const [, col] of Object.entries(CONFIG.COLLECTIONS)) {
      if (col.stages.some(cs => cs.toLowerCase() === s)) return col.label;
    }
    return null; // null = not in any active collection
  }

  function isActiveStage(stage) {
    if (!stage) return false;
    if (CONFIG.EXCLUDE_STAGES.includes(stage)) return false;
    return true;
  }

  function recentLeads(people, days) {
    const cutoff = Date.now() - days * 86400000;
    return people.filter(p => new Date(p.created).getTime() > cutoff);
  }

  // ── Speed to dial — only for leads with calls within reasonable timeframe ───
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

  function speedToDialStats(leads, firstCallMap) {
    let times = [], under5 = 0, under60 = 0, notCalled = 0;
    leads.forEach(p => {
      const fc = firstCallMap[p.id];
      const leadCreated = new Date(p.created).getTime();
      if (!fc) { notCalled++; return; }
      const mins = Math.round((fc - leadCreated) / 60000);
      // Only count: positive time, and call happened within 7 days of lead creation
      if (mins < 0 || mins > 10080) return;
      times.push(mins);
      if (mins <= CONFIG.SPEED_EXCELLENT) under5++;
      if (mins <= 60) under60++;
    });
    return {
      avg: times.length ? Math.round(times.reduce((a,b)=>a+b,0)/times.length) : null,
      under5, under60, notCalled,
      totalWithCall: times.length,
    };
  }

  function fmtMins(mins) {
    if (mins === null || mins === undefined) return "—";
    if (mins < 60) return mins + "m";
    const h = Math.floor(mins/60), m = mins%60;
    return m > 0 ? h + "h " + m + "m" : h + "h";
  }

  function talkTimeStats(calls) {
    const totalSecs = calls.reduce((s,c) => s + Number(c.duration||c.durationSeconds||0), 0);
    return { totalMins: Math.round(totalSecs/60), totalSecs };
  }

  function motivationBreakdown(people) {
    const counts = { hot:0, warm:0, nurture:0, cold:0 };
    people.forEach(p => counts[motLevel(p)]++);
    return counts;
  }

  // ── Collection breakdown — excludes bulk "Lead" stage ──────────────────────
  function collectionBreakdown(people) {
    const counts = {};
    Object.values(CONFIG.COLLECTIONS).forEach(c => counts[c.label] = 0);
    let activeTotal = 0;

    people.forEach(p => {
      if (!isActiveStage(p.stage)) return; // skip "Lead", "New Lead", blank
      const col = getCollection(p.stage);
      if (col) {
        counts[col] = (counts[col] || 0) + 1;
        activeTotal++;
      }
    });

    return { counts, activeTotal };
  }

  // ── Stage breakdown — excludes bulk imported stages ─────────────────────────
  function stageBreakdown(people) {
    const counts = {};
    people.forEach(p => {
      const s = p.stage || "No stage";
      if (!isActiveStage(s)) return; // skip "Lead", "New Lead", blank
      counts[s] = (counts[s] || 0) + 1;
    });
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,15);
  }

  // Stage breakdown including ALL stages (for overview numbers)
  function stageBreakdownAll(people) {
    const counts = {};
    people.forEach(p => {
      const s = p.stage || "No stage";
      counts[s] = (counts[s] || 0) + 1;
    });
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,15);
  }

  function sourceBreakdown(people) {
    const counts = {};
    people.forEach(p => {
      const s = p.source || "Unknown";
      counts[s] = (counts[s] || 0) + 1;
    });
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10);
  }

  // ── Agent performance with team roles ──────────────────────────────────────
  function agentPerformance(calls, appointments, notes, users, people, firstCallMap, days) {
    const cutoff = days < 9999 ? Date.now() - days * 86400000 : 0;
    const agentMap = {};
    const userById = {};
    users.forEach(u => { userById[u.id] = u.name || u.email || "Agent " + u.id; });

    function getAgent(id) {
      const name = userById[id] || (id ? "Agent " + id : "Unknown");
      if (!agentMap[name]) {
        // Find role from config
        const roleConfig = Object.entries(CONFIG.TEAM || {}).find(([k]) => name.toLowerCase().includes(k.toLowerCase()));
        agentMap[name] = {
          name, role: roleConfig ? roleConfig[1].role : "Agent",
          calls:0, connects:0, appts:0, notes:0, totalCallSecs:0, speeds:[],
        };
      }
      return agentMap[name];
    }

    calls.filter(c => new Date(c.created||c.createdAt||c.created_at).getTime() > cutoff).forEach(c => {
      const a = getAgent(c.userId || c.user_id);
      a.calls++;
      const dur = Number(c.duration||c.durationSeconds||0);
      if (dur > 30) a.connects++;
      a.totalCallSecs += dur;
    });

    appointments.filter(a => new Date(a.created||a.createdAt).getTime() > cutoff).forEach(a => {
      getAgent(a.userId||a.user_id||a.assignedUserId).appts++;
    });

    notes.filter(n => new Date(n.created||n.createdAt).getTime() > cutoff).forEach(n => {
      getAgent(n.userId||n.user_id).notes++;
    });

    people.filter(p => new Date(p.created).getTime() > cutoff).forEach(p => {
      const aid = p.assignedUserId || p.ownerId || p.userId;
      const a = getAgent(aid);
      const fc = firstCallMap[p.id];
      if (fc) {
        const mins = Math.round((fc - new Date(p.created).getTime()) / 60000);
        if (mins >= 0 && mins < 10080) a.speeds.push(mins);
      }
    });

    return Object.values(agentMap)
      .filter(a => a.calls > 0 || a.appts > 0)
      .map(a => ({
        ...a,
        avgSpeed: a.speeds.length ? Math.round(a.speeds.reduce((x,y)=>x+y,0)/a.speeds.length) : null,
        totalCallMins: Math.round(a.totalCallSecs/60),
      }))
      .sort((a,b) => b.calls - a.calls);
  }

  function parseConcerns(people, notes) {
    const counts = {};
    Object.keys(CONFIG.CONCERNS).forEach(k => counts[k] = 0);
    const notesByPerson = {};
    notes.forEach(n => {
      const pid = n.personId || n.person_id;
      if (!pid) return;
      if (!notesByPerson[pid]) notesByPerson[pid] = [];
      notesByPerson[pid].push(n.body || n.note || n.content || "");
    });
    people.forEach(p => {
      const text = [(p.lastNote||""), (notesByPerson[p.id]||[]).join(" "), (p.tags||[]).join(" "), p.stage||""].join(" ").toLowerCase();
      Object.entries(CONFIG.CONCERNS).forEach(([cat,kws]) => {
        if (kws.some(kw => text.includes(kw.toLowerCase()))) counts[cat]++;
      });
    });
    return counts;
  }

  function extractCallInsights(notes) {
    const summaries = notes.filter(n => {
      const body = (n.body||n.note||n.content||"").toLowerCase();
      return (n.type||"").toLowerCase().includes("call") || body.includes("summary") || body.includes("suggested task") || body.includes("the lead");
    });
    const keyThemes = {}, pricePoints = [];
    summaries.forEach(n => {
      const text = n.body||n.note||n.content||"";
      (text.match(/\$[\d,]+(?:\s+per\s+\w+)?/gi)||[]).forEach(p => pricePoints.push(p));
      const lower = text.toLowerCase();
      ["price","timing","financing","offer","appointment","follow up","not interested","callback"].forEach(theme => {
        if (lower.includes(theme)) keyThemes[theme] = (keyThemes[theme]||0)+1;
      });
    });
    return {
      totalSummaries: summaries.length,
      topThemes: Object.entries(keyThemes).sort((a,b)=>b[1]-a[1]).slice(0,6),
      pricePoints: [...new Set(pricePoints)].slice(0,10),
    };
  }

  function callVolumeByDay(calls, days) {
    const now = Date.now(), labels = [], counts = [];
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

  function speedLabel(mins) {
    if (mins===null||mins===undefined) return { text:"No call yet", cls:"spd-slow" };
    if (mins<0) return { text:"—", cls:"spd-slow" };
    if (mins<=CONFIG.SPEED_EXCELLENT) return { text:fmtMins(mins), cls:"spd-fast" };
    if (mins<=CONFIG.SPEED_GOOD) return { text:fmtMins(mins), cls:"spd-med" };
    return { text:fmtMins(mins), cls:"spd-slow" };
  }

  return {
    fetchDashboard, motLevel, getCollection, isActiveStage, recentLeads,
    buildFirstCallMap, speedToDialStats, motivationBreakdown,
    collectionBreakdown, stageBreakdown, stageBreakdownAll, sourceBreakdown,
    agentPerformance, parseConcerns, extractCallInsights,
    callVolumeByDay, speedLabel, fmtMins, talkTimeStats,
  };
})();
