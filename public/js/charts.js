const Charts = (() => {
  let callChart=null, funnelChart=null, motChart=null, stageChart=null, colChart=null;

  const C = {
    accent:"#e8d5a3", hot:"#e8614a", warm:"#e8a84a", nurture:"#4aaa7a", cold:"#5a8ab0",
    grid:"rgba(255,255,255,0.05)", tick:"#5a5754",
  };

  function renderCallVolume(labels, counts) {
    if (callChart) callChart.destroy();
    const ctx = document.getElementById("callChart"); if (!ctx) return;
    callChart = new Chart(ctx, {
      type:"bar",
      data:{ labels, datasets:[{ data:counts, backgroundColor:C.accent, borderRadius:4 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
        scales:{ x:{grid:{display:false},ticks:{color:C.tick,font:{size:11}}},
                 y:{beginAtZero:true,grid:{color:C.grid},ticks:{color:C.tick,stepSize:1,font:{size:11}}} } },
    });
  }

  function renderFunnel(leads, contacted, appts) {
    if (funnelChart) funnelChart.destroy();
    const ctx = document.getElementById("funnelChart"); if (!ctx) return;
    funnelChart = new Chart(ctx, {
      type:"bar",
      data:{ labels:["New leads","Contacted","Appts set"],
        datasets:[{ data:[leads,contacted,appts], backgroundColor:["rgba(232,213,163,0.8)","rgba(74,170,122,0.7)","rgba(232,97,74,0.8)"], borderRadius:4 }] },
      options:{ responsive:true, maintainAspectRatio:false, indexAxis:"y", plugins:{legend:{display:false}},
        scales:{ x:{grid:{color:C.grid},ticks:{color:C.tick,font:{size:11}}},
                 y:{grid:{display:false},ticks:{color:C.tick,font:{size:12}}} } },
    });
  }

  function renderMotivation(mot) {
    if (motChart) motChart.destroy();
    const ctx = document.getElementById("motChart"); if (!ctx) return;
    motChart = new Chart(ctx, {
      type:"doughnut",
      data:{ labels:["Hot","Warm","Nurture","Cold"],
        datasets:[{ data:[mot.hot,mot.warm,mot.nurture,mot.cold], backgroundColor:[C.hot,C.warm,C.nurture,C.cold], borderWidth:0, hoverOffset:4 }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:"68%",
        plugins:{ legend:{ display:true, position:"bottom", labels:{ color:"#9a9690", font:{size:11}, boxWidth:10, padding:12 } } } },
    });
  }

  function renderCollections(collections) {
    if (colChart) colChart.destroy();
    const ctx = document.getElementById("colChart"); if (!ctx) return;
    const colColors = { "Comper":"#5a8ab0","Lead Manager":"#e8a84a","Acquisition":"#4aaa7a","Follow Up Specialist":"#e8d5a3","Dispositions":"#aa7ab0","Other":"#888" };
    const entries = Object.entries(collections).sort((a,b)=>b[1]-a[1]);
    colChart = new Chart(ctx, {
      type:"doughnut",
      data:{ labels:entries.map(([k])=>k), datasets:[{ data:entries.map(([,v])=>v), backgroundColor:entries.map(([k])=>colColors[k]||"#888"), borderWidth:0, hoverOffset:4 }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:"60%",
        plugins:{ legend:{ display:true, position:"bottom", labels:{ color:"#9a9690", font:{size:11}, boxWidth:10, padding:10 } } } },
    });
  }

  function renderStages(stages) {
    if (stageChart) stageChart.destroy();
    const ctx = document.getElementById("stageChart"); if (!ctx) return;
    const colors = ["#e8d5a3","#4aaa7a","#5a8ab0","#e8614a","#e8a84a","#aa7ab0","#b07a5a","#7a9ab0","#5dcaa5","#d4537e"];
    stageChart = new Chart(ctx, {
      type:"bar",
      data:{ labels:stages.map(([s])=>s.length>24?s.slice(0,24)+"…":s),
        datasets:[{ data:stages.map(([,v])=>v), backgroundColor:stages.map((_,i)=>colors[i%colors.length]), borderRadius:4 }] },
      options:{ responsive:true, maintainAspectRatio:false, indexAxis:"y", plugins:{legend:{display:false}},
        scales:{ x:{grid:{color:C.grid},ticks:{color:C.tick,font:{size:11}}},
                 y:{grid:{display:false},ticks:{color:"#9a9690",font:{size:11}}} } },
    });
  }

  return { renderCallVolume, renderFunnel, renderMotivation, renderCollections, renderStages };
})();
