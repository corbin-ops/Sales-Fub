const Dashboard = (() => {
  let dashData = null, allLeads = [], firstCallMap = {};

  const NAV_TITLES = {
    speed:"Speed to dial", performance:"Performance", agents:"Agent performance",
    pipeline:"Pipeline", concerns:"Concerns & insights", leads:"Recent leads", ai:"AI coach"
  };

  function initNav() {
    document.querySelectorAll(".nav-item").forEach(item => {
      item.addEventListener("click", e => {
        e.preventDefault();
        const id = item.dataset.section;
        document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
        document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
        item.classList.add("active");
        document.getElementById(id)?.classList.add("active");
        const t = document.getElementById("pageTitle");
        if (t) t.textContent = NAV_TITLES[id] || "";
      });
    });
  }

  function setStatus(state, msg) {
    const dot = document.getElementById("dot");
    const stxt = document.getElementById("statusText");
    if (dot) dot.className = "dot"+(state==="live"?" live":state==="err"?" err":state==="loading"?" loading":"");
    if (stxt) stxt.textContent = msg;
  }

  function setMetric(id, value, cls) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value;
    if (cls) el.className = "metric-value "+cls;
  }

  function ph(id, msg) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<div class="placeholder">${msg}</div>`;
  }

  async function load() {
    const apiKey = document.getElementById("apiKey")?.value.trim();
    if (!apiKey) { alert("Please enter your Follow Up Boss API key."); return; }

    const btn = document.getElementById("connectBtn");
    const btnText = document.getElementById("btnText");
    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = "Loading...";
    setStatus("loading", "Fetching all data...");
    ph("leadsTable", "Loading all leads — please wait...");
    ph("agentTable", "Loading agent data...");

    try {
      const raw = await FUB.fetchDashboard(apiKey, msg => setStatus("loading", msg));
      const { people, calls, notes, appointments, users, meta } = raw;

      firstCallMap = FUB.buildFirstCallMap(calls);
      const recent = FUB.recentLeads(people, CONFIG.LOOKBACK_DAYS);
      allLeads = recent;

      // ── Speed to dial ──────────────────────────────────────────────────────
      const speed = FUB.speedToDialStats(recent, firstCallMap);
      const avgMins = speed.avg;
      setMetric("avgSpeed", avgMins!==null ? FUB.fmtMins(avgMins) : "N/A",
        avgMins===null?"":avgMins<=CONFIG.SPEED_EXCELLENT?"good":avgMins<=CONFIG.SPEED_GOOD?"warn":"bad");
      const bar = document.getElementById("avgSpeedBar");
      if (bar && avgMins!==null) bar.style.width = Math.min(100,Math.round(avgMins/180*100))+"%";
      setMetric("u5", speed.under5, "good");
      setMetric("u60", speed.under60);
      setMetric("notCalled", speed.notCalled, speed.notCalled===0?"good":speed.notCalled<=5?"warn":"bad");

      // ── Performance ────────────────────────────────────────────────────────
      const contacted = Object.keys(firstCallMap).length;
      const apptCount = appointments.filter(a => new Date(a.created||a.createdAt).getTime() > Date.now()-CONFIG.LOOKBACK_DAYS*86400000).length;
      setMetric("totalPeople", people.length.toLocaleString());
      setMetric("newLeads", recent.length.toLocaleString());
      setMetric("contacted", contacted.toLocaleString());
      setMetric("appts", apptCount.toLocaleString());
      setMetric("totalCalls", meta.totalCalls.toLocaleString());
      setMetric("totalTexts", meta.totalTexts.toLocaleString());
      setMetric("totalNotes", meta.totalNotes.toLocaleString());
      setMetric("cRate", recent.length ? Math.round(contacted/recent.length*100)+"%" : "—");
      setMetric("aRate", contacted ? Math.round(apptCount/contacted*100)+"%" : "—");

      // ── Motivation ─────────────────────────────────────────────────────────
      const mot = FUB.motivationBreakdown(people);
      renderMotivation(mot, people.length);

      // ── Pipeline / Collections ─────────────────────────────────────────────
      const collections = FUB.collectionBreakdown(people);
      renderCollections(collections);
      const stages = FUB.stageBreakdown(people);
      renderStages(stages);
      const sources = FUB.sourceBreakdown(people);
      renderSources(sources);

      // ── Concerns + AI summaries ────────────────────────────────────────────
      const concerns = FUB.parseConcerns(people, notes);
      renderConcerns(concerns);
      const callInsights = FUB.extractCallInsights(notes);
      renderCallInsights(callInsights);

      // ── Agent performance ──────────────────────────────────────────────────
      const agents = FUB.agentPerformance(calls, appointments, notes, users, people, firstCallMap, CONFIG.LOOKBACK_DAYS);
      renderAgentTable(agents);

      // ── Leads table ────────────────────────────────────────────────────────
      renderLeadsTable(recent);

      // ── Charts ─────────────────────────────────────────────────────────────
      const vol = FUB.callVolumeByDay(calls, 14);
      Charts.renderCallVolume(vol.labels, vol.counts);
      Charts.renderFunnel(recent.length, contacted, apptCount);
      Charts.renderMotivation(mot);
      Charts.renderCollections(collections);
      Charts.renderStages(stages.slice(0,10));

      // ── AI data bundle ─────────────────────────────────────────────────────
      dashData = {
        avgMins, under5: speed.under5, under60: speed.under60,
        notCalled: speed.notCalled, newLeads: recent.length,
        totalPeople: people.length, contacted, appts: apptCount,
        totalCalls: meta.totalCalls, totalTexts: meta.totalTexts,
        mot, concerns, callInsights,
        callCounts: vol.counts, labels: vol.labels,
        topStages: stages.slice(0,6),
        topSources: sources.slice(0,4),
        collections,
        topAgents: agents.slice(0,5),
      };

      const ts = new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
      document.getElementById("lastUpdated").textContent =
        "Updated "+ts+" · "+people.length.toLocaleString()+" contacts";
      setStatus("live", people.length.toLocaleString()+" contacts");
      if (btn) btn.disabled = false;
      if (btnText) btnText.textContent = "Refresh";

      AI.getInsights(dashData);

    } catch (err) {
      setStatus("err", err.message);
      if (btn) btn.disabled = false;
      if (btnText) btnText.textContent = "Connect";
      ph("leadsTable", "Error: "+err.message);
      console.error(err);
    }
  }

  // ── Renderers ───────────────────────────────────────────────────────────────

  function renderMotivation(mot, total) {
    const cfg = {
      hot:    ["Hot — motivated / booked / contract","hot"],
      warm:   ["Warm — engaged / value add / range offer","warm"],
      nurture:["Nurture — LTFU / not ready / price rejected","nurture"],
      cold:   ["Cold — unmotivated / dead / removed","cold"],
    };
    document.getElementById("motList").innerHTML = Object.entries(mot)
      .sort((a,b)=>b[1]-a[1])
      .map(([k,v])=>`
        <div class="mot-row">
          <span class="mot-label">${cfg[k][0]}</span>
          <span class="mot-count">${v.toLocaleString()}</span>
          <span class="badge ${cfg[k][1]}">${Math.round(v/total*100)}%</span>
        </div>`).join("");
  }

  function renderCollections(collections) {
    const el = document.getElementById("collectionList");
    if (!el) return;
    const total = Object.values(collections).reduce((a,b)=>a+b,1);
    const max = Math.max(...Object.values(collections),1);
    const colColors = {
      "Comper":"#5a8ab0","Lead Manager":"#e8a84a","Acquisition":"#4aaa7a",
      "Follow Up Specialist":"#e8d5a3","Dispositions":"#aa7ab0","Other":"#888"
    };
    el.innerHTML = Object.entries(collections)
      .sort((a,b)=>b[1]-a[1])
      .map(([label,count])=>`
        <div class="concern-row">
          <span class="concern-label" style="min-width:180px;font-weight:500">${label}</span>
          <div class="concern-bar-bg"><div class="concern-bar" style="width:${Math.round(count/max*100)}%;background:${colColors[label]||"#888"}"></div></div>
          <span class="concern-count">${count.toLocaleString()}</span>
          <span style="font-size:11px;color:#5a5754;min-width:36px;text-align:right">${Math.round(count/total*100)}%</span>
        </div>`).join("");
  }

  function renderStages(stages) {
    const el = document.getElementById("stageList");
    if (!el) return;
    const max = Math.max(...stages.map(([,v])=>v),1);
    const colors = ["#e8d5a3","#4aaa7a","#5a8ab0","#e8614a","#e8a84a","#aa7ab0","#b07a5a","#7a9ab0","#5dcaa5","#d4537e","#e8d5a3","#4aaa7a","#5a8ab0","#e8614a","#e8a84a"];
    el.innerHTML = stages.map(([stage,count],i)=>`
      <div class="concern-row">
        <span class="concern-label" style="min-width:210px">${stage}</span>
        <div class="concern-bar-bg"><div class="concern-bar" style="width:${Math.round(count/max*100)}%;background:${colors[i%colors.length]}"></div></div>
        <span class="concern-count">${count.toLocaleString()}</span>
      </div>`).join("");
  }

  function renderSources(sources) {
    const el = document.getElementById("sourceList");
    if (!el) return;
    const max = Math.max(...sources.map(([,v])=>v),1);
    const colors = ["#e8d5a3","#4aaa7a","#5a8ab0","#e8614a","#e8a84a","#aa7ab0","#b07a5a","#7a9ab0","#5dcaa5","#d4537e"];
    el.innerHTML = sources.map(([src,count],i)=>`
      <div class="concern-row">
        <span class="concern-label" style="min-width:160px">${src}</span>
        <div class="concern-bar-bg"><div class="concern-bar" style="width:${Math.round(count/max*100)}%;background:${colors[i%colors.length]}"></div></div>
        <span class="concern-count">${count.toLocaleString()}</span>
      </div>`).join("");
  }

  function renderConcerns(concerns) {
    const el = document.getElementById("conList");
    if (!el) return;
    const sorted = Object.entries(concerns).sort((a,b)=>b[1]-a[1]);
    const max = Math.max(...sorted.map(([,v])=>v),1);
    const colors = ["#e8614a","#e8a84a","#e8d5a3","#4aaa7a","#5a8ab0","#b07a5a","#aa7ab0","#7a9ab0","#5dcaa5"];
    el.innerHTML = sorted.map(([label,count],i)=>`
      <div class="concern-row">
        <span class="concern-label">${label}</span>
        <div class="concern-bar-bg"><div class="concern-bar" style="width:${Math.round(count/max*100)}%;background:${colors[i%colors.length]}"></div></div>
        <span class="concern-count">${count.toLocaleString()}</span>
      </div>`).join("");
  }

  function renderCallInsights(ins) {
    const el = document.getElementById("callInsights");
    if (!el) return;
    const themes = ins.topThemes.map(([t,c])=>`
      <span style="background:var(--bg-3);border:0.5px solid var(--border);border-radius:20px;padding:3px 10px;font-size:12px;color:var(--text-2);display:inline-flex;align-items:center;gap:5px">
        ${t} <strong style="color:var(--text)">${c}</strong>
      </span>`).join("");
    const prices = ins.pricePoints.length
      ? ins.pricePoints.slice(0,6).map(p=>`<span style="background:var(--accent-dim);border-radius:20px;padding:3px 10px;font-size:12px;color:var(--accent)">${p}</span>`).join("")
      : "<span style='color:var(--text-3)'>None detected</span>";
    el.innerHTML = `
      <div style="margin-bottom:14px">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:8px">Key themes from ${ins.totalSummaries} call summaries</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${themes||"<span style='color:var(--text-3)'>No summaries found</span>"}</div>
      </div>
      <div>
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:8px">Price points mentioned</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${prices}</div>
      </div>`;
  }

  function renderAgentTable(agents) {
    const el = document.getElementById("agentTable");
    if (!el) return;
    if (!agents.length) { el.innerHTML='<div class="placeholder">No agent data found</div>'; return; }
    const rows = agents.map(a=>`
      <tr>
        <td style="font-weight:500">${a.name}</td>
        <td style="color:var(--text-2)">${a.calls.toLocaleString()}</td>
        <td style="color:var(--text-2)">${a.connects.toLocaleString()}</td>
        <td style="color:var(--text-2)">${a.calls ? Math.round(a.connects/a.calls*100)+"%" : "—"}</td>
        <td style="color:var(--text-2)">${a.appts.toLocaleString()}</td>
        <td style="color:var(--text-2)">${a.notes.toLocaleString()}</td>
        <td>
          ${a.avgSpeed!==null
            ? `<span class="speed-badge ${a.avgSpeed<=5?"speed-fast":a.avgSpeed<=60?"speed-med":"speed-slow"}">${FUB.fmtMins(a.avgSpeed)}</span>`
            : "<span style='color:var(--text-3)'>—</span>"}
        </td>
        <td style="color:var(--text-2)">${a.totalCallMins ? a.totalCallMins.toLocaleString()+" min" : "—"}</td>
      </tr>`).join("");
    el.innerHTML=`
      <table class="leads-table" style="table-layout:auto">
        <thead><tr>
          <th>Agent</th><th>Calls</th><th>Connects</th><th>Connect %</th>
          <th>Appts</th><th>Notes</th><th>Avg speed</th><th>Talk time</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function renderLeadsTable(leads) {
    const el = document.getElementById("leadsTable");
    if (!el) return;
    if (!leads.length) { el.innerHTML=`<div class="placeholder">No leads in last ${CONFIG.LOOKBACK_DAYS} days</div>`; return; }
    const rows = leads.slice(0,50).map(p=>{
      const fc = firstCallMap[p.id];
      const mins = fc ? Math.round((fc-new Date(p.created).getTime())/60000) : null;
      const sp = FUB.speedLabel(mins);
      const name = [p.firstName,p.lastName].filter(Boolean).join(" ")||"Unknown";
      const col = FUB.getCollection(p.stage);
      return `<tr>
        <td style="width:20%">${name}</td>
        <td style="width:8%;color:var(--text-2)">${new Date(p.created).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</td>
        <td style="width:12%;color:var(--text-2)">${p.source||"—"}</td>
        <td style="width:22%;color:var(--text-2)">${p.stage||"—"}</td>
        <td style="width:14%"><span style="font-size:11px;padding:2px 7px;border-radius:20px;background:var(--bg-3);color:var(--text-2)">${col}</span></td>
        <td style="width:12%"><span class="speed-badge ${sp.cls}">${sp.text}</span></td>
        <td style="width:12%;color:var(--text-3);font-size:12px">${p.lastNote?p.lastNote.slice(0,60)+"…":""}</td>
      </tr>`;
    }).join("");
    el.innerHTML=`
      <table class="leads-table" style="table-layout:auto">
        <thead><tr>
          <th>Lead</th><th>Added</th><th>Source</th><th>Stage</th>
          <th>Collection</th><th>Speed</th><th>Last note</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function filterLeads(q) {
    if (!q.trim()) { renderLeadsTable(allLeads); return; }
    const query = q.toLowerCase();
    renderLeadsTable(allLeads.filter(p=>
      [p.firstName,p.lastName,p.source,p.stage,p.lastNote].filter(Boolean).join(" ").toLowerCase().includes(query)
    ));
  }

  function runAI() {
    if (!dashData) { document.getElementById("aiInsights").innerHTML='<span class="ai-placeholder">Connect FUB first.</span>'; return; }
    AI.getInsights(dashData);
  }

  document.addEventListener("DOMContentLoaded", ()=>initNav());
  return { load, runAI, filterLeads };
})();
