const Charts = (() => {
  let callChart = null, funnelChart = null, motChart = null;

  function renderCallVolume(labels, counts) {
    if (callChart) callChart.destroy();
    const ctx = document.getElementById("callChart");
    if (!ctx) return;
    callChart = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{ label: "Calls", data: counts, backgroundColor: "#e8d5a3", borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#5a5754", font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#5a5754", stepSize: 1, font: { size: 11 } } },
        },
      },
    });
  }

  function renderFunnel(newLeads, contacted, appts) {
    if (funnelChart) funnelChart.destroy();
    const ctx = document.getElementById("funnelChart");
    if (!ctx) return;
    funnelChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["New leads", "Contacted", "Appts set"],
        datasets: [{ data: [newLeads, contacted, appts], backgroundColor: ["rgba(232,213,163,0.7)","rgba(232,213,163,0.45)","rgba(232,213,163,0.25)"], borderRadius: 4 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#5a5754", font: { size: 11 }, stepSize: 1 } },
          y: { grid: { display: false }, ticks: { color: "#5a5754", font: { size: 12 } } },
        },
      },
    });
  }

  function renderMotivation(mot) {
    if (motChart) motChart.destroy();
    const ctx = document.getElementById("motChart");
    if (!ctx) return;
    motChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Hot","Warm","Nurturing","Cold"],
        datasets: [{ data: [mot.hot, mot.warm, mot.nurture, mot.cold], backgroundColor: ["#e8614a","#e8a84a","#4aaa7a","#5a8ab0"], borderWidth: 0, hoverOffset: 4 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "68%",
        plugins: { legend: { display: true, position: "bottom", labels: { color: "#5a5754", font: { size: 11 }, boxWidth: 10, padding: 12 } } },
      },
    });
  }

  return { renderCallVolume, renderFunnel, renderMotivation };
})();
