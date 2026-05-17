// Centralized API URL builder + build identifier.
//
// Why this exists: the production frontend is deployed to GitHub Pages
// at `gasless.khurk.xyz`, but the API server lives on Replit. In dev,
// both run on the same origin and `/api/...` works as a relative path.
// In production we need to point at the absolute backend URL.
//
// Set `VITE_API_BASE_URL` at build time (no trailing slash). Examples:
//   - dev/preview:  unset → relative paths
//   - GH Pages prod: VITE_API_BASE_URL=https://gasless-api.<your>.replit.app
//
// __BUILD_ID__ is injected by Vite from the current git short SHA at
// build time. Useful for cross-agent issue tracking — paste the build
// id in any bug report so both AI builders know exactly which commit
// the user is running.

declare const __BUILD_ID__: string;
declare const __BUILD_TIME__: string;

const RAW_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
const API_BASE = RAW_BASE.endsWith("/") ? RAW_BASE.slice(0, -1) : RAW_BASE;

/** Build an API URL. `path` should start with `/api/...`. */
export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
}

/** Short git SHA of the build, e.g. "811713e". Visible in Settings → About. */
export const BUILD_ID: string =
  typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";

/** ISO timestamp the build was produced. */
export const BUILD_TIME: string =
  typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : "dev";
