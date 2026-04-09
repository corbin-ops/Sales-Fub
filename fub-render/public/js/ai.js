const AI = (() => {
  const SYSTEM_PROMPT = `You are an expert real estate ISA coach. Analyze Follow Up Boss CRM data and give sharp, actionable coaching. Be direct, specific, and motivating. No markdown, no bullet symbols. Use short paragraphs. Cover: speed to dial performance, biggest opportunity or red flag, one action for TODAY, how to handle the top concern on the next call.`;

  function buildPrompt(d) {
    const contactRate = d.newLeads ? Math.round(d.contacted / d.newLeads * 100) : 0;
    const apptRate = d.contacted ? Math.round(d.appts / d.contacted * 100) : 0;
    return `FUB DASHBOARD DATA:

SPEED TO DIAL
- Avg: ${d.avg !== null ? d.avg + " min" : "no calls recorded"}
- Called under 5 min: ${d.under5}
- Called under 1 hour: ${d.under60}
- Not yet called: ${d.notCalled}

PERFORMANCE (last 7 days)
- New leads: ${d.newLeads}
- Contacts: ${d.contacted} (${contactRate}% rate)
- Appointments: ${d.appts} (${apptRate}% of contacts)

MOTIVATION
- Hot: ${d.mot.hot} | Warm: ${d.mot.warm} | Nurturing: ${d.mot.nurture} | Cold: ${d.mot.cold}

TOP CONCERNS
${Object.entries(d.concerns).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,v])=>`- ${k}: ${v}`).join("\n")}

CALL VOLUME
${d.labels.map((l,i)=>l+": "+d.callCounts[i]).join(", ")}`;
  }

  async function getInsights(dashData) {
    const el = document.getElementById("aiInsights");
    el.innerHTML = '<span class="ai-thinking">Analyzing your data...</span>';
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CONFIG.CLAUDE_MODEL,
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildPrompt(dashData) }],
        }),
      });
      if (!resp.ok) throw new Error("Claude API " + resp.status);
      const data = await resp.json();
      el.textContent = data.content.filter(b => b.type === "text").map(b => b.text).join("");
    } catch (err) {
      el.innerHTML = `<span style="color:#e8614a">Could not generate insights: ${err.message}</span>`;
    }
  }

  return { getInsights };
})();
