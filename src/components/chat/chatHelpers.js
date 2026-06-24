// ─────────────────────────────────────────────────────────────────────────────
// chatHelpers.js — pure utility functions shared across chat components
// No React, no imports needed — just plain JS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * formatTimeAgo
 * Converts a Unix timestamp (ms) to a human-readable "time ago" string.
 *
 * Examples:
 *   formatTimeAgo(Date.now() - 30000)   → "just now"
 *   formatTimeAgo(Date.now() - 300000)  → "5m ago"
 *   formatTimeAgo(Date.now() - 7200000) → "2h ago"
 */
export const formatTimeAgo = (timestamp) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now  = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  if (diffInSeconds < 60) return "just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  return `${Math.floor(diffInHours / 24)}d ago`;
};

/**
 * formatDuration
 * Converts a duration in seconds to MM:SS format.
 *
 * Examples:
 *   formatDuration(65)  → "01:05"
 *   formatDuration(3)   → "00:03"
 *   formatDuration(130) → "02:10"
 */
export const formatDuration = (seconds) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};
