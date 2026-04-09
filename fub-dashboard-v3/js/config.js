/**
 * config.js
 * ─────────────────────────────────────────────
 * All configurable settings for the dashboard.
 *
 * API key: enter it in the UI sidebar — never hardcode here.
 * When running locally with `vercel dev`, calls go to /api/fub.
 * When deployed on Vercel, calls still go to /api/fub (same path).
 */

const CONFIG = {
  // Proxy endpoint — do not change this.
  // When deployed to Vercel this resolves to your serverless function.
  PROXY_URL: "/api/fub",

  // Days of history to pull and display
  LOOKBACK_DAYS: 7,

  // Speed to dial thresholds (minutes)
  SPEED_EXCELLENT: 5,   // green
  SPEED_GOOD: 60,       // yellow — anything over is red

  // Motivation scoring from FUB lead score (0–100)
  HOT_SCORE: 80,
  WARM_SCORE: 50,

  // Claude model for AI coaching
  CLAUDE_MODEL: "claude-sonnet-4-20250514",
};
