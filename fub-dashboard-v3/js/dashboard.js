/**
 * dashboard.js
 * ─────────────────────────────────────────────
 * Main controller — wires FUB data to the UI.
 */

const Dashboard = (() => {

  let dashData = null;
  let allLeads = [];
  let firstCallMap = {};

  // ── Navigation ──────────────────────────────
  function initNav() {
    const items = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.section');
    const title = document.getElementById('pageTitle');

    const sectionTitles = {
      speed: 'Speed to dial',
      performance: 'Sales performance',
      motivation: 'Client motivation',
      concerns: 'Concerns & objections',
      leads: 'Recent leads',
      ai: 'AI coach',
    };

    items.forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        const id = item.dataset.section;
        items.forEach(i => i.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));
        item.classList.add('active');
        document.getElementById(id)?.classList.add('active');
        if (title) title.textContent = sectionTitles[id] || '';
      });
    });
  }

  // ── Status helpers ───────────────────────────
  function setStatus(state, msg) {
    const dot = document.getElementById('dot');
    const stxt = document.getElementById('statusText');
    if (dot) dot.className = 'dot ' + (state === 'live' ? 'live' : state === 'err' ? 'err' : state === 'loading' ? 'loading' : '');
    if (stxt) stxt.textContent = msg;
  }

  function setMetric(id, value, colorClass) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value;
    if (colorClass) {
      el.className = el.className.replace(/\bgood\b|\bwarn\b|\bbad\b/g, '').trim();
      el.classList.add(colorClass);
    }
  }

  // ── Main load ────────────────────────────────
  async function load() {
    const apiKey = document.getElementById('apiKey')?.value.trim() || CONFIG.FUB_API_KEY;
    if (!apiKey) { alert('Please enter your Follow Up Boss API key.'); return; }

    const btn = document.getElementById('connectBtn');
    const btnText = document.getElementById('btnText');
    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = 'Loading...';
    setStatus('loading', 'Fetching data...');

    try {
      const { people, events } = await FUB.fetchAll(apiKey);
      const callEvents = FUB.getCallEvents(events);
      firstCallMap = FUB.buildFirstCallMap(callEvents);

      const recent = FUB.recentLeads(people, CONFIG.LOOKBACK_DAYS);
      allLeads = recent;

      // Speed to dial
      const speed = FUB.speedToDialStats(recent, firstCallMap);
      setMetric('avgSpeed', speed.avg !== null ? speed.avg + ' min' : 'N/A',
        speed.avg === null ? '' : speed.avg <= CONFIG.SPEED_EXCELLENT ? 'good' : speed.avg <= CONFIG.SPEED_GOOD ? 'warn' : 'bad');
      const bar = document.getElementById('avgSpeedBar');
      if (bar && speed.avg !== null) {
        const pct = Math.min(100, Math.round((speed.avg / 120) * 100));
        bar.style.width = pct + '%';
      }
      setMetric('u5', speed.under5);
      setMetric('u60', speed.under60);
      setMetric('notCalled', speed.notCalled,
        speed.notCalled === 0 ? 'good' : speed.notCalled <= 3 ? 'warn' : 'bad');

      // Performance
      const contacted = Object.keys(firstCallMap).length;
      const appts = FUB.appointmentCount(people);
      setMetric('newLeads', recent.length);
      setMetric('contacted', contacted);
      setMetric('appts', appts);
      setMetric('cRate', recent.length ? Math.round(contacted / recent.length * 100) + '%' : '—');
      setMetric('aRate', contacted ? Math.round(appts / contacted * 100) + '%' : '—');

      // Motivation
      const mot = FUB.motivationBreakdown(people);
      renderMotivation(mot);

      // Concerns
      const concerns = FUB.parseConcerns(people);
      renderConcerns(concerns);

      // Leads table
      renderLeadsTable(recent);

      // Charts
      const vol = FUB.callVolumeByDay(callEvents, CONFIG.LOOKBACK_DAYS);
      Charts.renderCallVolume(vol.labels, vol.counts);
      Charts.renderFunnel(recent.length, contacted, appts);
      Charts.renderMotivation(mot);

      // Store data for AI
      dashData = {
        avg: speed.avg, under5: speed.under5, under60: speed.under60,
        notCalled: speed.notCalled, newLeads: recent.length, contacted, appts,
        mot, concerns, callCounts: vol.counts, labels: vol.labels,
      };

      // Update status
      const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      document.getElementById('lastUpdated').textContent = 'Updated ' + now;
      setStatus('live', people.length + ' leads loaded');
      if (btn) btn.disabled = false;
      if (btnText) btnText.textContent = 'Refresh';

      // Auto-run AI
      runAI();

    } catch (err) {
      setStatus('err', 'Error — check API key');
      if (btn) btn.disabled = false;
      if (btnText) btnText.textContent = 'Connect';
      console.error('Dashboard error:', err);
      alert('Connection failed: ' + err.message);
    }
  }

  // ── Render motivation list ───────────────────
  function renderMotivation(mot) {
    const total = Object.values(mot).reduce((a, b) => a + b, 1);
    const cfg = {
      hot: ['Hot — ready now', 'hot'],
      warm: ['Warm — engaged', 'warm'],
      nurture: ['Nurturing', 'nurture'],
      cold: ['Cold / inactive', 'cold'],
    };
    const html = Object.entries(mot)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `
        <div class="mot-row">
          <span class="mot-label">${cfg[k][0]}</span>
          <span class="mot-count">${v}</span>
          <span class="badge ${cfg[k][1]}">${Math.round(v / total * 100)}%</span>
        </div>`)
      .join('');
    document.getElementById('motList').innerHTML = html || '<div class="placeholder">No data</div>';
  }

  // ── Render concerns ──────────────────────────
  function renderConcerns(concerns) {
    const sorted = Object.entries(concerns).sort((a, b) => b[1] - a[1]);
    const maxC = Math.max(...sorted.map(([, v]) => v), 1);
    const colors = ['#e8614a', '#e8a84a', '#e8d5a3', '#4aaa7a', '#5a8ab0', '#b07a5a', '#aa7ab0', '#7a9ab0'];
    const html = sorted.map(([label, count], i) => `
      <div class="concern-row">
        <span class="concern-label">${label}</span>
        <div class="concern-bar-bg">
          <div class="concern-bar" style="width:${Math.round(count / maxC * 100)}%;background:${colors[i % colors.length]}"></div>
        </div>
        <span class="concern-count">${count}</span>
      </div>`).join('');
    document.getElementById('conList').innerHTML = html || '<div class="placeholder">No concern data found in notes</div>';
  }

  // ── Render leads table ───────────────────────
  function renderLeadsTable(leads) {
    if (!leads.length) {
      document.getElementById('leadsTable').innerHTML = '<div class="placeholder">No leads in the last ' + CONFIG.LOOKBACK_DAYS + ' days</div>';
      return;
    }
    const rows = leads.slice(0, 20).map(p => {
      const fc = firstCallMap[p.id];
      const mins = fc ? Math.round((fc - new Date(p.created).getTime()) / 60000) : null;
      const sp = FUB.speedLabel(mins);
      const name = [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Unknown';
      const created = new Date(p.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `<tr>
        <td style="width:28%">${name}</td>
        <td style="width:18%;color:#9a9690">${created}</td>
        <td style="width:22%;color:#9a9690">${p.source || '—'}</td>
        <td style="width:20%;color:#9a9690">${p.stage || '—'}</td>
        <td style="width:12%"><span class="speed-badge ${sp.cls}">${sp.text}</span></td>
      </tr>`;
    }).join('');
    document.getElementById('leadsTable').innerHTML = `
      <table class="leads-table">
        <thead>
          <tr>
            <th style="width:28%">Lead</th>
            <th style="width:18%">Added</th>
            <th style="width:22%">Source</th>
            <th style="width:20%">Stage</th>
            <th style="width:12%">Speed</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ── Filter leads by search ───────────────────
  function filterLeads(query) {
    if (!query.trim()) { renderLeadsTable(allLeads); return; }
    const q = query.toLowerCase();
    const filtered = allLeads.filter(p => {
      const name = [p.firstName, p.lastName].filter(Boolean).join(' ').toLowerCase();
      return name.includes(q) || (p.source || '').toLowerCase().includes(q) || (p.stage || '').toLowerCase().includes(q);
    });
    renderLeadsTable(filtered);
  }

  // ── AI insights ──────────────────────────────
  function runAI() {
    if (!dashData) {
      document.getElementById('aiInsights').innerHTML = '<span class="ai-placeholder">Connect FUB first to generate insights.</span>';
      return;
    }
    AI.getInsights(dashData);
  }

  // ── Init ─────────────────────────────────────
  function init() {
    initNav();
    if (CONFIG.FUB_API_KEY) {
      document.getElementById('apiKey').value = CONFIG.FUB_API_KEY;
      load();
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  return { load, runAI, filterLeads };
})();
