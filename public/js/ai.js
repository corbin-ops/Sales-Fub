const AI = (() => {

  const SYSTEM = `You are an elite real estate acquisitions coach for DewClaw Land, a land buying company. You have deep knowledge of land acquisitions, seller psychology, and ISA (Inside Sales Agent) performance.

Team structure:
- Marie Emara (ISA, hired Feb 2026) — qualifies leads, books appointments. This is her first months on the job.
- Taa — Texter, pushes leads to Marie
- Corbin — Acquisition, takes booked appointments from Marie and closes
- Hugo — Disposition, works with lenders on deals
- Emma — Comper

Your coaching style:
- Be a mentor, not a critic. Marie is new — encourage growth while identifying specific improvements.
- Give concrete, actionable advice with specific scripts or tactics
- Compare this month vs last month to identify trends
- Celebrate wins and progress
- Focus on what will actually move the needle for a land acquisitions business
- Keep it conversational and direct — no corporate speak
- Structure: 3-4 paragraphs max. No bullet lists. No markdown headers.`;

  function buildPrompt(d) {
    const {
      current, previous, ytd,
      agents, concerns, callInsights, collections, topStages,
    } = d;

    const fmt = v => v !== null && v !== undefined ? v : '—';
    const fmtSpd = mins => {
      if (mins === null || mins === undefined) return '—';
      if (mins < 60) return mins + 'm';
      return Math.floor(mins/60) + 'h ' + (mins%60) + 'm';
    };
    const pct = (a, b) => b ? Math.round(a/b*100) + '%' : '—';
    const delta = (cur, prev) => {
      if (cur === null || prev === null || prev === 0) return '';
      const d = Math.round((cur - prev) / prev * 100);
      return d > 0 ? ` (↑${d}% vs last month)` : d < 0 ? ` (↓${Math.abs(d)}% vs last month)` : ' (flat vs last month)';
    };

    const marieAgent = agents.find(a => a.name && a.name.toLowerCase().includes('marie'));
    const corbinAgent = agents.find(a => a.name && a.name.toLowerCase().includes('corbin'));

    return `DEWCLAW LAND — PERFORMANCE COACHING BRIEF
Generated: ${new Date().toLocaleDateString('en-US', {month:'long', day:'numeric', year:'numeric'})}

═══ THIS MONTH (${current.label}) ═══
New leads: ${fmt(current.newLeads)}
Calls made: ${fmt(current.calls)}
Connected calls (>30s): ${fmt(current.connected)}
Connect rate: ${pct(current.connected, current.calls)}
Appointments set: ${fmt(current.appts)}
Avg speed to first call: ${fmtSpd(current.avgSpeed)}
Called under 5 min: ${fmt(current.under5)} (${pct(current.under5, current.newLeads)} of leads)
Not yet called: ${fmt(current.notCalled)}
Talk time: ${fmtSpd(current.talkMins)}
Notes written: ${fmt(current.notes)}
Conversion rate: ${pct(current.appts, current.newLeads)}

═══ LAST MONTH (${previous.label}) ═══
New leads: ${fmt(previous.newLeads)}
Calls made: ${fmt(previous.calls)}
Appointments set: ${fmt(previous.appts)}
Avg speed to first call: ${fmtSpd(previous.avgSpeed)}
Connect rate: ${pct(previous.connected, previous.calls)}
Conversion rate: ${pct(previous.appts, previous.newLeads)}

═══ YEAR TO DATE (2026) ═══
Total new leads: ${fmt(ytd.newLeads)}
Total calls: ${fmt(ytd.calls)}
Total appointments: ${fmt(ytd.appts)}
Overall conversion: ${pct(ytd.appts, ytd.newLeads)}
Avg speed to first call (YTD): ${fmtSpd(ytd.avgSpeed)}

═══ MONTH-OVER-MONTH TRENDS ═══
Leads: ${fmt(current.newLeads)} vs ${fmt(previous.newLeads)}${delta(current.newLeads, previous.newLeads)}
Calls: ${fmt(current.calls)} vs ${fmt(previous.calls)}${delta(current.calls, previous.calls)}
Appointments: ${fmt(current.appts)} vs ${fmt(previous.appts)}${delta(current.appts, previous.appts)}
Speed to first call: ${fmtSpd(current.avgSpeed)} vs ${fmtSpd(previous.avgSpeed)}
Connect rate: ${pct(current.connected, current.calls)} vs ${pct(previous.connected, previous.calls)}

═══ MARIE EMARA — ISA PERFORMANCE (hired Feb 2026) ═══
${marieAgent ? `Calls this period: ${marieAgent.calls}
Appointments set: ${marieAgent.appts}
Connect rate: ${marieAgent.calls ? Math.round(marieAgent.connects/marieAgent.calls*100)+'%' : '—'}
Avg speed to first call: ${fmtSpd(marieAgent.avgSpeed)}
Talk time: ${fmtSpd(marieAgent.totalCallMins)}
Notes written: ${marieAgent.notes}` : 'Marie data not available for this period'}

═══ CORBIN — ACQUISITION ═══
${corbinAgent ? `Appointments handled: ${corbinAgent.appts}
Calls: ${corbinAgent.calls}` : 'Corbin data not available for this period'}

═══ ACTIVE PIPELINE ═══
${Object.entries(collections).filter(([,v])=>v>0).map(([k,v])=>`${k}: ${v}`).join('\n')}

Top stages in pipeline:
${(topStages||[]).map(([s,v])=>`${s}: ${v}`).join('\n')}

═══ TOP SELLER OBJECTIONS (from call notes) ═══
${Object.entries(concerns||{}).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}: ${v} mentions`).join('\n')}

═══ CALL SUMMARY THEMES ═══
${(callInsights?.topThemes||[]).map(([t,c])=>`"${t}": ${c} mentions`).join('\n') || 'Limited call summary data'}
Price points mentioned: ${(callInsights?.pricePoints||[]).slice(0,5).join(', ') || 'none detected'}

Please give me a coaching brief covering:
1. Marie's progress as a new ISA — what's improving, what needs work, one specific script or tactic she should try
2. The most important trend this month vs last month — is the business moving in the right direction?
3. The biggest pipeline opportunity right now — where are deals hiding?
4. One concrete action for the team to take this week to move more land deals

Keep it warm, mentor-like, and specific to land acquisitions.`;
  }

  async function getInsights(dashData) {
    const el = document.getElementById('aiInsights');
    if (!el) return;

    // Check if we have enough data
    if (!dashData || !dashData.rawCalls) {
      el.innerHTML = '<span class="ai-thinking">Waiting for data to load...</span>';
      return;
    }

    el.innerHTML = '<span class="ai-thinking">Analyzing this month vs last month...</span>';

    try {
      // Build current month, last month, and YTD slices
      const now = new Date();
      const curYear = now.getFullYear();
      const curMonth = now.getMonth(); // 0-based

      const sliceByMonth = (calls, people, appts, notes, yr, mo) => {
        const start = new Date(yr, mo, 1).getTime();
        const end   = new Date(yr, mo+1, 1).getTime();
        const inRange = d => { const t = new Date(d).getTime(); return t >= start && t < end; };
        const mCalls  = calls.filter(c => inRange(c.created||c.createdAt||c.created_at));
        const mPeople = people.filter(p => inRange(p.created));
        const mAppts  = appts.filter(a => inRange(a.created||a.createdAt||a.startTime));
        const mNotes  = notes.filter(n => inRange(n.created||n.createdAt));
        const fcMap   = buildFirstCallMap(mCalls);
        const speeds  = mPeople.map(p => {
          const fc = fcMap[p.id];
          if (!fc) return null;
          const m = Math.round((fc - new Date(p.created).getTime()) / 60000);
          return m >= 0 && m < 10080 ? m : null;
        }).filter(m => m !== null);
        const connected = mCalls.filter(c => Number(c.duration||c.durationSeconds||0) > 30).length;
        const talkSecs = mCalls.reduce((s,c) => s + Number(c.duration||c.durationSeconds||0), 0);
        const notCalled = mPeople.filter(p => !fcMap[p.id]).length;
        const under5 = mPeople.filter(p => { const fc=fcMap[p.id]; if(!fc)return false; const m=Math.round((fc-new Date(p.created).getTime())/60000); return m>=0&&m<=5; }).length;
        return {
          newLeads: mPeople.length,
          calls: mCalls.length,
          connected,
          appts: mAppts.length,
          notes: mNotes.length,
          avgSpeed: speeds.length ? Math.round(speeds.reduce((a,b)=>a+b,0)/speeds.length) : null,
          talkMins: Math.round(talkSecs/60),
          notCalled, under5,
          label: new Date(yr, mo, 1).toLocaleDateString('en-US', {month:'long', year:'numeric'}),
        };
      };

      const ytdSlice = (calls, people, appts) => {
        const start = new Date(curYear, 0, 1).getTime();
        const end   = Date.now();
        const inRange = d => { const t = new Date(d).getTime(); return t >= start && t < end; };
        const mCalls  = calls.filter(c => inRange(c.created||c.createdAt||c.created_at));
        const mPeople = people.filter(p => inRange(p.created));
        const mAppts  = appts.filter(a => inRange(a.created||a.createdAt||a.startTime));
        const fcMap   = buildFirstCallMap(mCalls);
        const speeds  = mPeople.map(p => {
          const fc = fcMap[p.id];
          if (!fc) return null;
          const m = Math.round((fc - new Date(p.created).getTime()) / 60000);
          return m >= 0 && m < 10080 ? m : null;
        }).filter(m => m !== null);
        return {
          newLeads: mPeople.length,
          calls: mCalls.length,
          appts: mAppts.length,
          avgSpeed: speeds.length ? Math.round(speeds.reduce((a,b)=>a+b,0)/speeds.length) : null,
        };
      };

      const current  = sliceByMonth(dashData.rawCalls, dashData.rawPeople, dashData.rawAppts, dashData.rawNotes, curYear, curMonth);
      const prevMo   = curMonth === 0 ? 11 : curMonth - 1;
      const prevYr   = curMonth === 0 ? curYear - 1 : curYear;
      const previous = sliceByMonth(dashData.rawCalls, dashData.rawPeople, dashData.rawAppts, dashData.rawNotes, prevYr, prevMo);
      const ytd      = ytdSlice(dashData.rawCalls, dashData.rawPeople, dashData.rawAppts);

      const prompt = buildPrompt({
        current, previous, ytd,
        agents: dashData.agents || [],
        concerns: dashData.concerns || {},
        callInsights: dashData.callInsights || {},
        collections: dashData.collections || {},
        topStages: dashData.topStages || [],
      });

      const resp = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: CONFIG.CLAUDE_MODEL,
          max_tokens: 1500,
          system: SYSTEM,
          prompt,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Claude API ' + resp.status);
      }

      const data = await resp.json();
      const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
      el.textContent = text;

    } catch (err) {
      el.innerHTML = `<span style="color:var(--danger)">Could not generate insights: ${err.message}</span>`;
    }
  }

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

  return { getInsights };
})();
