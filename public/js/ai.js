const AI = (() => {
  const SYSTEM_PROMPT = `You are a high-performance real estate acquisitions coach for a land buying team. You have access to their complete Follow Up Boss CRM data including call summaries, agent performance, pipeline stage breakdowns, and lead concerns. Give direct, actionable coaching. No markdown, no bullets. Short punchy paragraphs. Focus on: what the numbers reveal, where the money is hiding in the pipeline, which agents need coaching, and the one move that will have the biggest impact today.`;

  function buildPrompt(d) {
    const cRate = d.newLeads ? Math.round(d.contacted / d.newLeads * 100) : 0;
    const aRate = d.contacted ? Math.round(d.appts / d.contacted * 100) : 0;

    const agentRows = (d.topAgents || []).map(a =>
      `  ${a.name}: ${a.calls} calls, ${a.appts} appts, avg speed ${FUB.fmtMins ? FUB.fmtMins(a.avgSpeed) : (a.avgSpeed + 'm')}, connect rate ${a.calls ? Math.round(a.connects / a.calls * 100) : 0}%`
    ).join("\n");

    const stageRows = (d.topStages || []).map(([s, v]) => `  ${s}: ${v.toLocaleString()}`).join("\n");
    const collectionRows = Object.entries(d.collections || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v.toLocaleString()}`).join("\n");
    const concernRows = Object.entries(d.concerns || {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `  ${k}: ${v}`).join("\n");
    const themeRows = (d.callInsights?.topThemes || []).map(([t, c]) => `  "${t}" mentioned ${c}x`).join("\n");
    const priceRows = (d.callInsights?.pricePoints || []).slice(0, 5).join(", ");

    return `FULL FUB ACCOUNT — DEWCLAW LAND (last ${CONFIG.LOOKBACK_DAYS} days):

DATABASE
- Total contacts: ${(d.totalPeople || 0).toLocaleString()}
- New leads: ${d.newLeads}
- Contacts made: ${d.contacted} (${cRate}% contact rate)
- Appointments set: ${d.appts} (${aRate}% of contacts)
- Total calls logged: ${(d.totalCalls || 0).toLocaleString()}

SPEED TO DIAL
- Avg speed to first call: ${d.avgMins !== null ? (d.avgMins >= 60 ? Math.floor(d.avgMins / 60) + 'h ' + d.avgMins % 60 + 'm' : d.avgMins + ' min') : 'no data'}
- Called under 5 min: ${d.under5}
- Called under 1 hour: ${d.under60}
- Not yet called: ${d.notCalled}

MOTIVATION PIPELINE
- Hot (motivated/booked/contract): ${d.mot.hot.toLocaleString()}
- Warm (engaged/value add): ${d.mot.warm.toLocaleString()}
- Nurture (LTFU/not ready/price rejected): ${d.mot.nurture.toLocaleString()}
- Cold (unmotivated/dead/removed): ${d.mot.cold.toLocaleString()}

SMART LIST COLLECTIONS
${collectionRows}

TOP STAGES
${stageRows}

AGENT PERFORMANCE
${agentRows || "  No agent data available"}

TOP OBJECTIONS FROM NOTES
${concernRows}

CALL SUMMARY THEMES
${themeRows || "  No call summaries found"}

PRICE POINTS MENTIONED IN CALLS
${priceRows || "None detected"}

Give me: (1) the most urgent thing to act on today, (2) which stage or agent needs immediate attention, (3) what the call summaries reveal about seller motivations, (4) one pipeline move that could unlock a deal this week.`;
  }

  async function getInsights(dashData) {
    const el = document.getElementById("aiInsights");
    el.innerHTML = '<span class="ai-thinking">Analyzing your full pipeline...</span>';

    try {
      // Call our server proxy — avoids browser CORS with Anthropic
      const resp = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CONFIG.CLAUDE_MODEL,
          max_tokens: 1200,
          system: SYSTEM_PROMPT,
          prompt: buildPrompt(dashData),
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Claude API " + resp.status);
      }

      const data = await resp.json();
      const text = data.content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("");

      el.textContent = text;
    } catch (err) {
      el.innerHTML = `<span style="color:var(--danger)">Could not generate insights: ${err.message}</span>`;
    }
  }

  return { getInsights };
})();
