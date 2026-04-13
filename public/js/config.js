const CONFIG = {
  PROXY_URL: "/api/fub",
  DASHBOARD_URL: "/api/fub/dashboard",
  SINCE_DATE: "2026-01-01",
  LOOKBACK_DAYS: Math.ceil((Date.now() - new Date("2026-01-01").getTime()) / 86400000),
  SPEED_EXCELLENT: 5,
  SPEED_GOOD: 30,  // Updated to 30min goal
  CLAUDE_MODEL: "claude-sonnet-4-20250514",

  // ── Team roles ──────────────────────────────────────────────────────────────
  TEAM: {
    "Marie Emara":  { role: "ISA / Lead Qualifier", color: "#00e5a0", goals: { appts: 9, talkMins: 150, dials: 80, speedMins: 30 } },
    "Taa":          { role: "Texter",                color: "#7c6eff", goals: { dials: 0, texts: 50 } },
    "Corbin":       { role: "Acquisition",           color: "#ffd166", goals: { appts: 3 } },
    "Hugo":         { role: "Disposition",           color: "#ff6b35", goals: {} },
    "Emma":         { role: "Comper",                color: "#5a8ab0", goals: {} },
  },

  // ── Your actual working pipeline stages (excluding bulk imported "Lead") ────
  // These are the stages your team actively works
  ACTIVE_STAGES: [
    // Lead Manager
    "New Leads [TEXT]", "New Leads [MAIL]", "New Lead - No Response", "Unmotivated - Price Request", "Call - Remove From List",
    // Acquisition
    "Booked Appt", "Warm", "Hot", "Negotiations", "Contracts Out", "Big Projects/ Subdivides",
    // Follow Up Specialist
    "Range Offer - Follow Up", "Hot (Stalled)", "Warm (stalled)",
    "Needs Appt - Unmotivated/ Deal", "Needs Appt - Deal Comeback",
    "Needs Appt - No/Show Reschedule", "New Lead - No Response (Stalled)",
    "Hot (LTFU)", "Warm (LTFU)", "Price Rejected - Close", "Price Rejected - Far",
    "Archive - At Market", "Archive - Over Market",
    "Not Ready To Sell - LTFU", "Archive - Dead Lead", "Remove From List - LTFU",
    // Comper
    "Motivated", "Unmotivated", "Mail - Not Interested", "Lead - Value Add", "Comp Bucket - Misc",
    // Dispositions
    "Realtor Opinions/ DD", "Sold", "Under Contract", "Realtor Leads (commissions)", "Deal Revival",
  ],

  // ── Stages to EXCLUDE from pipeline view (bulk imports, generic) ────────────
  EXCLUDE_STAGES: ["Lead", "New Lead", ""],

  // ── Smart List Collections ──────────────────────────────────────────────────
  COLLECTIONS: {
    comper: {
      label: "Comper", color: "#5a8ab0",
      stages: ["Motivated","Unmotivated","Mail - Not Interested","Lead - Value Add","Comp Bucket - Misc"],
    },
    leadManager: {
      label: "Lead Manager", color: "#e8a84a",
      stages: ["New Leads [TEXT]","New Leads [MAIL]","New Lead - No Response","Unmotivated - Price Request","Call - Remove From List"],
    },
    acquisition: {
      label: "Acquisition", color: "#00e5a0",
      stages: ["Booked Appt","Warm","Hot","Negotiations","Contracts Out","Big Projects/ Subdivides"],
    },
    followUpSpecialist: {
      label: "Follow Up Specialist", color: "#7c6eff",
      stages: [
        "Range Offer - Follow Up","Hot (Stalled)","Warm (stalled)",
        "Needs Appt - Unmotivated/ Deal","Needs Appt - Deal Comeback",
        "Needs Appt - No/Show Reschedule","New Lead - No Response (Stalled)",
        "Hot (LTFU)","Warm (LTFU)","Price Rejected - Close","Price Rejected - Far",
        "Archive - At Market","Archive - Over Market",
        "Not Ready To Sell - LTFU","Archive - Dead Lead","Remove From List - LTFU",
      ],
    },
    dispositions: {
      label: "Dispositions", color: "#ff6b35",
      stages: ["Realtor Opinions/ DD","Sold","Under Contract","Realtor Leads (commissions)","Deal Revival"],
    },
  },

  // ── Motivation map ──────────────────────────────────────────────────────────
  MOTIVATION: {
    "Motivated":"hot","Hot":"hot","Hot (Stalled)":"hot","Hot (LTFU)":"hot",
    "Booked Appt":"hot","Negotiations":"hot","Contracts Out":"hot",
    "Under Contract":"hot","Needs Appt - Deal Comeback":"hot","Deal Revival":"hot",
    "Warm":"warm","Warm (stalled)":"warm","Warm (LTFU)":"warm",
    "Lead - Value Add":"warm","Range Offer - Follow Up":"warm",
    "Needs Appt - Unmotivated/ Deal":"warm","Needs Appt - No/Show Reschedule":"warm",
    "Unmotivated - Price Request":"warm","Realtor Opinions/ DD":"warm",
    "Big Projects/ Subdivides":"warm","Realtor Leads (commissions)":"warm",
    "Not Ready To Sell - LTFU":"nurture","Price Rejected - Close":"nurture",
    "Price Rejected - Far":"nurture","Archive - At Market":"nurture",
    "Archive - Over Market":"nurture","New Lead - No Response":"nurture",
    "New Lead - No Response (Stalled)":"nurture",
    "New Leads [TEXT]":"nurture","New Leads [MAIL]":"nurture",
    "Unmotivated":"cold","Mail - Not Interested":"cold","Comp Bucket - Misc":"cold",
    "Call - Remove From List":"cold","Archive - Dead Lead":"cold",
    "Remove From List - LTFU":"cold","Sold":"cold",
    // Generic bulk stages — exclude from motivation
    "Lead":"cold","New Lead":"cold",
  },

  // ── Concerns keywords ───────────────────────────────────────────────────────
  CONCERNS: {
    "Price too low":       ["too low","not enough","below market","higher offer","highest bidder","per acre","$12,000","$15,000","$16,000"],
    "Not ready to sell":   ["not ready","not sure when","future","eventually","someday","ltfu","thinking about it"],
    "Has other offers":    ["other offer","other buyer","other interest","multiple offer","bidding","competing"],
    "Needs more time":     ["need time","give me time","call back","follow up later","check back","not yet"],
    "Price rejected":      ["price rejected","too far","not close","rejected","won't work","can't accept"],
    "At / over market":    ["at market","over market","retail","listed","mls","realtor","listing"],
    "Financing concern":   ["financing","mortgage","loan","cash only","pre-approval","qualify","lender"],
    "Market concern":      ["market","rates","interest rate","prices dropping","wait"],
    "Has agent":           ["my agent","my realtor","already listed","working with","other agent"],
  },
};
