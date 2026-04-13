const Dashboard = (() => {
  let rawData = null, filtered = null, firstCallMap = {}, allLeads = [];

  // Marie Emara's user ID — will be auto-detected from users list
  const MARIE_NAME = "Marie Emara";
  let marieUserId = null;

  // Daily goals for Marie
  const GOALS = { appts: 9, talkMins: 150, dials: 80, speedMins: 30 };

  function set(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
  function fmtSpeed(mins) {
    if (mins === null || mins === undefined) return '—';
    if (mins < 60) return mins + 'm';
    const h = Math.floor(mins/60), m = mins%60;
    return m > 0 ? h + 'h ' + m + 'm' : h + 'h';
  }
  function speedCls(mins) {
    if (!mins && mins !== 0) return 'spd-slow';
    if (mins <= CONFIG.SPEED_EXCELLENT) return 'spd-fast';
    if (mins <= CONFIG.SPEED_GOOD) return 'spd-med';
    return 'spd-slow';
  }
  function setStatus(msg, color) {
    const b = document.getElementById('liveBadge');
    if (b) { b.textContent = msg; b.style.color = color || 'var(--accent)'; }
  }

  // Build month dropdown — Jan to current month only
  function buildMonthFilter() {
    const sel = document.getElementById('filterMonth');
    if (!sel) return;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    while (sel.options.length > 1) sel.remove(1);
    const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    for (let m = 1; m <= currentMonth; m++) {
      const opt = document.createElement('option');
      opt.value = `${currentYear}-${String(m).padStart(2,'0')}`;
      opt.textContent = `${names[m-1]} ${currentYear}`;
      sel.appendChild(opt);
    }
  }

  function populateAgentFilter(users) {
    const sel = document.getElementById('filterAgent');
    if (!sel || !users.length) return;
    const cur = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    users.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = u.name || u.email || 'Agent ' + u.id;
      if ((u.name||'').includes(MARIE_NAME)) marieUserId = u.id;
      sel.appendChild(opt);
    });
    sel.value = cur;
  }

  async function waitForData() {
    setStatus('Syncing...', 'var(--accent4)');
    const poll = setInterval(async () => {
      const status = await fetch('/api/cache/status').then(r=>r.json()).catch(()=>null);
      if (!status) return;
      const s = document.getElementById('syncStatus');
      if (s) s.textContent = status.progress || '';
      if (status.hasCache) { clearInterval(poll); await loadDashboard(); }
    }, 3000);
  }

  async function loadDashboard() {
    setStatus('Loading...', 'var(--accent4)');
    try {
      const raw = await fetch('/api/fub/dashboard').then(r=>r.json());
      if (raw.meta && raw.meta.syncing && !raw.meta.fromCache && raw.people.length === 0) {
        setStatus('Syncing ' + (raw.meta.progress||'...'), 'var(--accent4)');
        waitForData(); return;
      }
      rawData = raw;
      buildMonthFilter();
      populateAgentFilter(raw.users || []);
      applyFilters();
      const ts = raw.meta.fetchedAt ? new Date(raw.meta.fetchedAt).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}) : '';
      document.getElementById('lastUpdated').textContent = 'Synced '+ts+' · '+(raw.totalPeople||raw.people.length).toLocaleString()+' total contacts';
      setStatus('Live', 'var(--accent)');
      setTimeout(loadDashboard, 5 * 60 * 1000);
    } catch(err) { setStatus('Error','var(--danger)'); console.error(err); }
  }

  function applyFilters() {
    if (!rawData) return;
    const month   = document.getElementById('filterMonth')?.value || '';
    const agentId = document.getElementById('filterAgent')?.value || '';

    let people = rawData.people || [];
    let calls  = rawData.calls  || [];
    let notes  = rawData.notes  || [];
    let appts  = rawData.appointments || [];

    if (month) {
      const [yr,mo] = month.split('-').map(Number);
      const start = new Date(yr,mo-1,1).getTime(), end = new Date(yr,mo,1).getTime();
      const inM = d => { const t=new Date(d).getTime(); return t>=start&&t<end; };
      people = people.filter(p=>inM(p.created));
      calls  = calls.filter(c=>inM(c.created||c.createdAt||c.created_at));
      notes  = notes.filter(n=>inM(n.created||n.createdAt));
      appts  = appts.filter(a=>inM(a.created||a.createdAt||a.startTime));
    }

    if (agentId) {
      const id = Number(agentId);
      people = people.filter(p=>p.assignedUserId===id||p.ownerId===id||p.userId===id);
      calls  = calls.filter(c=>c.userId===id||c.user_id===id);
      notes  = notes.filter(n=>n.userId===id||n.user_id===id);
      appts  = appts.filter(a=>a.userId===id||a.user_id===id);
    }

    filtered = { people, calls, notes, appointments:appts, users:rawData.users||[], totalPeople:rawData.totalPeople };
    firstCallMap = FUB.buildFirstCallMap(calls);
    allLeads = people;

    // Build all-calls first call map (unfiltered) for Marie daily goals
    const allCallsMap = FUB.buildFirstCallMap(rawData.calls||[]);
    render(filtered);
    updateMarieDailyGoals(rawData.calls||[], rawData.appointments||[], rawData.users||[], allCallsMap);
  }

  // ── Marie's daily goals — always based on TODAY regardless of filter ────────
  function updateMarieDailyGoals(allCalls, allAppts, users, allCallsMap) {
    // Find Marie's user ID
    if (!marieUserId) {
      const marie = users.find(u => (u.name||'').toLowerCase().includes('marie'));
      if (marie) marieUserId = marie.id;
    }

    const todayStart = new Date(new Date().toDateString()).getTime();
    const todayEnd   = todayStart + 86400000;
    const isToday = d => { const t=new Date(d).getTime(); return t>=todayStart&&t<todayEnd; };
    const isMarie = c => marieUserId && (c.userId===marieUserId || c.user_id===marieUserId);

    // Today's calls by Marie
    const todayCalls = allCalls.filter(c => isToday(c.created||c.createdAt||c.created_at) && isMarie(c));
    const dials = todayCalls.length;

    // Talk time — sum of call durations in minutes
    const talkSecs = todayCalls.reduce((s,c) => s + Number(c.duration||c.durationSeconds||0), 0);
    const talkMins = Math.round(talkSecs / 60);

    // Appts set today by Marie
    const todayAppts = allAppts.filter(a => isToday(a.created||a.createdAt) && isMarie(a)).length;

    // Speed to lead — Marie's avg today (uses unfiltered allCallsMap)
    const marieLeadsToday = (rawData.people||[]).filter(p => isToday(p.created));
    const speeds = [];
    marieLeadsToday.forEach(p => {
      const fc = (allCallsMap||{})[p.id];
      if (!fc) return;
      const mins = Math.round((fc - new Date(p.created).getTime()) / 60000);
      if (mins >= 0 && mins < 1440) speeds.push(mins);
    });
    const avgSpeed = speeds.length ? Math.round(speeds.reduce((a,b)=>a+b,0)/speeds.length) : null;

    // Render goals
    renderGoal('goal-appts', 'goal-appts-bar', 'goal-appts-pct', todayAppts, GOALS.appts, 10, 'var(--accent)', v=>`${v} appts`);
    renderGoal('goal-talk',  'goal-talk-bar',  'goal-talk-pct',  talkMins,   GOALS.talkMins, GOALS.talkMins, 'var(--accent3)', v=>FUB.fmtMins(v)+' talk');
    renderGoal('goal-dials', 'goal-dials-bar', 'goal-dials-pct', dials, GOALS.dials, GOALS.dials, 'var(--accent4)', v=>`${v} dials`);

    // Speed goal — lower is better, so invert the bar
    const speedEl = document.getElementById('goal-speed');
    const speedBar = document.getElementById('goal-speed-bar');
    const speedPct = document.getElementById('goal-speed-pct');
    if (speedEl) speedEl.textContent = avgSpeed !== null ? FUB.fmtMins(avgSpeed) : '—';
    if (speedBar) {
      const good = avgSpeed !== null && avgSpeed <= GOALS.speedMins;
      const pct = avgSpeed !== null ? Math.min(100, Math.round((GOALS.speedMins / Math.max(avgSpeed,1)) * 100)) : 0;
      speedBar.style.width = pct + '%';
      speedBar.style.background = good ? 'var(--accent)' : 'var(--danger)';
    }
    if (speedPct && avgSpeed !== null) {
      const good = avgSpeed <= GOALS.speedMins;
      speedPct.style.color = good ? 'var(--accent)' : 'var(--danger)';
      speedPct.textContent = good ? '✓ Under goal' : avgSpeed - GOALS.speedMins + 'm over goal';
    }
  }

  function renderGoal(valId, barId, pctId, actual, goalMin, goalMax, color, fmt) {
    const valEl = document.getElementById(valId);
    const barEl = document.getElementById(barId);
    const pctEl = document.getElementById(pctId);
    if (valEl) valEl.textContent = fmt(actual);
    const pct = Math.min(100, Math.round(actual / goalMin * 100));
    const met = actual >= goalMin;
    if (barEl) { barEl.style.width = pct + '%'; barEl.style.background = met ? color : 'rgba(255,71,87,0.6)'; }
    if (pctEl) {
      pctEl.style.color = met ? color : 'var(--danger)';
      pctEl.textContent = met ? '✓ Goal met' : pct + '% of goal';
    }
  }

  // ── Render all sections ────────────────────────────────────────────────────
  function render(data) {
    const { people, calls, notes, appointments, users, totalPeople } = data;
    const speed = FUB.speedToDialStats(people, firstCallMap);
    const contacted = Object.keys(firstCallMap).length;
    const apptCount = appointments.length;
    const mot = FUB.motivationBreakdown(people);
    const concerns = FUB.parseConcerns(people, notes);
    const callInsights = FUB.extractCallInsights(notes);
    const { counts: collections, activeTotal: activePipelineTotal } = FUB.collectionBreakdown(people);
    const stages = FUB.stageBreakdown(people);
    const sources = FUB.sourceBreakdown(people);
    const agents = FUB.agentPerformance(calls, appointments, notes, users, people, firstCallMap, 999);
    const vol = FUB.callVolumeByDay(calls, 14);

    // Connected calls (duration > 30s)
    const connected = calls.filter(c => Number(c.duration||c.durationSeconds||0) > 30).length;
    const talkStats = FUB.talkTimeStats(calls);

    // SCORECARD
    set('sc-newleads', people.length.toLocaleString());
    set('sc-total', (totalPeople||people.length).toLocaleString());
    set('sc-appts', apptCount.toLocaleString());
    set('sc-speed', fmtSpeed(speed.avg));
    set('sc-cvr', people.length ? Math.round(apptCount/people.length*100)+'%' : '—');
    set('sc-calls', calls.length.toLocaleString());
    set('sc-connects', connected.toLocaleString());
    set('sc-connect-rate', calls.length ? Math.round(connected/calls.length*100)+'% connect rate' : '— connect rate');
    set('sc-talktime', FUB.fmtMins(talkStats.totalMins));
    set('sc-notes', notes.length.toLocaleString());
    set('sc-u5', speed.under5.toLocaleString());
    set('sc-u5-pct', people.length ? Math.round(speed.under5/people.length*100)+'% of new leads' : 'of new leads');

    // SPEED TAB
    const avgMins = speed.avg;
    const displayVal = avgMins !== null ? (avgMins >= 60 ? Math.floor(avgMins/60)+'h' : avgMins+'') : '—';
    const displayUnit = avgMins !== null && avgMins >= 60 ? (avgMins%60>0 ? (avgMins%60)+'m' : '') : 'min';
    set('sd-avg', displayVal);
    set('sd-unit', displayUnit);
    set('sd-u5', speed.under5);
    set('sd-u5-pct', people.length ? Math.round(speed.under5/people.length*100)+'% of new leads' : '');
    set('sd-u60', speed.under60);
    set('sd-u60-pct', people.length ? Math.round(speed.under60/people.length*100)+'% of new leads' : '');
    set('sd-nc', speed.notCalled);
    const ring = document.getElementById('speedRingFill');
    if (ring && avgMins !== null) {
      const pct = Math.max(0, 1 - Math.min(avgMins/180, 1));
      ring.style.strokeDashoffset = 289 - (289*pct);
      ring.style.stroke = avgMins<=30?'#00e5a0':avgMins<=60?'#ffd166':'#ff4757';
    }
    renderSpeedBars(vol);
    renderSpeedBreakdown(speed, people.length);

    // AGENTS
    renderAgentTable(agents);
    if (agents.length) {
      const topD=[...agents].sort((a,b)=>b.calls-a.calls)[0];
      const topA=[...agents].sort((a,b)=>b.appts-a.appts)[0];
      const fast=agents.filter(a=>a.avgSpeed!==null).sort((a,b)=>a.avgSpeed-b.avgSpeed)[0];
      set('ag-topDialer',topD.name.split(' ')[0]); set('ag-topDialerSub',topD.calls+' calls');
      set('ag-topAppt',topA.name.split(' ')[0]);   set('ag-topApptSub',topA.appts+' appts');
      if(fast){set('ag-fastest',fast.name.split(' ')[0]);set('ag-fastestSub',fmtSpeed(fast.avgSpeed)+' avg');}
    }

    // PIPELINE
    renderCollectionCards(collections, activePipelineTotal);
    renderBarChart('stageChart', stages.slice(0,10), ['#00e5a0','#ffd166','#7c6eff','#ff6b35','#ff4757','#00e5a0','#ffd166','#7c6eff','#ff6b35','#ff4757']);
    renderBarChart('sourceChart', sources.slice(0,8), ['#00e5a0','#ffd166','#7c6eff','#ff6b35','#ff4757','#00e5a0','#ffd166','#7c6eff']);

    // CONCERNS
    renderConcerns(concerns); renderCallThemes(callInsights);

    // MOTIVATION
    set('mot-hot',mot.hot.toLocaleString()); set('mot-warm',mot.warm.toLocaleString());
    set('mot-nurture',mot.nurture.toLocaleString()); set('mot-cold',mot.cold.toLocaleString());
    set('mq-priority',mot.hot); set('mq-stretch',mot.cold);
    set('mq-nurture',mot.nurture); set('mq-reengage',mot.warm);
    renderMotivatorBars(concerns);
    renderHotLeads(people,'hotLeadsMotList');

    // SCORECARD funnel + hot leads + call vol
    renderFunnel(people.length, contacted, apptCount);
    renderHotLeads(people,'hotLeadsList');
    renderCallVolBars(vol);

    // LEADS
    renderLeadsTable(people);

    // AI
    AI.getInsights({
      avgMins, under5:speed.under5, under60:speed.under60, notCalled:speed.notCalled,
      newLeads:people.length, totalPeople:totalPeople||people.length,
      contacted, appts:apptCount, totalCalls:calls.length,
      mot, concerns, callInsights, callCounts:vol.counts, labels:vol.labels,
      topStages:stages.slice(0,6), topSources:sources.slice(0,4),
      collections, topAgents:agents.slice(0,5),
    });
  }

  // ── Renderers ─────────────────────────────────────────────────────────────
  function renderCallVolBars(vol) {
    const el=document.getElementById('callVolBars'),lb=document.getElementById('callVolLabels');
    if(!el)return; const max=Math.max(...vol.counts,1);
    el.innerHTML=vol.counts.map((v,i)=>{const h=Math.max(4,Math.round(v/max*100)),last=i===vol.counts.length-1;return`<div style="flex:1;height:${h}%;background:${last?'var(--accent)':'rgba(0,229,160,0.2)'};border-radius:2px 2px 0 0" title="${vol.labels[i]}: ${v} calls"></div>`;}).join('');
    if(lb)lb.innerHTML=vol.labels.map(l=>`<span>${l}</span>`).join('');
  }
  function renderSpeedBars(vol) {
    const el=document.getElementById('sdBars'),lb=document.getElementById('sdLabels');
    if(!el)return; const max=Math.max(...vol.counts,1);
    el.innerHTML=vol.counts.map(v=>`<div style="flex:1;height:${Math.max(4,Math.round(v/max*100))}%;background:rgba(255,209,102,0.3);border-radius:2px 2px 0 0"></div>`).join('');
    if(lb)lb.innerHTML=vol.labels.map(l=>`<span>${l}</span>`).join('');
  }
  function renderSpeedBreakdown(speed,total) {
    const el=document.getElementById('sdBreakdown');if(!el)return;
    const items=[['Under 5 min',speed.under5,'var(--accent)'],['5–60 min',Math.max(0,speed.under60-speed.under5),'var(--accent4)'],['Over 1 hour',Math.max(0,total-speed.under60-speed.notCalled),'var(--accent2)'],['Not called',speed.notCalled,'var(--danger)']];
    const max=Math.max(...items.map(([,v])=>v),1);
    el.innerHTML=items.map(([label,count,color])=>`<div class="bar-row"><div class="label">${label}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.round(count/max*100)}%;background:${color}"></div></div><div class="count">${count}</div></div>`).join('');
  }
  function renderFunnel(leads,contacted,appts) {
    const el=document.getElementById('ovFunnel');if(!el)return;
    const steps=[['New leads',leads,'100%','var(--accent)','100%'],['Attempted contact',contacted,leads?Math.round(contacted/leads*100)+'%':'—','var(--accent)','85%'],['Connected',contacted,leads?Math.round(contacted/leads*100)+'%':'—','var(--accent4)','65%'],['Appointment set',appts,contacted?Math.round(appts/contacted*100)+'%':'—','var(--accent3)','45%']];
    el.innerHTML=steps.map(([name,count,pct,color,w],i)=>`${i>0?`<div class="funnel-drop">↓ ${steps[i][2]} advance</div>`:''}
      <div class="funnel-step" style="background:rgba(0,229,160,0.08);border:1px solid rgba(0,229,160,0.15);width:${w}">
        <span class="funnel-step-name">${name}</span>
        <div style="text-align:right"><div class="funnel-step-count" style="color:${color}">${count.toLocaleString()}</div><div class="funnel-step-pct">${pct}</div></div>
      </div>`).join('');
  }
  function renderHotLeads(people,elId) {
    const el=document.getElementById(elId);if(!el)return;
    const hot=people.filter(p=>FUB.motLevel(p)==='hot').slice(0,4);
    if(!hot.length){el.innerHTML='<div class="ph">No hot leads in selected period</div>';return;}
    el.innerHTML=hot.map(p=>{
      const name=[p.firstName,p.lastName].filter(Boolean).join(' ')||'Unknown';
      const fc=firstCallMap[p.id];
      const days=fc?Math.round((Date.now()-fc)/86400000):null;
      const cc=days===null?'var(--danger)':days===0?'var(--accent)':days<=3?'var(--accent4)':'var(--danger)';
      return`<div style="padding:11px;background:var(--surface2);border-radius:8px;border:1px solid rgba(0,229,160,0.15);margin-bottom:7px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px"><span style="font-size:12px;font-weight:600;color:var(--text)">${name}</span><span class="pill pill-green">${p.stage||'Hot'}</span></div><div style="font-size:10px;color:var(--muted);line-height:1.7">Source: ${p.source||'—'}<br>Last contact: <span style="color:${cc}">${days===null?'Never':days===0?'Today':days+'d ago'}</span></div></div>`;
    }).join('');
  }
  function renderAgentTable(agents) {
    const el=document.getElementById('agentTable');if(!el)return;
    if(!agents.length){el.innerHTML='<div class="ph">No agent data for this period</div>';return;}
    const rows=agents.map(a=>`<tr>
      <td><span class="agent-name">${a.name}</span><br><span style="font-size:10px;color:var(--muted)">${a.role||""}</span></td>
      <td style="color:var(--accent);font-family:'Syne',sans-serif;font-weight:700">${a.calls.toLocaleString()}</td>
      <td style="color:var(--muted)">${a.connects}</td>
      <td>${a.calls?`<span style="color:${a.connects/a.calls>0.3?'var(--accent)':'var(--accent4)'}">${Math.round(a.connects/a.calls*100)}%</span>`:'—'}</td>
      <td style="color:var(--accent3);font-family:'Syne',sans-serif;font-weight:700">${a.appts}</td>
      <td style="color:var(--muted)">${a.notes}</td>
      <td>${a.avgSpeed!==null?`<span class="spd ${speedCls(a.avgSpeed)}">${fmtSpeed(a.avgSpeed)}</span>`:'<span style="color:var(--muted)">—</span>'}</td>
      <td style="color:var(--muted)">${a.totalCallMins?FUB.fmtMins(a.totalCallMins):'—'}</td>
    </tr>`).join('');
    el.innerHTML=`<table class="agent-table"><thead><tr>
      <th>Agent / Role</th>
      <th><span class="tooltip" style="cursor:help">Dials<span class="tip" style="font-size:10px">Total call attempts logged</span></span></th>
      <th><span class="tooltip" style="cursor:help">Connects<span class="tip" style="font-size:10px">Calls > 30 seconds duration</span></span></th>
      <th>Connect %</th>
      <th><span class="tooltip" style="cursor:help">Appts<span class="tip" style="font-size:10px">Appointments set this period</span></span></th>
      <th>Notes</th>
      <th><span class="tooltip" style="cursor:help">Avg Speed<span class="tip" style="font-size:10px">Avg minutes from lead in to first call. Matches FUB Agent Activity report.</span></span></th>
      <th><span class="tooltip" style="cursor:help">Talk Time<span class="tip" style="font-size:10px">Total call duration in minutes</span></span></th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  }
  function renderCollectionCards(collections,total) {
    const el=document.getElementById('collectionCards');if(!el)return;
    const colColors={'Comper':'var(--accent)','Lead Manager':'var(--accent4)','Acquisition':'var(--accent)','Follow Up Specialist':'var(--accent3)','Dispositions':'var(--accent2)'};
    const caMap={'Comper':'ca-green','Lead Manager':'ca-yellow','Acquisition':'ca-green','Follow Up Specialist':'ca-purple','Dispositions':'ca-orange'};
    // Only show active pipeline collections (exclude imported/other)
    const activeEntries = Object.entries(collections).filter(([k,v])=>v>0 && k!=='Imported / Other');
    el.innerHTML = activeEntries.map(([k,v])=>`
      <div class="card card-accent-tl ${caMap[k]||''}">
        <div class="card-label">${k}</div>
        <div class="card-value" style="color:${colColors[k]||'var(--text)'}">${v.toLocaleString()}</div>
        <div class="card-sub">${total?Math.round(v/total*100):0}% of active pipeline</div>
      </div>`).join('') + `
      <div class="card" style="border-color:rgba(255,255,255,0.04)">
        <div class="card-label">Active pipeline total</div>
        <div class="card-value" style="color:var(--text)">${total.toLocaleString()}</div>
        <div class="card-sub">working stages only</div>
      </div>`;
  }
  function renderBarChart(elId,data,colors) {
    const el=document.getElementById(elId);if(!el)return;
    const max=Math.max(...data.map(([,v])=>v),1);
    el.innerHTML=data.map(([label,count],i)=>`<div class="bar-row"><div class="label" style="font-size:10px">${label.length>14?label.slice(0,14)+'…':label}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.round(count/max*100)}%;background:${colors[i%colors.length]}"></div></div><div class="count">${count.toLocaleString()}</div></div>`).join('');
  }
  function renderConcerns(concerns) {
    const el=document.getElementById('concernList');if(!el)return;
    const sorted=Object.entries(concerns).sort((a,b)=>b[1]-a[1]);
    const max=Math.max(...sorted.map(([,v])=>v),1);
    const colors=['var(--accent2)','var(--accent4)','var(--accent3)','var(--accent)','var(--danger)','var(--accent)','var(--accent2)','var(--accent3)'];
    el.innerHTML=sorted.map(([label,count],i)=>`<div class="concern-item"><div class="concern-left"><div class="concern-rank">${String(i+1).padStart(2,'0')}</div><div class="concern-name">${label}</div></div><div style="display:flex;align-items:center;gap:10px"><div class="concern-bar-mini"><div class="concern-bar-fill" style="width:${Math.round(count/max*100)}%;background:${colors[i%colors.length]}"></div></div><div class="concern-pct" style="color:${colors[i%colors.length]}">${count}</div></div></div>`).join('');
  }
  function renderCallThemes(ins) {
    const el=document.getElementById('callThemes');if(!el)return;
    if(!ins.topThemes.length){el.innerHTML='<div style="color:var(--muted);font-size:11px">No call summaries found</div>';return;}
    el.innerHTML=`<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">${ins.topThemes.map(([t,c])=>`<span class="pill pill-green">${t} <strong>${c}</strong></span>`).join('')}</div>${ins.pricePoints.length?`<div style="display:flex;flex-wrap:wrap;gap:5px">${ins.pricePoints.slice(0,6).map(p=>`<span class="pill pill-yellow">${p}</span>`).join('')}</div>`:''}`;
  }
  function renderMotivatorBars(concerns) {
    const el=document.getElementById('motivatorBars');if(!el)return;
    const top=Object.entries(concerns).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const max=Math.max(...top.map(([,v])=>v),1);
    const colors=['var(--accent)','var(--accent4)','var(--accent3)','var(--accent2)','var(--danger)'];
    el.innerHTML=top.map(([label,count],i)=>`<div class="bar-row"><div class="label" style="font-size:10px">${label.length>12?label.slice(0,12)+'…':label}</div><div class="bar-track" style="height:10px"><div class="bar-fill" style="width:${Math.round(count/max*100)}%;background:${colors[i]};height:100%"></div></div><div class="count">${count}</div></div>`).join('');
  }
  function renderLeadsTable(people) {
    const el=document.getElementById('leadsTable');if(!el)return;
    if(!people.length){el.innerHTML=`<div class="ph">No leads for selected filters</div>`;return;}
    const rows=people.slice(0,50).map(p=>{
      const fc=firstCallMap[p.id];
      const mins=fc?Math.round((fc-new Date(p.created).getTime())/60000):null;
      const cls=mins===null?'spd-slow':mins<=5?'spd-fast':mins<=60?'spd-med':'spd-slow';
      const name=[p.firstName,p.lastName].filter(Boolean).join(' ')||'Unknown';
      const motColor={'hot':'var(--accent)','warm':'var(--accent4)','nurture':'var(--accent3)','cold':'var(--muted)'}[FUB.motLevel(p)];
      return`<tr><td style="color:var(--text)">${name}</td><td style="color:var(--muted)">${new Date(p.created).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</td><td style="color:var(--muted)">${p.source||'—'}</td><td><span style="color:${motColor};font-size:11px">${p.stage||'—'}</span></td><td><span class="spd ${cls}">${mins===null?'No call':FUB.fmtMins(mins)}</span></td><td style="color:var(--muted);font-size:10px">${p.lastNote?p.lastNote.slice(0,50)+'…':''}</td></tr>`;
    }).join('');
    el.innerHTML=`<table class="leads-table"><thead><tr><th>Lead</th><th>Added</th><th>Source</th><th>Stage</th><th>Speed to first call</th><th>Last note</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function filterLeads(q) {
    const people=filtered?filtered.people:[];
    if(!q.trim()){renderLeadsTable(people);return;}
    renderLeadsTable(people.filter(p=>[p.firstName,p.lastName,p.source,p.stage,p.lastNote].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase())));
  }
  function resetFilters() {
    const m=document.getElementById('filterMonth'), a=document.getElementById('filterAgent');
    if(m)m.value=''; if(a)a.value='';
    applyFilters();
  }
  async function manualSync() {
    const s=document.getElementById('syncStatus');
    if(s)s.textContent='Syncing...';
    await fetch('/api/cache/sync',{method:'POST'});
    setTimeout(loadDashboard,5000);
  }
  function runAI() {
    if(!filtered)return;
    const {people,calls,notes,appointments,users}=filtered;
    const speed=FUB.speedToDialStats(people,firstCallMap);
    const contacted=Object.keys(firstCallMap).length;
    const mot=FUB.motivationBreakdown(people);
    const concerns=FUB.parseConcerns(people,notes);
    const callInsights=FUB.extractCallInsights(notes);
    const agents=FUB.agentPerformance(calls,appointments,notes,users,people,firstCallMap,999);
    const vol=FUB.callVolumeByDay(calls,14);
    const stages=FUB.stageBreakdown(people);
    const sources=FUB.sourceBreakdown(people);
    const collections=FUB.collectionBreakdown(people);
    AI.getInsights({
      avgMins:speed.avg,under5:speed.under5,under60:speed.under60,notCalled:speed.notCalled,
      newLeads:people.length,totalPeople:rawData?.totalPeople||people.length,
      contacted,appts:appointments.length,totalCalls:calls.length,
      mot,concerns,callInsights,callCounts:vol.counts,labels:vol.labels,
      topStages:stages.slice(0,6),topSources:sources.slice(0,4),
      collections,topAgents:agents.slice(0,5),
    });
  }

  document.addEventListener('DOMContentLoaded', loadDashboard);
  return { applyFilters, filterLeads, manualSync, runAI, resetFilters };
})();
