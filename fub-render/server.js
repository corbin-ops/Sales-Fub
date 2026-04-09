const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Serve all dashboard files from /public
app.use(express.static(path.join(__dirname, "public")));

// FUB API proxy — solves CORS, keeps auth server-side
app.get("/api/fub", async (req, res) => {
  const apiKey = req.headers["x-fub-key"];
  if (!apiKey) return res.status(400).json({ error: "Missing x-fub-key header" });

  const fubPath = req.query.path;
  if (!fubPath) return res.status(400).json({ error: "Missing ?path= param" });

  const authToken = Buffer.from(apiKey + ":").toString("base64");
  const systemName = process.env.FUB_SYSTEM_NAME || "SalesDashboard";
  const systemKey  = process.env.FUB_SYSTEM_KEY  || "";

  try {
    const response = await fetch(`https://api.followupboss.com/v1/${fubPath}`, {
      headers: {
        "Authorization": `Basic ${authToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-System": systemName,
        ...(systemKey && { "X-System-Key": systemKey }),
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.errorMessage || data.error || `FUB error ${response.status}`,
        details: data,
      });
    }

    res.setHeader("Cache-Control", "no-cache");
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: "Proxy error: " + err.message });
  }
});

// Fallback — serve index.html for any unmatched route
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`FUB Dashboard running on http://localhost:${PORT}`);
});
