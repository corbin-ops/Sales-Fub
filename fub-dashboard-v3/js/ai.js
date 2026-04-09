/**
 * ai.js
 * ─────────────────────────────────────────────
 * Claude AI coaching integration.
 * Sends FUB data summary to Claude and streams back insights.
 */

const AI = (() => {

  const SYSTEM_PROMPT = `You are an expert real estate ISA (Inside Sales Agent) coach. You analyze Follow Up Boss CRM data and give sharp, actionable coaching insights. You understand real estate sales, lead nurturing, speed to dial best practices (5-minute rule), and common buyer/seller objections. Your tone is direct, specific, and motivating — like a great sales manager doing a morning huddle. Keep it tight and practical.

Format your response as plain text in these 4 sections:
1. Speed to dial read — what the numbers mean for conversion
2. Biggest opportunity or red flag right now
3. One specific action for TODAY
4. How to handle the top concern on the next call

No markdown, no bullet symbols, no asterisks. Use short paragraphs. Be specific to the data.`;

  function buildPrompt(data) {
    const { avg, under5, under60, notCalled, newLeads, contacted, appts, mot, concerns, callCounts, labels } = data;
    const contactRate = newLeads ? Math.round(contacted / newLeads * 100) : 0;
    const apptRate = contacted ? Math.round(appts / contacted * 100) : 0;
    const topConcerns = Object.entries(concerns).sort((a, b) => b[1] - a[1]).slice(0, 4);

    return `Here is today's FUB sales dashboard data:

SPEED TO DIAL
- Average: ${avg !== null ? avg + ' minutes' : 'no calls recorded yet'}
- Called under 5 minutes: ${under5} leads
- Called under 1 hour: ${under60} leads  
- Not yet called: ${notCalled} leads

SALES PERFORMANCE (last 7 days)
- New leads: ${newLeads}
- Contacts made: ${contacted}
- Appointments set: ${appts}
- Contact rate: ${contactRate}%
- Appointment-to-contact rate: ${apptRate}%

CLIENT MOTIVATION BREAKDOWN
- Hot (ready now): ${mot.hot}
- Warm (engaged): ${mot.warm}
- Nurturing: ${mot.nurture}
- Cold/inactive: ${mot.cold}

TOP CONCERNS FROM NOTES
${topConcerns.map(([k, v]) => `- ${k}: ${v} leads`).join('\n')}

CALL VOLUME (last 7 days)
${labels.map((l, i) => `${l}: ${callCounts[i]} calls`).join(', ')}

Give me your coaching read on this data.`;
  }

  async function getInsights(dashData) {
    const el = document.getElementById('aiInsights');
    el.innerHTML = '<span class="ai-thinking">Analyzing your data...</span>';

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: CONFIG.CLAUDE_MODEL,
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildPrompt(dashData) }]
        })
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `Claude API ${resp.status}`);
      }

      const data = await resp.json();
      const text = data.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');

      el.textContent = text;
    } catch (err) {
      el.innerHTML = `<span style="color:#e8614a">Could not generate insights: ${err.message}</span>`;
      console.error('AI error:', err);
    }
  }

  return { getInsights };
})();
