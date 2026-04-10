const Dashboard = (() => {
  let dashData = null, allLeads = [], firstCallMap = {};

  function setStatus(state, msg) {
    const dot = document.getElementById('dot');
    const badge = document.getElementById('liveBadge');
    if (dot) dot.className = 'status-dot' + (state==='live'?' live':state==='err'?' err':state==='loading'?' loading':'');
    if (badge) {
      badge.textContent = state==='live' ? 'Live' : state==='loading' ? 'Loading...' : state==='err' ? 'Error' : 'Offline';
      badge.style.color = state==='live' ? 'var(--accent)' : state==='err' ? 'var(--danger)' : 'var(--muted)';
    }
  }

  function set(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

  function fmtSpeed(mins) {
    if (mins === null || mins === undefined) return '—';
    if (mins < 60) return mins + 'm';
    return Math.floor(mins/60) + 'h ' + (mins%60) + 'm';
  }

  function speedCls(mins) {
    if (!mins && mins !== 0) return 'spd-slow';
    if (mins <= CONFIG.SPEED_EXCELLENT) return 'spd-fast';
    if (mins <= CONFIG.SPEED_GOOD) return 'spd-med';
    return 'spd-slow';
  }

  async function load() {
    const apiKey = document.getElementById('apiKey')?.value.trim();
    if (!apiKey) { alert('Please enter your Follow Up Boss API key.'); return; }
    const btn = document.getElementById('connectBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Loading...'; }
    setStatus('loading', '');

    try {
      const raw = await FUB.fetchDashboard(apiKey, msg => setStatus('loading', msg));
      const { people, calls, notes, appointments, users, meta } = raw;

      firstCallMap = FUB.buildFirstCallMap(calls);
      const recent = FUB.recentLeads(people, CONFIG.LOOKBACK_DAYS);
      allLeads = recent;

      const speed = FUB.speedToDialStats(recent, firstCallMap);
      const contacted = Object.keys(firstCallMap).length;
      const apptCount = appointments.filter(a => new Date(a.created||a.createdAt).getTime() > Date.now() - CONFIG.LOOKBACK_DAYS*86400000).length;
      const mot = FUB.motivationBreakdown(people);
      const concerns = FUB.parseConcerns(people, notes);
      const callInsights = FUB.extractCallInsights(notes);
      const collections = FUB.collectionBreakdown(people);
      const stages = FUB.stageBreakdown(people);
      const sources = FUB.sourceBreakdown(people);
      const agents = FUB.agentPerformance(calls, appointments, notes, users, people, firstCallMap, CONFIG.LOOKBACK_DAYS);
      const vol = FUB.callVolumeByDay(calls, 14);

      // ── OVERVIEW ────────────────────────────────────────────────────────
      set('ov-total', people.length.toLocaleString());
      set('ov-calls', meta.totalCalls.toLocaleString());
      set('ov-appts', apptCount.toLocaleString());
      set('ov-speed', fmtSpeed(speed.avg));
      set('ov-crate', contacted && recent.length ? Math.round(contacted/recent.length*100)+'%' : '—');
      set('ov-arate', contacted ? Math.round(apptCount/contacted*100)+'%' : '—');
      renderSparklines(vol.counts);
      renderFunnel(recent.length, contacted, apptCount);
      renderHotLeads(people, 'hotLeadsList');
      renderCallVolBars(vol);

      // ── SPEED ───────────────────────────────────────────────────────────
      const avgMins = speed.avg;
      set('sd-avg', avgMins !== null ? (avgMins >= 60 ? Math.floor(avgMins/60)+'h' : avgMins+'') : '—');
      set('sd-u5', speed.under5);
      set('sd-u60', speed.under60);
      set('sd-nc', speed.notCalled);
      // Speed ring animation
      const ring = document.getElementById('speedRingFill');
      if (ring && avgMins !== null) {
        const pct = Math.max(0, 1 - Math.min(avgMins/120, 1));
        ring.style.strokeDashoffset = 289 - (289 * pct);
        ring.style.stroke = avgMins <= 5 ? '#00e5a0' : avgMins <= 60 ? '#ffd166' : '#ff4757';
      }
      renderSpeedBars(vol);
      renderSpeedBreakdown(speed, recent.length);

      // ── AGENTS ──────────────────────────────────────────────────────────
      renderAgentTable(agents);
      if (agents.length) {
        const topDialer = [...agents].sort((a,b)=>b.calls-a.calls)[0];
        const topAppt   = [...agents].sort((a,b)=>b.appts-a.appts)[0];
        const fastest   = agents.filter(a=>a.avgSpeed!==null).sort((a,b)=>a.avgSpeed-b.avgSpeed)[0];
        set('ag-topDialer', topDialer.name.split(' ')[0]);
        set('ag-topDialerSub', topDialer.calls.toLocaleString() + ' calls');
        set('ag-topAppt', topAppt.name.split(' ')[0]);
        set('ag-topApptSub', topAppt.appts + ' appointments');
        if (fastest) { set('ag-fastest', fastest.name.split(' ')[0]); set('ag-fastestSub', fmtSpeed(fastest.avgSpeed) + ' avg'); }
      }

      // ── PIPELINE ─────────────────────────────────────────────────────────
      renderCollectionCards(collections, people.length);
      renderBarChart('stageChart', stages.slice(0,10), ['#00e5a0','#ffd166','#7c6eff','#ff6b35','#ff4757','#00e5a0','#ffd166','#7c6eff','#ff6b35','#ff4757']);
      renderBarChart('sourceChart', sources.slice(0,8), ['#00e5a0','#ffd166','#7c6eff','#ff6b35','#ff4757','#00e5a0','#ffd166','#7c6eff']);

      // ── CONCERNS ─────────────────────────────────────────────────────────
      renderConcerns(concerns);
      renderCallThemes(callInsights);

      // ── MOTIVATION ───────────────────────────────────────────────────────
      set('mot-hot',    mot.hot.toLocaleString());
      set('mot-warm',   mot.warm.toLocaleString());
      set('mot-nurture',mot.nurture.toLocaleString());
      set('mot-cold',   mot.cold.toLocaleString());
      set('mq-priority', mot.hot);
      set('mq-stretch',  mot.cold);
      set('mq-nurture',  mot.nurture);
      set('mq-reengage', mot.warm);
      set('mi-hot',    mot.hot.toLocaleString() + ' leads');
      set('mi-warm',   mot.warm.toLocaleString() + ' leads');
      set('mi-nurture',mot.nurture.toLocaleString() + ' leads');
      set('mi-cold',   mot.cold.toLocaleString() + ' leads');
      renderMotivatorBars(concerns);
      renderHotLeads(people, 'hotLeadsMotList');

      // ── LEADS ────────────────────────────────────────────────────────────
      renderLeadsTable(recent);

      // ── STORE + STATUS ───────────────────────────────────────────────────
      dashData = { avgMins, under5:speed.under5, under60:speed.under60, notCalled:speed.notCalled,
        newLeads:recent.length, totalPeople:people.length, contacted, appts:apptCount,
        totalCalls:meta.totalCalls, mot, concerns, callInsights,
        callCounts:vol.counts, labels:vol.labels,
        topStages:stages.slice(0,6), topSources:sources.slice(0,4),
        collections, topAgents:agents.slice(0,5) };

      const ts = new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
      document.getElementById('lastUpdated').textContent = 'Updated '+ts+' · '+people.length.toLocaleString()+' contacts';
      setStatus('live','');
      if (btn) { btn.disabled = false; btn.textContent = 'Refresh →'; }
      AI.getInsights(dashData);

    } catch(err) {
      setStatus('err','');
      if (btn) { btn.disabled = false; btn.textContent = 'Connect →'; }
      document.getElementById('leadsTable').innerHTML = `<div class="ph" style="color:var(--danger)">Error: ${err.message}</div>`;
      console.error(err);
    }
  }

  // ── RENDERERS ─────────────────────────────────────────────────────────────

  function renderSparklines(counts) {
    const max = Math.max(...counts, 1);
    const colors = [
      'rgba(0,229,160,',
      'rgba(255,107,53,',
      'rgba(124,110,255,',
      'rgba(255,209,102,',
    ];
    ['ov-spark1','ov-spark2','ov-spark3','ov-spark4'].forEach((id, ci) => {
      const el = document.getElementById(id);
      if (!el) return;
      const recent = counts.slice(-7);
      el.innerHTML = recent.map((v,i) => {
        const h = Math.max(10, Math.round(v/max*100));
        const isLast = i === recent.length-1;
        return `<div class="spark-bar ${isLast?'today':''}" style="height:${h}%;background:${isLast?colors[ci]+'1)':colors[ci]+'0.25)'}"></div>`;
      }).join('');
    });
  }

  function renderCallVolBars(vol) {
    const el = document.getElementById('callVolBars');
    const lb = document.getElementById('callVolLabels');
    if (!el) return;
    const max = Math.max(...vol.counts, 1);
    el.innerHTML = vol.counts.map((v,i) => {
      const h = Math.max(4, Math.round(v/max*100));
      const isToday = i === vol.counts.length-1;
      return `<div style="flex:1;height:${h}%;background:${isToday?'var(--accent)':'rgba(0,229,160,0.2)'};border-radius:2px 2px 0 0;transition:height .8s ease" title="${vol.labels[i]}: ${v} calls"></div>`;
    }).join('');
    if (lb) lb.innerHTML = vol.labels.map(l=>`<span>${l}</span>`).join('');
  }

  function renderSpeedBars(vol) {
    const el = document.getElementById('sdBars');
    const lb = document.getElementById('sdLabels');
    if (!el) return;
    const max = Math.max(...vol.counts, 1);
    el.innerHTML = vol.counts.map((v,i) => {
      const h = Math.max(4, Math.round(v/max*100));
      return `<div style="flex:1;height:${h}%;background:rgba(255,209,102,0.3);border-radius:2px 2px 0 0" title="${vol.labels[i]}: ${v}"></div>`;
    }).join('');
    if (lb) lb.innerHTML = vol.labels.map(l=>`<span>${l}</span>`).join('');
  }

  function renderSpeedBreakdown(speed, total) {
    const el = document.getElementById('sdBreakdown');
    if (!el) return;
    const items = [
      ['Under 5 min', speed.under5, 'var(--accent)'],
      ['5–60 min',    Math.max(0, speed.under60 - speed.under5), 'var(--accent4)'],
      ['Over 1 hour', Math.max(0, total - speed.under60 - speed.notCalled), 'var(--accent2)'],
      ['Not called',  speed.notCalled, 'var(--danger)'],
    ];
    const max = Math.max(...items.map(([,v])=>v), 1);
    el.innerHTML = items.map(([label,count,color]) => `
      <div class="bar-row">
        <div class="label">${label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round(count/max*100)}%;background:${color}"></div></div>
        <div class="count">${count}</div>
      </div>`).join('');
  }

  function renderFunnel(leads, contacted, appts) {
    const el = document.getElementById('ovFunnel');
    if (!el) return;
    const steps = [
      ['New leads',        leads,     '100',     'var(--accent)',  0.12, 0.2],
      ['Attempted contact',contacted, leads?Math.round(contacted/leads*100)+'':'-','var(--accent)', 0.09, 0.15],
      ['Connected',        contacted, leads?Math.round(contacted/leads*100)+'':'-','var(--accent4)', 0.08, 0.15],
      ['Appointment set',  appts,     contacted?Math.round(appts/contacted*100)+'':'-','var(--accent3)', 0.08, 0.15],
    ];
    const widths = ['100%','85%','65%','45%'];
    el.innerHTML = steps.map(([name,count,pct,color,a,b],i) => `
      ${i>0?`<div class="funnel-drop">↓ ${pct}% advance</div>`:''}
      <div class="funnel-step" style="background:rgba(${color==='var(--accent)'?'0,229,160':color==='var(--accent4)'?'255,209,102':'124,110,255'},${a});border:1px solid rgba(${color==='var(--accent)'?'0,229,160':color==='var(--accent4)'?'255,209,102':'124,110,255'},${b});width:${widths[i]}">
        <span class="funnel-step-name">${name}</span>
        <div style="text-align:right">
          <div class="funnel-step-count" style="color:${color}">${count.toLocaleString()}</div>
          <div class="funnel-step-pct">${pct}%</div>
        </div>
      </div>`).join('');
  }

  function renderHotLeads(people, elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    const hot = people.filter(p => FUB.motLevel(p) === 'hot').slice(0, 4);
    if (!hot.length) { el.innerHTML = '<div class="ph">No hot leads found</div>'; return; }
    el.innerHTML = hot.map(p => {
      const name = [p.firstName,p.lastName].filter(Boolean).join(' ') || 'Unknown';
      const fc = firstCallMap[p.id];
      const daysSince = fc ? Math.round((Date.now()-fc)/86400000) : null;
      const lastContact = daysSince === null ? 'Never' : daysSince === 0 ? 'Today' : daysSince + 'd ago';
      const contactColor = daysSince === null ? 'var(--danger)' : daysSince === 0 ? 'var(--accent)' : daysSince <= 3 ? 'var(--accent4)' : 'var(--danger)';
      return `
        <div style="padding:11px;background:var(--surface2);border-radius:8px;border:1px solid rgba(0,229,160,0.15);margin-bottom:7px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
            <span style="font-size:12px;font-weight:600;color:var(--text)">${name}</span>
            <span class="pill pill-green">${p.stage||'Hot'}</span>
          </div>
          <div style="font-size:10px;color:var(--muted);line-height:1.7">
            Source: ${p.source||'—'}<br>
            Last contact: <span style="color:${contactColor}">${lastContact}</span>
          </div>
        </div>`;
    }).join('');
  }

  function renderAgentTable(agents) {
    const el = document.getElementById('agentTable');
    if (!el) return;
    if (!agents.length) { el.innerHTML='<div class="ph">No agent data found</div>'; return; }
    const rows = agents.map(a => `
      <tr>
        <td><span class="agent-name">${a.name}</span></td>
        <td style="color:var(--accent);font-family:'Syne',sans-serif;font-weight:700">${a.calls.toLocaleString()}</td>
        <td style="color:var(--muted)">${a.connects}</td>
        <td>${a.calls ? `<span style="color:${a.connects/a.calls>0.3?'var(--accent)':'var(--accent4)'}">${Math.round(a.connects/a.calls*100)}%</span>` : '—'}</td>
        <td style="color:var(--accent3);font-family:'Syne',sans-serif;font-weight:700">${a.appts}</td>
        <td style="color:var(--muted)">${a.notes}</td>
        <td>${a.avgSpeed!==null?`<span class="spd ${speedCls(a.avgSpeed)}">${fmtSpeed(a.avgSpeed)}</span>`:'<span style="color:var(--muted)">—</span>'}</td>
        <td style="color:var(--muted)">${a.totalCallMins?a.totalCallMins+'m':'—'}</td>
      </tr>`).join('');
    el.innerHTML = `<table class="agent-table">
      <thead><tr><th>Agent</th><th>Calls</th><th>Connects</th><th>Connect %</th><th>Appts</th><th>Notes</th><th>Avg speed</th><th>Talk time</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function renderCollectionCards(collections, total) {
    const el = document.getElementById('collectionCards');
    if (!el) return;
    const colColors = {'Comper':'var(--accent)','Lead Manager':'var(--accent4)','Acquisition':'var(--accent)','Follow Up Specialist':'var(--accent3)','Dispositions':'var(--accent2)','Other':'var(--muted)'};
    const caMap = {'Comper':'ca-green','Lead Manager':'ca-yellow','Acquisition':'ca-green','Follow Up Specialist':'ca-purple','Dispositions':'ca-orange','Other':''};
    el.innerHTML = Object.entries(collections).filter(([,v])=>v>0).map(([k,v]) => `
      <div class="card card-accent-tl ${caMap[k]||''}">
        <div class="card-label">${k}</div>
        <div class="card-value" style="color:${colColors[k]||'var(--text)'}">${v.toLocaleString()}</div>
        <div class="card-sub">${Math.round(v/total*100)}% of pipeline</div>
      </div>`).join('');
  }

  function renderBarChart(elId, data, colors) {
    const el = document.getElementById(elId);
    if (!el) return;
    const max = Math.max(...data.map(([,v])=>v), 1);
    el.innerHTML = data.map(([label,count],i) => `
      <div class="bar-row">
        <div class="label" style="font-size:10px">${label.length>14?label.slice(0,14)+'…':label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round(count/max*100)}%;background:${colors[i%colors.length]}"></div></div>
        <div class="count">${count.toLocaleString()}</div>
      </div>`).join('');
  }

  function renderConcerns(concerns) {
    const el = document.getElementById('concernList');
    if (!el) return;
    const sorted = Object.entries(concerns).sort((a,b)=>b[1]-a[1]);
    const max = Math.max(...sorted.map(([,v])=>v), 1);
    const colors = ['var(--accent2)','var(--accent4)','var(--accent3)','var(--accent)','var(--danger)','var(--accent)','var(--accent2)','var(--accent3)'];
    el.innerHTML = sorted.map(([label,count],i) => `
      <div class="concern-item">
        <div class="concern-left">
          <div class="concern-rank">${String(i+1).padStart(2,'0')}</div>
          <div class="concern-name">${label}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="concern-bar-mini"><div class="concern-bar-fill" style="width:${Math.round(count/max*100)}%;background:${colors[i%colors.length]}"></div></div>
          <div class="concern-pct" style="color:${colors[i%colors.length]}">${count}</div>
        </div>
      </div>`).join('');
  }

  function renderCallThemes(ins) {
    const el = document.getElementById('callThemes');
    if (!el) return;
    if (!ins.topThemes.length) { el.innerHTML='<div style="color:var(--muted);font-size:11px">No call summaries found in notes</div>'; return; }
    el.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
        ${ins.topThemes.map(([t,c])=>`<span class="pill pill-green">${t} <strong>${c}</strong></span>`).join('')}
      </div>
      ${ins.pricePoints.length ? `<div style="font-size:10px;color:var(--muted);margin-bottom:4px">Price points mentioned:</div><div style="display:flex;flex-wrap:wrap;gap:5px">${ins.pricePoints.slice(0,6).map(p=>`<span class="pill pill-yellow">${p}</span>`).join('')}</div>` : ''}
      <div style="font-size:10px;color:var(--muted);margin-top:8px">${ins.totalSummaries} call summaries analyzed</div>`;
  }

  function renderMotivatorBars(concerns) {
    const el = document.getElementById('motivatorBars');
    if (!el) return;
    const top = Object.entries(concerns).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const max = Math.max(...top.map(([,v])=>v), 1);
    const colors = ['var(--accent)','var(--accent4)','var(--accent3)','var(--accent2)','var(--danger)'];
    el.innerHTML = top.map(([label,count],i) => `
      <div class="bar-row">
        <div class="label" style="font-size:10px">${label.length>12?label.slice(0,12)+'…':label}</div>
        <div class="bar-track" style="height:10px"><div class="bar-fill" style="width:${Math.round(count/max*100)}%;background:${colors[i]};height:100%"></div></div>
        <div class="count">${count}</div>
      </div>`).join('');
  }

  function renderLeadsTable(leads) {
    const el = document.getElementById('leadsTable');
    if (!el) return;
    if (!leads.length) { el.innerHTML=`<div class="ph">No leads in last ${CONFIG.LOOKBACK_DAYS} days</div>`; return; }
    const rows = leads.slice(0,50).map(p => {
      const fc = firstCallMap[p.id];
      const mins = fc ? Math.round((fc - new Date(p.created).getTime())/60000) : null;
      const cls = mins===null?'spd-slow':mins<=5?'spd-fast':mins<=60?'spd-med':'spd-slow';
      const name = [p.firstName,p.lastName].filter(Boolean).join(' ') || 'Unknown';
      const motColor = {'hot':'var(--accent)','warm':'var(--accent4)','nurture':'var(--accent3)','cold':'var(--muted)'}[FUB.motLevel(p)];
      return `<tr>
        <td style="color:var(--text)">${name}</td>
        <td style="color:var(--muted)">${new Date(p.created).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</td>
        <td style="color:var(--muted)">${p.source||'—'}</td>
        <td><span style="color:${motColor};font-size:11px">${p.stage||'—'}</span></td>
        <td><span class="spd ${cls}">${mins===null?'No call':mins<=60?mins+'m':Math.floor(mins/60)+'h '+mins%60+'m'}</span></td>
        <td style="color:var(--muted);font-size:10px">${p.lastNote?p.lastNote.slice(0,50)+'…':''}</td>
      </tr>`;
    }).join('');
    el.innerHTML = `<table class="leads-table">
      <thead><tr><th>Lead</th><th>Added</th><th>Source</th><th>Stage</th><th>Speed</th><th>Last note</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function filterLeads(q) {
    if (!q.trim()) { renderLeadsTable(allLeads); return; }
    const query = q.toLowerCase();
    renderLeadsTable(allLeads.filter(p =>
      [p.firstName,p.lastName,p.source,p.stage,p.lastNote].filter(Boolean).join(' ').toLowerCase().includes(query)
    ));
  }

  function runAI() {
    if (!dashData) { document.getElementById('aiInsights').innerHTML='<span class="ai-thinking">Connect FUB first.</span>'; return; }
    AI.getInsights(dashData);
  }

  return { load, runAI, filterLeads };
})();
