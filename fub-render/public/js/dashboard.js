const Dashboard = (() => {
  let dashData = null, allLeads = [], firstCallMap = {};

  function initNav() {
    const titles = { speed:"Speed to dial", performance:"Sales performance", motivation:"Client motivation", concerns:"Concerns & objections", leads:"Recent leads", ai:"AI coach" };
    document.querySelectorAll(".nav-item").forEach(item => {
      item.addEventListener("click", e => {
        e.preventDefault();
        const id = item.dataset.section;
        document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
        document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
        item.classList.add("active");
        document.getElementById(id)?.classList.add("active");
        const t = document.getElementById("pageTitle");
        if (t) t.textContent = titles[id] || "";
      });
    });
  }

  function setStatus(state, msg) {
    const dot = document.getElementById("dot");
    const stxt = document.getElementById("statusText");
    if (dot) dot.className = "dot" + (state === "live" ? " live" : state === "err" ? " err" : state === "loading" ? " loading" : "");
    if (stxt) stxt.textContent = msg;
  }

  function setMetric(id, value, cls) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value;
    if (cls) el.className = "metric-value " + cls;
  }

  async function load() {
    const apiKey = document.getElementById("apiKey")?.value.trim();
    if (!apiKey) { alert("Please enter your Follow Up Boss API key."); return; }

    const btn = document.getElementById("connectBtn");
    const btnText = document.getElementById("btnText");
    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = "Loading...";
    setStatus("loading", "Fetching data...");

    try {
      const { people, events } = await FUB.fetchAll(apiKey);
      const callEvents = FUB.getCallEvents(events);
      firstCallMap = FUB.buildFirstCallMap(callEvents);
      const recent = FUB.recentLeads(people, CONFIG.LOOKBACK_DAYS);
      allLeads = recent;

      const speed = FUB.speedToDialStats(recent, firstCallMap);
      setMetric("avgSpeed", speed.avg !== null ? speed.avg + " min" : "N/A",
        speed.avg === null ? "" : speed.avg <= CONFIG.SPEED_EXCELLENT ? "good" : speed.avg <= CONFIG.SPEED_GOOD ? "warn" : "bad");
      const bar = document.getElementById("avgSpeedBar");
      if (bar && speed.avg !== null) bar.style.width = Math.min(100, Math.round(speed.avg / 120 * 100)) + "%";
      setMetric("u5", speed.under5, "good");
      setMetric("u60", speed.under60);
      setMetric("notCalled", speed.notCalled, speed.notCalled === 0 ? "good" : speed.notCalled <= 3 ? "warn" : "bad");

      const contacted = Object.keys(firstCallMap).length;
      const appts = FUB.appointmentCount(people);
      setMetric("newLeads", recent.length);
      setMetric("contacted", contacted);
      setMetric("appts", appts);
      setMetric("cRate", recent.length ? Math.round(contacted / recent.length * 100) + "%" : "—");
      setMetric("aRate", contacted ? Math.round(appts / contacted * 100) + "%" : "—");

      const mot = FUB.motivationBreakdown(people);
      renderMotivation(mot);

      const concerns = FUB.parseConcerns(people);
      renderConcerns(concerns);
      renderLeadsTable(recent);

      const vol = FUB.callVolumeByDay(callEvents, CONFIG.LOOKBACK_DAYS);
      Charts.renderCallVolume(vol.labels, vol.counts);
      Charts.renderFunnel(recent.length, contacted, appts);
      Charts.renderMotivation(mot);

      dashData = { avg: speed.avg, under5: speed.under5, under60: speed.under60, notCalled: speed.notCalled,
        newLeads: recent.length, contacted, appts, mot, concerns, callCounts: vol.counts, labels: vol.labels };

      document.getElementById("lastUpdated").textContent = "Updated " + new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      setStatus("live", people.length + " leads loaded");
      if (btn) btn.disabled = false;
      if (btnText) btnText.textContent = "Refresh";

      AI.getInsights(dashData);

    } catch (err) {
      setStatus("err", err.message);
      if (btn) btn.disabled = false;
      if (btnText) btnText.textContent = "Connect";
      document.getElementById("leadsTable").innerHTML = `<div class="placeholder" style="color:#e8614a">Error: ${err.message}</div>`;
      console.error(err);
    }
  }

  function renderMotivation(mot) {
    const total = Object.values(mot).reduce((a, b) => a + b, 1);
    const cfg = { hot:["Hot — ready now","hot"], warm:["Warm — engaged","warm"], nurture:["Nurturing","nurture"], cold:["Cold / inactive","cold"] };
    document.getElementById("motList").innerHTML = Object.entries(mot).sort((a,b)=>b[1]-a[1])
      .map(([k,v]) => `<div class="mot-row"><span class="mot-label">${cfg[k][0]}</span><span class="mot-count">${v}</span><span class="badge ${cfg[k][1]}">${Math.round(v/total*100)}%</span></div>`).join("");
  }

  function renderConcerns(concerns) {
    const sorted = Object.entries(concerns).sort((a,b)=>b[1]-a[1]);
    const maxC = Math.max(...sorted.map(([,v])=>v), 1);
    const colors = ["#e8614a","#e8a84a","#e8d5a3","#4aaa7a","#5a8ab0","#b07a5a","#aa7ab0","#7a9ab0"];
    document.getElementById("conList").innerHTML = sorted
      .map(([label,count],i) => `<div class="concern-row"><span class="concern-label">${label}</span><div class="concern-bar-bg"><div class="concern-bar" style="width:${Math.round(count/maxC*100)}%;background:${colors[i%colors.length]}"></div></div><span class="concern-count">${count}</span></div>`).join("");
  }

  function renderLeadsTable(leads) {
    if (!leads.length) {
      document.getElementById("leadsTable").innerHTML = `<div class="placeholder">No leads in the last ${CONFIG.LOOKBACK_DAYS} days</div>`;
      return;
    }
    const rows = leads.slice(0, 20).map(p => {
      const fc = firstCallMap[p.id];
      const mins = fc ? Math.round((fc - new Date(p.created).getTime()) / 60000) : null;
      const sp = FUB.speedLabel(mins);
      const name = [p.firstName, p.lastName].filter(Boolean).join(" ") || "Unknown";
      return `<tr>
        <td style="width:28%">${name}</td>
        <td style="width:18%;color:#9a9690">${new Date(p.created).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</td>
        <td style="width:22%;color:#9a9690">${p.source||"—"}</td>
        <td style="width:20%;color:#9a9690">${p.stage||"—"}</td>
        <td style="width:12%"><span class="speed-badge ${sp.cls}">${sp.text}</span></td>
      </tr>`;
    }).join("");
    document.getElementById("leadsTable").innerHTML = `
      <table class="leads-table">
        <thead><tr><th style="width:28%">Lead</th><th style="width:18%">Added</th><th style="width:22%">Source</th><th style="width:20%">Stage</th><th style="width:12%">Speed</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function filterLeads(query) {
    if (!query.trim()) { renderLeadsTable(allLeads); return; }
    const q = query.toLowerCase();
    renderLeadsTable(allLeads.filter(p => [p.firstName,p.lastName,p.source,p.stage].filter(Boolean).join(" ").toLowerCase().includes(q)));
  }

  function runAI() {
    if (!dashData) { document.getElementById("aiInsights").innerHTML = '<span class="ai-placeholder">Connect FUB first.</span>'; return; }
    AI.getInsights(dashData);
  }

  document.addEventListener("DOMContentLoaded", () => initNav());

  return { load, runAI, filterLeads };
})();
