const FUB = (() => {

  async function request(apiKey, path) {
    const url = CONFIG.PROXY_URL + "?path=" + encodeURIComponent(path);
    const resp = await fetch(url, {
      headers: { "x-fub-key": apiKey, "Content-Type": "application/json" },
    });
    const body = await resp.json().catch(() => {
      throw new Error("Bad response from server (status " + resp.status + ")");
    });
    if (!resp.ok) throw new Error(body.error || body.errorMessage || "FUB error " + resp.status);
    return body;
  }

  async function fetchAll(apiKey) {
    const [pd, ed] = await Promise.all([
      request(apiKey, "people?limit=100&sort=-created"),
      request(apiKey, "events?limit=200&sort=-created"),
    ]);
    return {
      people: pd.people || (pd._embedded && pd._embedded.people) || [],
      events: ed.events || (ed._embedded && ed._embedded.events) || [],
    };
  }

  function getCallEvents(events) {
    return events.filter(e => {
      const t = (e.type || "").toLowerCase();
      return t === "call" || t.includes("call") || t.includes("phone") || t.includes("outbound");
    });
  }

  function buildFirstCallMap(callEvents) {
    const map = {};
    callEvents.forEach(e => {
      const pid = e.personId || e.person_id;
      if (!pid) return;
      const t = new Date(e.created || e.createdAt || e.created_at).getTime();
      if (!isNaN(t) && (!map[pid] || t < map[pid])) map[pid] = t;
    });
    return map;
  }

  function recentLeads(people, days) {
    const cutoff = Date.now() - days * 86400000;
    return people.filter(p => new Date(p.created).getTime() > cutoff);
  }

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
      avg: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
      under5, under60, notCalled,
    };
  }

  function _motLevel(p) {
    const tags = ((p.tags || []).join(" ")).toLowerCase();
    const stage = (p.stage || "").toLowerCase();
    const score = Number(p.leadScore || 0);
    if (score >= CONFIG.HOT_SCORE || tags.includes("hot") || stage.includes("contract") || stage.includes("active buyer")) return "hot";
    if (score >= CONFIG.WARM_SCORE || tags.includes("warm") || stage.includes("appt") || stage.includes("showing") || stage.includes("met")) return "warm";
    if (tags.includes("nurture") || stage.includes("nurture") || stage.includes("long term")) return "nurture";
    return "cold";
  }

  function motivationBreakdown(people) {
    const counts = { hot: 0, warm: 0, nurture: 0, cold: 0 };
    people.forEach(p => counts[_motLevel(p)]++);
    return counts;
  }

  function appointmentCount(people) {
    return people.filter(p => {
      const s = (p.stage || "").toLowerCase();
      return s.includes("appt") || s.includes("appointment") || s.includes("consult") || s.includes("showing");
    }).length;
  }

  function parseConcerns(people) {
    const cats = {
      "Not ready / timing":    ["not ready","timing","not sure when","future","eventually","someday"],
      "Price / budget":        ["price","afford","budget","expensive","too much","cost"],
      "Still renting / lease": ["rent","lease","landlord","renting"],
      "Needs to sell first":   ["sell first","selling","current home","list my","my house"],
      "Just browsing":         ["just looking","browsing","just checking","not serious","curious"],
      "Has another agent":     ["other agent","already have","working with","my agent","my realtor"],
      "Credit / financing":    ["credit","financing","pre-approval","loan","mortgage","qualify"],
      "Market concerns":       ["market","prices dropping","interest rate","wait to buy"],
    };
    const counts = {};
    Object.keys(cats).forEach(k => counts[k] = 0);
    people.forEach(p => {
      const text = [(p.lastNote||""),(p.notes||""),(p.tags||[]).join(" ")].join(" ").toLowerCase();
      Object.entries(cats).forEach(([cat, kws]) => {
        if (kws.some(kw => text.includes(kw))) counts[cat]++;
      });
    });
    return counts;
  }

  function callVolumeByDay(callEvents, days) {
    const now = Date.now();
    const labels = [], counts = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      labels.push(d.toLocaleDateString("en-US", { weekday: "short" }));
      const ds = new Date(d.toDateString()).getTime();
      counts.push(callEvents.filter(e => {
        const t = new Date(e.created || e.createdAt || e.created_at).getTime();
        return t >= ds && t < ds + 86400000;
      }).length);
    }
    return { labels, counts };
  }

  function speedLabel(mins) {
    if (mins === null || mins === undefined) return { text: "No call yet", cls: "speed-slow" };
    if (mins < 0) return { text: "—", cls: "speed-slow" };
    if (mins <= CONFIG.SPEED_EXCELLENT) return { text: mins + "m", cls: "speed-fast" };
    if (mins <= CONFIG.SPEED_GOOD) return { text: mins + "m", cls: "speed-med" };
    const h = Math.floor(mins / 60), m = mins % 60;
    return { text: h + "h" + (m ? " " + m + "m" : ""), cls: "speed-slow" };
  }

  return { fetchAll, getCallEvents, buildFirstCallMap, recentLeads, speedToDialStats, motivationBreakdown, appointmentCount, parseConcerns, callVolumeByDay, speedLabel, _motLevel };
})();
