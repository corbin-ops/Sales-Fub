/**
 * charts.js
 * ─────────────────────────────────────────────
 * All Chart.js chart rendering.
 */

const Charts = (() => {
  let callChart = null;
  let funnelChart = null;
  let motChart = null;

  const CHART_COLORS = {
    accent: '#e8d5a3',
    hot: '#e8614a',
    warm: '#e8a84a',
    nurture: '#4aaa7a',
    cold: '#5a8ab0',
    grid: 'rgba(255,255,255,0.05)',
    tick: '#5a5754',
  };

  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
  };

  function destroyAll() {
    [callChart, funnelChart, motChart].forEach(c => { if (c) c.destroy(); });
  }

  function renderCallVolume(labels, counts) {
    if (callChart) callChart.destroy();
    const ctx = document.getElementById('callChart');
    if (!ctx) return;
    callChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Calls',
          data: counts,
          backgroundColor: CHART_COLORS.accent,
          borderRadius: 4,
          borderSkipped: false,
        }]
      },
      options: {
        ...baseOptions,
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: CHART_COLORS.tick, font: { size: 11 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: CHART_COLORS.grid },
            ticks: {
              color: CHART_COLORS.tick,
              font: { size: 11 },
              stepSize: 1,
            },
          }
        }
      }
    });
  }

  function renderFunnel(newLeads, contacted, appts) {
    if (funnelChart) funnelChart.destroy();
    const ctx = document.getElementById('funnelChart');
    if (!ctx) return;
    funnelChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['New leads', 'Contacted', 'Appts set'],
        datasets: [{
          label: 'Count',
          data: [newLeads, contacted, appts],
          backgroundColor: [
            'rgba(232,213,163,0.7)',
            'rgba(232,213,163,0.45)',
            'rgba(232,213,163,0.25)',
          ],
          borderRadius: 4,
          borderSkipped: false,
        }]
      },
      options: {
        ...baseOptions,
        indexAxis: 'y',
        scales: {
          x: {
            grid: { color: CHART_COLORS.grid },
            ticks: { color: CHART_COLORS.tick, font: { size: 11 }, stepSize: 1 },
          },
          y: {
            grid: { display: false },
            ticks: { color: CHART_COLORS.tick, font: { size: 12 } },
          }
        }
      }
    });
  }

  function renderMotivation(mot) {
    if (motChart) motChart.destroy();
    const ctx = document.getElementById('motChart');
    if (!ctx) return;
    motChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Hot', 'Warm', 'Nurturing', 'Cold'],
        datasets: [{
          data: [mot.hot, mot.warm, mot.nurture, mot.cold],
          backgroundColor: [
            CHART_COLORS.hot,
            CHART_COLORS.warm,
            CHART_COLORS.nurture,
            CHART_COLORS.cold,
          ],
          borderWidth: 0,
          hoverOffset: 4,
        }]
      },
      options: {
        ...baseOptions,
        cutout: '68%',
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              color: CHART_COLORS.tick,
              font: { size: 11 },
              boxWidth: 10,
              padding: 12,
            }
          }
        }
      }
    });
  }

  return { renderCallVolume, renderFunnel, renderMotivation, destroyAll };
})();
