# FUB Sales Dashboard

Live sales dashboard for real estate teams — Follow Up Boss data + Claude AI coaching.

## Why a proxy?

Follow Up Boss blocks direct browser API calls (CORS). This project includes a Vercel serverless function (`api/fub.js`) that proxies all requests server-side. Your API key never touches the browser, and CORS is bypassed entirely.

```
Browser → /api/fub (Vercel) → api.followupboss.com
```

---

## Setup in 3 steps

### Step 1 — Register your system with FUB (free, one-time)

FUB requires every integration to register a "system" so they can track API usage.

1. Go to: https://followupboss.com/2/register.pl
2. Fill in your app name (e.g. "My Sales Dashboard") and your email
3. You'll receive an **X-System** name and **X-System-Key** — save these

### Step 2 — Deploy to Vercel

```bash
# Clone or download this repo, then:
npm install

# Push to GitHub
git init && git add . && git commit -m "init"
# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/fub-dashboard.git
git push -u origin main
```

Then:
1. Go to vercel.com → sign in with GitHub
2. Click **Add New → Project** → import your repo
3. Before deploying, click **Environment Variables** and add:

| Variable | Value |
|---|---|
| `FUB_SYSTEM_NAME` | Your X-System name from Step 1 |
| `FUB_SYSTEM_KEY` | Your X-System-Key from Step 1 |

4. Click **Deploy**

### Step 3 — Open your dashboard

1. Go to your Vercel URL (e.g. `https://fub-dashboard.vercel.app`)
2. Paste your FUB API key in the sidebar (FUB → Admin → API → copy key)
3. Click **Connect** — data loads instantly

---

## Run locally

```bash
# Set env vars for local dev
echo 'FUB_SYSTEM_NAME=SalesDashboard' >> .env.local
echo 'FUB_SYSTEM_KEY=your_system_key' >> .env.local

# Start local server (required — proxy needs a server)
npx vercel dev
```

Open `http://localhost:3000`. Do NOT open `index.html` directly — the proxy won't work without a server.

---

## Finding your FUB API key

FUB → Admin → API & Integrations → API Key

The key starts with `fka_`. Never commit it to git — always enter it in the UI.

---

## Project structure

```
fub-dashboard/
├── index.html          # Main app (pure HTML, no build step)
├── api/
│   └── fub.js          # Vercel proxy — handles auth + CORS
├── css/
│   └── styles.css
├── js/
│   ├── config.js       # Thresholds, settings
│   ├── fub.js          # Data layer (calls proxy)
│   ├── charts.js       # Chart.js rendering
│   ├── ai.js           # Claude AI coaching
│   └── dashboard.js    # Main controller
├── .env.example        # Copy to .env.local for local dev
├── vercel.json
├── package.json
└── README.md
```

---

## Customising

`js/config.js` — adjust speed thresholds, lookback window, motivation score cutoffs.

`js/fub.js` → `parseConcerns()` — add/remove objection keywords for your market.

`js/ai.js` → `SYSTEM_PROMPT` — customise the AI coaching voice and focus areas.

---

## Tech stack

Vanilla HTML/CSS/JS · Vercel serverless · Chart.js 4.4 · Claude API · Follow Up Boss API v1 · DM Sans + DM Mono

## License

MIT
